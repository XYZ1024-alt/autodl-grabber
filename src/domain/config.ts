import {
  array,
  fallback,
  finite,
  type InferOutput,
  integer,
  maxValue,
  minLength,
  minValue,
  number,
  object,
  picklist,
  pipe,
  safeParse,
  string,
} from 'valibot'
import type { Criteria } from './select'
import type { Catalog, Image, Region } from './types'
import { gbToBytes, yuanToMilli } from './units'

export const MIN_INTERVAL_SEC = 10
export const MAX_INTERVAL_SEC = 3600

/** What the panel edits and what is persisted. Every field falls back to a default, so it always parses. */
export const DraftSchema = object({
  gpuNames: fallback(array(string()), []),
  gpuCount: fallback(number(), 1),
  /** Region ids in priority order. */
  regionIds: fallback(array(string()), []),
  /** Price cap of the whole instance per hour, in CNY. 0 means "not set yet". */
  maxHourlyYuan: fallback(number(), 0),
  imageKind: fallback(picklist(['official', 'private']), 'official'),
  imageUuid: fallback(string(), ''),
  /** Extra paid data disk in GB on top of the free data disk. 0 means no expansion. */
  expandGb: fallback(number(), 0),
  intervalSec: fallback(number(), 30),
})

export type Draft = InferOutput<typeof DraftSchema>

export const defaultDraft = (): Draft => ({
  gpuNames: [],
  gpuCount: 1,
  regionIds: [],
  maxHourlyYuan: 0,
  imageKind: 'official',
  imageUuid: '',
  expandGb: 0,
  intervalSec: 30,
})

/**
 * The rules a draft must meet before a task may start. The data disk rules mirror the create page:
 * a whole number of GB, at least 0, with an upper bound that depends on the host and is therefore
 * checked per host when selecting one.
 */
const ConfigSchema = object({
  gpuNames: pipe(array(string()), minLength(1, '请至少选择一个 GPU 型号')),
  gpuCount: pipe(
    number('GPU 数量必须是数字'),
    integer('GPU 数量必须是整数'),
    minValue(1, 'GPU 数量至少为 1'),
    maxValue(12, 'GPU 数量最多为 12'),
  ),
  regionIds: pipe(array(string()), minLength(1, '请至少选择一个地区')),
  maxHourlyYuan: pipe(
    number('每小时价格上限必须是数字'),
    finite('每小时价格上限必须是数字'),
    minValue(0.01, '请填写大于 0 的每小时价格上限'),
  ),
  imageKind: picklist(['official', 'private']),
  imageUuid: pipe(string(), minLength(1, '请选择镜像')),
  expandGb: pipe(
    number('扩容大小必须是数字'),
    integer('扩容大小必须是整数 GB（步长 1 GB）'),
    minValue(0, '扩容大小不能小于 0 GB'),
  ),
  intervalSec: pipe(
    number('监测间隔必须是数字'),
    integer('监测间隔必须是整数秒'),
    minValue(MIN_INTERVAL_SEC, `监测间隔不能小于 ${MIN_INTERVAL_SEC} 秒`),
    maxValue(MAX_INTERVAL_SEC, `监测间隔不能大于 ${MAX_INTERVAL_SEC} 秒`),
  ),
})

/** Everything one task needs, resolved against the catalog at the moment the user starts it. */
export type Plan = {
  gpuNames: string[]
  gpuCount: number
  /** Selected regions in priority order. */
  regions: Region[]
  maxHourlyMilli: number
  image: Image
  expandGb: number
  intervalMs: number
  criteria: Criteria
}

export type PlanResult = { ok: true; plan: Plan } | { ok: false; errors: string[] }

export const buildPlan = (draft: Draft, catalog: Catalog): PlanResult => {
  const parsed = safeParse(ConfigSchema, draft)
  if (!parsed.success) return { ok: false, errors: [...new Set(parsed.issues.map((issue) => issue.message))] }
  const config = parsed.output
  const errors: string[] = []

  const knownGpus = new Set(catalog.gpuTypes.map((gpu) => gpu.name))
  const missingGpus = config.gpuNames.filter((name) => !knownGpus.has(name))
  if (missingGpus.length > 0) errors.push(`GPU 型号已不存在：${missingGpus.join('、')}，请重新选择`)

  const regions = config.regionIds.flatMap((id) => catalog.regions.filter((region) => region.id === id))
  if (regions.length !== config.regionIds.length) errors.push('部分所选地区已不存在，请重新选择地区')

  const images = config.imageKind === 'official' ? catalog.officialImages : catalog.privateImages
  const image = images.find((candidate) => candidate.uuid === config.imageUuid)
  if (image === undefined) errors.push('所选镜像已不存在，请重新选择镜像')

  if (image === undefined || errors.length > 0) return { ok: false, errors }

  const maxHourlyMilli = yuanToMilli(config.maxHourlyYuan)
  return {
    ok: true,
    plan: {
      gpuNames: config.gpuNames,
      gpuCount: config.gpuCount,
      regions,
      maxHourlyMilli,
      image,
      expandGb: config.expandGb,
      intervalMs: config.intervalSec * 1000,
      criteria: {
        gpuNames: config.gpuNames,
        gpuCount: config.gpuCount,
        regionSigns: regions.flatMap((region) => region.signs),
        maxHourlyMilli,
        expandBytes: gbToBytes(config.expandGb),
        image,
        memberLevel: catalog.memberLevel,
        gpuSeries: Object.fromEntries(catalog.gpuTypes.map((gpu) => [gpu.name, gpu.series])),
      },
    },
  }
}
