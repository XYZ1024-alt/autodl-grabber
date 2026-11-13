import { buildPlan, type Draft, defaultDraft, type Plan } from '../src/domain/config'
import type { Catalog, Machine } from '../src/domain/types'
import { GIB } from '../src/domain/units'
import { MOCK_GPU_TYPES, MOCK_OFFICIAL_IMAGES, MOCK_PRIVATE_IMAGES, MOCK_REGIONS } from './simulator'

export const catalog: Catalog = {
  regions: MOCK_REGIONS,
  gpuTypes: MOCK_GPU_TYPES,
  officialImages: MOCK_OFFICIAL_IMAGES,
  privateImages: MOCK_PRIVATE_IMAGES,
  memberLevel: 'member_user',
}

export const draft = (patch: Partial<Draft> = {}): Draft => ({
  ...defaultDraft(),
  gpuNames: ['RTX 4090'],
  gpuCount: 1,
  regionIds: ['mockDC1', 'mockDC2'],
  maxHourlyYuan: 5,
  imageKind: 'official',
  imageUuid: 'mock-image-pt28',
  expandGb: 100,
  intervalSec: 10,
  ...patch,
})

export const plan = (patch: Partial<Draft> = {}): Plan => {
  const built = buildPlan(draft(patch), catalog)
  if (!built.ok) throw new Error(`invalid test plan: ${built.errors.join('; ')}`)
  return built.plan
}

export const host = (patch: Partial<Machine> = {}): Machine => ({
  id: 'host-1',
  alias: 'A1机',
  regionSign: 'mock-a1',
  regionName: '模拟一区',
  gpuName: 'RTX 4090',
  gpuTotal: 8,
  gpuIdle: 2,
  chipCorp: 'nvidia',
  cpuArch: 'x86',
  highestCuda: '12.8',
  rentMode: '',
  hourlyMilli: 2000,
  hourlyMilliByLevel: { normal_user: 2000, member_user: 1900 },
  freeDiskBytes: 50 * GIB,
  maxExpandBytes: 500 * GIB,
  diskDailyMilliPerGb: 7,
  ...patch,
})
