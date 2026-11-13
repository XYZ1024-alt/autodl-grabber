import type { Image, Machine } from './types'
import { bytesToGb, formatYuan } from './units'

export type Criteria = {
  gpuNames: string[]
  gpuCount: number
  /** Region signs in priority order: an earlier sign wins. */
  regionSigns: string[]
  /** Price cap for the whole instance per hour, in 1/1000 CNY. */
  maxHourlyMilli: number
  expandBytes: number
  image: Image
  memberLevel: string
  /** GPU series by GPU name ("NVIDIA-Ada"), used for the minimum CUDA rule. */
  gpuSeries: Record<string, string>
}

/** Minimum image CUDA version per GPU series. The create page asks for a confirmation below these. */
const MIN_CUDA_BY_SERIES: Record<string, number> = {
  'NVIDIA-Ampere': 11,
  'NVIDIA-Ada': 11.3,
  'NVIDIA-Blackwell': 12.8,
}

export const unitHourlyMilli = (machine: Machine, memberLevel: string): number =>
  machine.hourlyMilliByLevel[memberLevel] ?? machine.hourlyMilli

/** Mirrors the GPU count options of the create page for "Base N" and "Unit N" hosts. */
export const rentModeAllows = (rentMode: string, count: number, idle: number): boolean => {
  const digits = [...rentMode].filter((char) => char >= '0' && char <= '9').join('')
  if (digits === '') return true
  const size = Number(digits)
  if (idle < size) return true
  return rentMode.startsWith('Base') ? count >= size : count % size === 0
}

const imageMismatch = (machine: Machine, criteria: Criteria): string | null => {
  const { image } = criteria
  if (machine.chipCorp !== 'nvidia') return `芯片 ${machine.chipCorp} 的镜像兼容规则未实现，已跳过`
  // An image that does not say what it was built for is only checked by its CUDA version.
  const differs = (imageValue: string, hostValue: string) => imageValue !== '' && imageValue !== hostValue
  if (differs(image.chipCorp, machine.chipCorp) || differs(image.cpuArch, machine.cpuArch))
    return '镜像与主机的芯片/CPU 架构不一致'
  if (image.cuda === '') return null
  const cuda = Number(image.cuda)
  if (machine.highestCuda !== '' && Number(machine.highestCuda) < cuda)
    return `镜像 CUDA ${image.cuda} 高于主机支持的最高版本 ${machine.highestCuda}`
  const minimum = MIN_CUDA_BY_SERIES[criteria.gpuSeries[machine.gpuName] ?? '']
  if (minimum !== undefined && cuda < minimum) return `该 GPU 架构要求镜像 CUDA 不低于 ${minimum}`
  return null
}

/** Returns null when the host satisfies every criterion, otherwise the reason it does not. */
export const rejectionReason = (machine: Machine, criteria: Criteria): string | null => {
  if (!criteria.gpuNames.includes(machine.gpuName)) return 'GPU 型号不在所选范围'
  if (!criteria.regionSigns.includes(machine.regionSign)) return '地区不在所选范围'
  if (machine.gpuIdle < criteria.gpuCount) return `空闲 GPU 不足（${machine.gpuIdle}/${criteria.gpuCount}）`
  if (!rentModeAllows(machine.rentMode, criteria.gpuCount, machine.gpuIdle))
    return `主机租用规则 ${machine.rentMode} 不允许 ${criteria.gpuCount} 卡`
  if (machine.maxExpandBytes < criteria.expandBytes)
    return `可扩容上限 ${Math.floor(bytesToGb(machine.maxExpandBytes))} GB 小于所需 ${bytesToGb(criteria.expandBytes)} GB`
  const hourly = unitHourlyMilli(machine, criteria.memberLevel) * criteria.gpuCount
  if (hourly > criteria.maxHourlyMilli)
    return `价格 ${formatYuan(hourly)}/时 超过上限 ${formatYuan(criteria.maxHourlyMilli)}/时`
  return imageMismatch(machine, criteria)
}

export type Rejection = { machine: Machine; reason: string }

export type Selection = { eligible: Machine[]; rejected: Rejection[] }

/** Splits hosts into eligible ones, best first, and rejected ones with their reason. */
export const selectMachines = (machines: Machine[], criteria: Criteria): Selection => {
  const eligible: Machine[] = []
  const rejected: Rejection[] = []
  for (const machine of machines) {
    const reason = rejectionReason(machine, criteria)
    if (reason === null) eligible.push(machine)
    else rejected.push({ machine, reason })
  }
  const rank = (machine: Machine) => criteria.regionSigns.indexOf(machine.regionSign)
  const price = (machine: Machine) => unitHourlyMilli(machine, criteria.memberLevel)
  eligible.sort((a, b) => rank(a) - rank(b) || price(a) - price(b) || b.gpuIdle - a.gpuIdle)
  return { eligible, rejected }
}
