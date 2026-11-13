import { fail, ok } from '../src/domain/result'
import type { GpuType, Image, Instance, Machine, Region } from '../src/domain/types'
import { GIB } from '../src/domain/units'
import type { AutodlApi, PendingCreate, PendingCreateStore } from '../src/ports'

export type MockScenario =
  | 'success'
  | 'timeout-created'
  | 'timeout-lost'
  | 'sold-out-race'
  | 'expand-shrinks'
  | 'expand-ignored'
  | 'price-jump'
  | 'auth-expired'
  | 'balance'
  | 'rate-limit'

export type MockOptions = {
  scenario: MockScenario
  /** Polls that see no idle GPU before hosts become available. */
  soldOutPolls: number
  /** Simulated latency of every call. */
  latencyMs: number
}

export type MockApi = AutodlApi & {
  /** Resets the simulated platform and applies the options. */
  configure: (options: MockOptions) => void
  calls: { countIdleGpus: number; listMachines: number; createInstance: number }
}

const MEMBER_LEVEL = 'member_user'
const MEMBER_DISCOUNT = 0.95
const DISK_DAILY_MILLI_PER_GB = 7

export const MOCK_REGIONS: Region[] = [
  { id: 'mockDC1', name: '模拟一区', signs: ['mock-a1', 'mock-a2'] },
  { id: 'mockDC2', name: '模拟二区', signs: ['mock-b1'] },
]

export const MOCK_GPU_TYPES: GpuType[] = [
  { name: 'RTX 4090', chipCorp: 'nvidia', cpuArch: 'x86', series: 'NVIDIA-Ada' },
  { name: 'RTX 5090', chipCorp: 'nvidia', cpuArch: 'x86', series: 'NVIDIA-Blackwell' },
  { name: 'RTX 3090', chipCorp: 'nvidia', cpuArch: 'x86', series: 'NVIDIA-Ampere' },
]

const image = (kind: Image['kind'], uuid: string, label: string, cuda: string): Image => ({
  kind,
  uuid,
  label,
  cuda,
  chipCorp: 'nvidia',
  cpuArch: 'x86',
})

export const MOCK_OFFICIAL_IMAGES: Image[] = [
  image('official', 'mock-image-pt28', 'PyTorch / 2.8.0 / 3.12(ubuntu22.04) / CUDA 12.8', '12.8'),
  image('official', 'mock-image-pt21', 'PyTorch / 2.1.0 / 3.10(ubuntu22.04) / CUDA 12.1', '12.1'),
  image('official', 'mock-image-pt111', 'PyTorch / 1.11.0 / 3.8(ubuntu20.04) / CUDA 11.3', '11.3'),
]

export const MOCK_PRIVATE_IMAGES: Image[] = [
  image('private', 'mock-private-1', '我的训练环境（模拟）', '12.1'),
]

const machine = (
  id: string,
  regionSign: string,
  gpuName: string,
  gpuIdle: number,
  hourlyMilli: number,
  maxExpandGb: number,
  highestCuda: string,
): Machine => ({
  id,
  alias: `${id.slice(-2).toUpperCase()}机`,
  regionSign,
  regionName: MOCK_REGIONS.find((region) => region.signs.includes(regionSign))?.name ?? '',
  gpuName,
  gpuTotal: 8,
  gpuIdle,
  chipCorp: 'nvidia',
  cpuArch: 'x86',
  highestCuda,
  rentMode: '',
  hourlyMilli,
  hourlyMilliByLevel: { normal_user: hourlyMilli, [MEMBER_LEVEL]: Math.round(hourlyMilli * MEMBER_DISCOUNT) },
  freeDiskBytes: 50 * GIB,
  maxExpandBytes: maxExpandGb * GIB,
  diskDailyMilliPerGb: DISK_DAILY_MILLI_PER_GB,
})

export const MOCK_MACHINES: Machine[] = [
  machine('mockhost-b1', 'mock-b1', 'RTX 4090', 2, 2000, 500, '12.8'),
  machine('mockhost-a1', 'mock-a1', 'RTX 4090', 1, 2200, 300, '12.8'),
  machine('mockhost-a2', 'mock-a2', 'RTX 5090', 4, 3200, 0, '13.0'),
  machine('mockhost-a3', 'mock-a1', 'RTX 3090', 3, 1300, 1000, '12.4'),
]

const EXISTING_INSTANCE: Instance = {
  uuid: 'mockhost-zz-00000000',
  machineId: 'mockhost-zz',
  regionName: '模拟一区',
  gpuName: 'RTX 3090',
  gpuCount: 1,
  status: 'running',
  chargeType: 'payg',
  hourlyMilli: 1235,
  expandBytes: 0,
  dataDiskTotalBytes: 50 * GIB,
  createdAt: '2026-01-01T00:00:00+08:00',
}

