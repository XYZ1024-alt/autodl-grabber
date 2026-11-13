import {
  array,
  boolean,
  type GenericSchema,
  type InferOutput,
  lazy,
  nullable,
  nullish,
  number,
  object,
  optional,
  record,
  string,
  union,
} from 'valibot'
import type { GpuType, Image, Instance, Machine, PriceQuote, Region } from '../domain/types'

// Shapes of AutoDL responses, limited to the fields this script reads, and their mapping into the
// domain types. Everything about field names and platform encodings lives in this file.

export const RegionList = object({
  region_list: array(
    object({
      region_sign: string(),
      region_name: string(),
      data_center: string(),
      used_for: nullish(string(), 'all'),
      visible: nullish(string(), 'all'),
    }),
  ),
})

/** Regions the market page never lists. "wave-A" also has special terms the create page asks to confirm. */
const HIDDEN_REGION_SIGNS = ['wave-A', 'shenzhen-A']

/**
 * Groups region signs the way the market page does: one entry per data center.
 * Regions for deployments, for enterprise accounts only, or hidden by the page are left out.
 */
export const toRegions = (raw: InferOutput<typeof RegionList>): Region[] => {
  const regions = new Map<string, Region>()
  for (const item of raw.region_list) {
    if (item.used_for !== 'all' || item.visible !== 'all' || HIDDEN_REGION_SIGNS.includes(item.region_sign))
      continue
    const region = regions.get(item.data_center) ?? {
      id: item.data_center,
      name: item.region_name,
      signs: [],
    }
    region.signs.push(item.region_sign)
    regions.set(item.data_center, region)
  }
  return [...regions.values()]
}

export const GpuTypeList = array(
  object({
    gpu_name: string(),
    chip_corp: nullish(string(), ''),
    cpu_arch: nullish(string(), ''),
    gpu_series_type: nullish(string(), ''),
  }),
)

export const toGpuTypes = (raw: InferOutput<typeof GpuTypeList>): GpuType[] =>
  raw.map((item) => ({
    name: item.gpu_name,
    chipCorp: item.chip_corp,
    cpuArch: item.cpu_arch,
    series: item.gpu_series_type,
  }))

export const MemberDetail = object({ member_level: string() })

/** One entry per GPU model: { "RTX 4090": { idle_gpu_num, total_gpu_num } }. */
export const RegionGpuIdle = nullish(array(record(string(), object({ idle_gpu_num: number() }))), [])

/** Idle GPUs by model name. The market page shows a negative count as 0. */
export const toIdleByGpu = (raw: InferOutput<typeof RegionGpuIdle>): Record<string, number> =>
  Object.fromEntries(
    raw.flatMap((row) => Object.entries(row).map(([name, value]) => [name, Math.max(value.idle_gpu_num, 0)])),
  )

const ImageLeaf = object({ uuid: string(), v: string(), chip_corp: string(), cpu_arch: string() })

type ImageNode = { label_name: string | InferOutput<typeof ImageLeaf>; children?: ImageNode[] | null }

const ImageNode: GenericSchema<ImageNode> = object({
  label_name: union([string(), ImageLeaf]),
  children: optional(nullable(array(lazy(() => ImageNode)))),
})

export const OfficialImageTree = array(ImageNode)

/** The tree is framework / framework version / Python version / leaf with the image id. */
export const toOfficialImages = (nodes: ImageNode[], trail: string[] = []): Image[] =>
  nodes.flatMap((node) => {
    if (typeof node.label_name === 'string')
      return toOfficialImages(node.children ?? [], [...trail, node.label_name])
    const leaf = node.label_name
    const runtime = leaf.chip_corp === 'nvidia' ? `CUDA ${leaf.v}` : `${leaf.chip_corp} ${leaf.v}`
    return [
      {
        kind: 'official' as const,
        uuid: leaf.uuid,
        label: [...trail, runtime].join(' / '),
        cuda: leaf.v,
        chipCorp: leaf.chip_corp,
        cpuArch: leaf.cpu_arch,
      },
    ]
  })

export const PrivateImageList = nullish(
  array(
    object({
      image_uuid: string(),
      name: string(),
      cuda_v: nullish(union([string(), number()]), ''),
      chip_corp: nullish(string(), ''),
      cpu_arch: nullish(string(), ''),
    }),
  ),
  [],
)

