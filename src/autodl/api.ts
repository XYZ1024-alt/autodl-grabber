import { nullish, number, object, safeParse, string } from 'valibot'
import { ok } from '../domain/result'
import type { Machine, Session } from '../domain/types'
import type { AutodlApi, IdleCount } from '../ports'
import { type BrowserDeps, createHttp, isSubAccount, type Json, parseJson, STORAGE_KEYS } from './http'
import {
  GpuTypeList,
  InstancePage,
  MachinePage,
  MemberDetail,
  OfficialImageTree,
  PricePreview,
  PrivateImageList,
  RegionGpuIdle,
  RegionList,
  toGpuTypes,
  toIdleByGpu,
  toInstance,
  toMachine,
  toOfficialImages,
  toPriceQuote,
  toPrivateImages,
  toRegions,
} from './wire'

/** Every endpoint this script calls. Paths are the ones the AutoDL front end uses. */
export const ENDPOINTS = {
  common: 'api/v1/common',
  gpuTypes: 'api/v1/machine/gpu_type',
  memberDetail: 'api/v1/user/member/detail',
  officialImages: 'api/v1/image/all',
  privateImages: 'api/v1/image/private/get',
  regionGpuIdle: 'api/v1/machine/region/gpu_type',
  machines: 'api/v1/user/machine/list',
  machineOnline: 'api/v1/machine/check_machine_online',
  instanceCount: 'api/v1/instance/count/v1',
  pricePreview: 'api/v1/order/price/preview',
  createPayg: 'api/v1/order/instance/create/payg',
  instances: 'api/v1/instance',
} as const

const MACHINE_PAGE_SIZE = 100
const INSTANCE_PAGE_SIZE = 100
/** The front end waits 30 seconds for the create request. */
const CREATE_TIMEOUT_MS = 30_000
const DEFAULT_INSTANCE_LIMIT = 50

const StoredUser = object({
  sub_name: nullish(string(), ''),
  instance: nullish(string(), ''),
  instance_limit: nullish(number(), 0),
})

const readSession = (storage: BrowserDeps['storage']): Session => {
  const loggedIn = (storage.getItem(STORAGE_KEYS.token) ?? '') !== ''
  const parsed = parseJson(storage.getItem(STORAGE_KEYS.user) ?? 'null')
  const user = parsed.ok ? safeParse(StoredUser, parsed.value) : null
  if (!user?.success) return { loggedIn, canCreate: loggedIn, instanceLimit: DEFAULT_INSTANCE_LIMIT }
  const { instance, instance_limit } = user.output
  return {
    loggedIn,
    // The create page refuses sub-accounts whose "instance" permission is empty or "no_permission".
    canCreate: !isSubAccount(storage) || (instance !== '' && instance !== 'no_permission'),
    instanceLimit: instance_limit > 0 ? instance_limit : DEFAULT_INSTANCE_LIMIT,
  }
}

/** Filter and paging fields of the host list, with the values the market page sends by default. */
const machineQuery = (overrides: { [key: string]: Json }): Json => ({
  charge_type: 'payg',
  region_sign: '',
  region_sign_list: [],
  gpu_type_name: [],
  machine_tag_name: [],
  gpu_idle_num: 1,
  mount_net_disk: false,
  instance_disk_size_order: '',
  date_range: '',
  date_from: '',
  date_to: '',
  pay_price_order: '',
  gpu_idle_type: '',
  default_order: true,
  cpu_arch: [],
  chip_corp: [],
  page_index: 1,
  page_size: 10,
  ...overrides,
})