export const createMemoryPending = (): PendingCreateStore => {
  let pending: PendingCreate | null = null
  return {
    load: () => pending,
    save: (next) => {
      pending = next
    },
    clear: () => {
      pending = null
    },
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** A simulated AutoDL. It never touches the network, so it can never cost money. */
export const createMockApi = (): MockApi => {
  let options: MockOptions = { scenario: 'success', soldOutPolls: 2, latencyMs: 150 }
  let instances: Instance[] = [EXISTING_INSTANCE]
  /** Instance list reads left before a new instance reports "running". */
  let bootReads = 0
  const calls = { countIdleGpus: 0, listMachines: 0, createInstance: 0 }

  const latency = () => delay(options.latencyMs)
  const visible = (item: Machine): Machine =>
    calls.countIdleGpus > options.soldOutPolls ? item : { ...item, gpuIdle: 0 }

  const addInstance = (host: Machine, gpuCount: number, expandBytes: number): string => {
    const uuid = `${host.id}-${String(calls.createInstance).padStart(8, '0')}`
    bootReads = 2
    instances = [
      ...instances,
      {
        uuid,
        machineId: host.id,
        regionName: host.regionName,
        gpuName: host.gpuName,
        gpuCount,
        status: 'starting',
        chargeType: 'payg',
        hourlyMilli: (host.hourlyMilliByLevel[MEMBER_LEVEL] ?? host.hourlyMilli) * gpuCount,
        expandBytes,
        dataDiskTotalBytes: host.freeDiskBytes + expandBytes,
        createdAt: new Date().toISOString(),
      },
    ]
    return uuid
  }

  return {
    calls,
    configure: (next) => {
      options = next
      instances = [EXISTING_INSTANCE]
      bootReads = 0
      calls.countIdleGpus = 0
      calls.listMachines = 0
      calls.createInstance = 0
    },

    getSession: () => ({ loggedIn: true, canCreate: true, instanceLimit: 30 }),
    listRegions: async () => ok(MOCK_REGIONS),
    listGpuTypes: async () => ok(MOCK_GPU_TYPES),
    getMemberLevel: async () => ok(MEMBER_LEVEL),
    listImages: async (kind) => {
      await latency()
      return ok(kind === 'official' ? MOCK_OFFICIAL_IMAGES : MOCK_PRIVATE_IMAGES)
    },

    countIdleGpus: async (regions) => {
      await latency()
      calls.countIdleGpus += 1
      if (options.scenario === 'auth-expired' && calls.countIdleGpus >= 2)
        return fail('auth', '', 'AuthorizeFailed')
      if (options.scenario === 'rate-limit' && (calls.countIdleGpus === 2 || calls.countIdleGpus === 3))
        return fail('rate-limit', 'HTTP 429', '429')
      return ok(
        regions.flatMap((region) =>
          MOCK_GPU_TYPES.map((gpu) => ({
            regionId: region.id,
            gpuName: gpu.name,
            idle: MOCK_MACHINES.filter(
              (item) => region.signs.includes(item.regionSign) && item.gpuName === gpu.name,
            )
              .map(visible)
              .reduce((sum, item) => sum + item.gpuIdle, 0),
          })),
        ),
      )
    },

    listMachines: async ({ regionSigns, gpuNames }) => {
      await latency()
      calls.listMachines += 1
      const machines = MOCK_MACHINES.filter(
        (item) => regionSigns.includes(item.regionSign) && gpuNames.includes(item.gpuName),
      ).map(visible)
      return ok({ machines, total: machines.length, complete: true })
    },

    getMachine: async (machineId) => {
      await latency()
      const found = MOCK_MACHINES.find((item) => item.id === machineId)
      if (found === undefined) return ok(null)
      return ok(
        options.scenario === 'expand-shrinks'
          ? { ...visible(found), maxExpandBytes: 10 * GIB }
          : visible(found),
      )
    },

    isMachineOnline: async () => {
      await latency()
      return ok(true)
    },

    countInstances: async () => {
      await latency()
      return ok(instances.length)
    },

    previewPrice: async ({ machineId, gpuCount, expandBytes }) => {
      await latency()
      const host = MOCK_MACHINES.find((item) => item.id === machineId)
      if (host === undefined) return fail('rejected', '主机不存在', 'RecordNotFoundError')
      const hourly = (host.hourlyMilliByLevel[MEMBER_LEVEL] ?? host.hourlyMilli) * gpuCount
      return ok({
        hourlyMilli: options.scenario === 'price-jump' ? hourly * 3 : hourly,
        originHourlyMilli: host.hourlyMilli * gpuCount,
        expandBytes,
        diskDailyMilli: Math.round((expandBytes / GIB) * DISK_DAILY_MILLI_PER_GB * MEMBER_DISCOUNT),
      })
    },

    createInstance: async ({ machineId, gpuCount, expandBytes }) => {
      await latency()
      calls.createInstance += 1
      const host = MOCK_MACHINES.find((item) => item.id === machineId)
      if (host === undefined) return fail('rejected', '主机不存在', 'RecordNotFoundError')
      switch (options.scenario) {
        case 'timeout-created':
          addInstance(host, gpuCount, expandBytes)
          return fail('ambiguous', '请求未完成（超过 30 秒未响应）')
        case 'timeout-lost':
          return fail('ambiguous', '请求未完成（超过 30 秒未响应）')
        case 'sold-out-race':
          if (calls.createInstance === 1)
            return fail('sold-out', '该主机空闲GPU数量不足', 'MachineGpuNumUpdateFailed')
          return ok(addInstance(host, gpuCount, expandBytes))
        case 'balance':
          return fail('balance', '余额不足', 'TORecharge')
        case 'expand-ignored':
          return ok(addInstance(host, gpuCount, 0))
        default:
          return ok(addInstance(host, gpuCount, expandBytes))
      }
    },

    listInstances: async () => {
      await latency()
      if (instances.length > 1) {
        if (bootReads > 0) bootReads -= 1
        else
          instances = instances.map((item) =>
            item.status === 'starting' ? { ...item, status: 'running' } : item,
          )
      }
      return ok(instances)
    },
  }
}