export const toPrivateImages = (raw: InferOutput<typeof PrivateImageList>): Image[] =>
  raw.map((item) => ({
    kind: 'private' as const,
    uuid: item.image_uuid,
    label: item.name,
    cuda: String(item.cuda_v),
    chipCorp: item.chip_corp,
    cpuArch: item.cpu_arch,
  }))

const RawMachine = object({
  machine_id: string(),
  machine_alias: nullish(string(), ''),
  region_sign: string(),
  region_name: nullish(string(), ''),
  gpu_name: string(),
  gpu_number: number(),
  gpu_idle_num: number(),
  on_line: number(),
  max_instance_num: number(),
  binding_instance_num: number(),
  payg: boolean(),
  payg_price: number(),
  machine_sku_info: nullish(
    array(
      object({
        type: string(),
        level_config: nullish(array(object({ level_name: string(), discounted_price: number() })), []),
      }),
    ),
    [],
  ),
  chip_corp: nullish(string(), ''),
  cpu_arch: nullish(string(), ''),
  highest_cuda_version: nullish(string(), ''),
  rent_mode: nullish(string(), ''),
  max_instance_disk_size: number(),
  max_data_disk_expand_size: number(),
  data_disk_expand_price: object({ daily_price: number() }),
})

export const MachinePage = object({
  list: nullish(array(RawMachine), []),
  result_total: number(),
  max_page: number(),
})

/** on_line values the market page renders as "已租完". */
const SOLD_OUT_STATES = [3, 4, 5, 6]

export const toMachine = (raw: InferOutput<typeof RawMachine>): Machine => {
  const rentable =
    raw.payg && !SOLD_OUT_STATES.includes(raw.on_line) && raw.max_instance_num > raw.binding_instance_num
  const paygSku = raw.machine_sku_info.find((sku) => sku.type === 'payg')
  return {
    id: raw.machine_id,
    alias: raw.machine_alias,
    regionSign: raw.region_sign,
    regionName: raw.region_name,
    gpuName: raw.gpu_name,
    gpuTotal: raw.gpu_number,
    gpuIdle: rentable ? Math.max(raw.gpu_idle_num, 0) : 0,
    chipCorp: raw.chip_corp,
    cpuArch: raw.cpu_arch,
    highestCuda: raw.highest_cuda_version,
    rentMode: raw.rent_mode,
    hourlyMilli: raw.payg_price,
    hourlyMilliByLevel: Object.fromEntries(
      (paygSku?.level_config ?? []).map((level) => [level.level_name, level.discounted_price]),
    ),
    freeDiskBytes: raw.max_instance_disk_size,
    maxExpandBytes: raw.max_data_disk_expand_size,
    diskDailyMilliPerGb: raw.data_disk_expand_price.daily_price,
  }
}

export const PricePreview = object({
  payg_price: number(),
  origin_price: number(),
  expand_data_disk: number(),
  data_disk_info: object({ data_disk_deal_daily_price: number() }),
})

export const toPriceQuote = (raw: InferOutput<typeof PricePreview>): PriceQuote => ({
  hourlyMilli: raw.payg_price,
  originHourlyMilli: raw.origin_price,
  expandBytes: raw.expand_data_disk,
  diskDailyMilli: raw.data_disk_info.data_disk_deal_daily_price,
})

const RawInstance = object({
  uuid: string(),
  machine_id: string(),
  region_name: nullish(string(), ''),
  snapshot_gpu_alias_name: nullish(string(), ''),
  req_gpu_amount: nullish(number(), 0),
  status: string(),
  charge_type: nullish(string(), ''),
  payg_price: nullish(number(), 0),
  expand_data_disk_size: number(),
  usage_info: nullish(object({ data_disk_total_size: nullish(number(), 0) }), { data_disk_total_size: 0 }),
  created_at: nullish(string(), ''),
})

export const InstancePage = object({ list: nullish(array(RawInstance), []) })

export const toInstance = (raw: InferOutput<typeof RawInstance>): Instance => ({
  uuid: raw.uuid,
  machineId: raw.machine_id,
  regionName: raw.region_name,
  gpuName: raw.snapshot_gpu_alias_name,
  gpuCount: raw.req_gpu_amount,
  status: raw.status,
  chargeType: raw.charge_type,
  hourlyMilli: raw.payg_price,
  expandBytes: raw.expand_data_disk_size,
  dataDiskTotalBytes: raw.usage_info.data_disk_total_size,
  createdAt: raw.created_at,
})