export const createAutodlApi = (deps: BrowserDeps): AutodlApi => {
  const http = createHttp(deps)

  return {
    getSession: () => readSession(deps.storage),

    listRegions: async () => {
      const result = await http({ method: 'GET', path: ENDPOINTS.common, data: RegionList })
      return result.ok ? ok(toRegions(result.value)) : result
    },

    listGpuTypes: async () => {
      const result = await http({ method: 'GET', path: ENDPOINTS.gpuTypes, data: GpuTypeList })
      return result.ok ? ok(toGpuTypes(result.value)) : result
    },

    getMemberLevel: async () => {
      const result = await http({ method: 'GET', path: ENDPOINTS.memberDetail, data: MemberDetail })
      return result.ok ? ok(result.value.member_level) : result
    },

    listImages: async (kind) => {
      const body = { cpu_arch: [], chip_corp: [] }
      if (kind === 'official') {
        const result = await http({
          method: 'POST',
          path: ENDPOINTS.officialImages,
          body,
          data: OfficialImageTree,
        })
        return result.ok ? ok(toOfficialImages(result.value)) : result
      }
      const result = await http({
        method: 'POST',
        path: ENDPOINTS.privateImages,
        body,
        data: PrivateImageList,
      })
      return result.ok ? ok(toPrivateImages(result.value)) : result
    },

    // The market page sends one request per region, so this does too, one after the other.
    countIdleGpus: async (regions) => {
      const counts: IdleCount[] = []
      for (const region of regions) {
        const result = await http({
          method: 'POST',
          path: ENDPOINTS.regionGpuIdle,
          body: { region_sign_list: region.signs },
          data: RegionGpuIdle,
        })
        if (!result.ok) return result
        for (const [gpuName, idle] of Object.entries(toIdleByGpu(result.value)))
          counts.push({ regionId: region.id, gpuName, idle })
      }
      return ok(counts)
    },

    // Pages are read one after the other. The platform's order puts most rentable hosts early but not
    // all of them (observed 2026-11-13), and its sort parameters made no difference, so finding every
    // rentable host means reading every page.
    listMachines: async ({ regionSigns, gpuNames, gpuCount, maxPages }) => {
      const machines: Machine[] = []
      let total = 0
      let complete = false
      for (let page = 1; page <= maxPages && !complete; page += 1) {
        const result = await http({
          method: 'POST',
          path: ENDPOINTS.machines,
          body: machineQuery({
            region_sign_list: regionSigns,
            gpu_type_name: gpuNames,
            gpu_idle_num: gpuCount,
            page_index: page,
            page_size: MACHINE_PAGE_SIZE,
          }),
          data: MachinePage,
        })
        if (!result.ok) return result
        machines.push(...result.value.list.map(toMachine))
        total = result.value.result_total
        complete = page >= result.value.max_page
      }
      return ok({ machines, total, complete })
    },

    getMachine: async (machineId, regionSign) => {
      const result = await http({
        method: 'POST',
        path: ENDPOINTS.machines,
        body: machineQuery({ region_sign_list: [regionSign], machine_id: machineId }),
        data: MachinePage,
      })
      if (!result.ok) return result
      const found = result.value.list.find((machine) => machine.machine_id === machineId)
      return ok(found === undefined ? null : toMachine(found))
    },

    isMachineOnline: async (machineId) => {
      const result = await http({
        method: 'POST',
        path: ENDPOINTS.machineOnline,
        body: { machine_id: machineId },
        data: number(),
      })
      // The create page treats 0 and 1 as "host under maintenance".
      return result.ok ? ok(result.value !== 0 && result.value !== 1) : result
    },

    countInstances: () => http({ method: 'GET', path: ENDPOINTS.instanceCount, data: number() }),

    previewPrice: async ({ machineId, gpuCount, expandBytes }) => {
      const result = await http({
        method: 'POST',
        path: ENDPOINTS.pricePreview,
        body: {
          charge_type: 'payg',
          coupon_id_list: [],
          duration: 1,
          expand_data_disk: expandBytes,
          machine_id: machineId,
          num: gpuCount,
        },
        data: PricePreview,
      })
      return result.ok ? ok(toPriceQuote(result.value)) : result
    },

    // The body is the one the create page sends for "基础镜像" / "我的镜像" with pay-as-you-go billing.
    // The data disk expansion is part of this request: expand_data_disk is the extra size in bytes.
    createInstance: ({ machineId, gpuCount, image, expandBytes }) =>
      http({
        method: 'POST',
        path: ENDPOINTS.createPayg,
        body: {
          instance_info: {
            machine_id: machineId,
            charge_type: 'payg',
            req_gpu_amount: gpuCount,
            base_image_uuid: image.kind === 'official' ? image.uuid : '',
            private_image_uuid: image.kind === 'private' ? image.uuid : '',
            reproduction_uuid: '',
            cg_application_uuid: '',
            cg_application_info: { image_name: '', current_version_id: 0, current_version: '', image_id: 0 },
            instance_name: '',
            expand_data_disk: expandBytes,
            reproduction_id: 0,
          },
          price_info: {
            coupon_id_list: [],
            machine_id: machineId,
            charge_type: 'payg',
            duration: 1,
            num: gpuCount,
            expand_data_disk: expandBytes,
          },
        },
        data: string(),
        uncertain: 'ambiguous',
        timeoutMs: CREATE_TIMEOUT_MS,
      }),

    listInstances: async () => {
      const result = await http({
        method: 'POST',
        path: ENDPOINTS.instances,
        body: {
          page_index: 1,
          page_size: INSTANCE_PAGE_SIZE,
          status: [],
          charge_type: [],
          sub_name: '',
          unbind_sub_user: false,
        },
        data: InstancePage,
      })
      return result.ok ? ok(result.value.list.map(toInstance)) : result
    },
  }
}
