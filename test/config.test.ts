import { describe, expect, it } from 'vitest'
import { buildPlan } from '../src/domain/config'
import { GIB } from '../src/domain/units'
import { catalog, draft } from './fixtures'

const errorsOf = (patch: Parameters<typeof draft>[0]) => {
  const built = buildPlan(draft(patch), catalog)
  return built.ok ? [] : built.errors
}

describe('buildPlan', () => {
  it('turns a valid draft into a plan', () => {
    const built = buildPlan(draft(), catalog)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.plan.maxHourlyMilli).toBe(5000)
    expect(built.plan.intervalMs).toBe(10_000)
    expect(built.plan.criteria.expandBytes).toBe(100 * GIB)
    expect(built.plan.criteria.regionSigns).toEqual(['mock-a1', 'mock-a2', 'mock-b1'])
  })

  it('treats the expansion as extra size: 0 means no expansion', () => {
    const built = buildPlan(draft({ expandGb: 0 }), catalog)
    expect(built.ok && built.plan.criteria.expandBytes).toBe(0)
  })

  it.each([
    ['a fractional expansion', { expandGb: 10.5 }, '步长 1 GB'],
    ['a negative expansion', { expandGb: -1 }, '不能小于 0'],
    ['an empty expansion', { expandGb: Number.NaN }, '扩容大小必须是数字'],
    ['no GPU model', { gpuNames: [] }, 'GPU 型号'],
    ['zero GPUs', { gpuCount: 0 }, '至少为 1'],
    ['no region', { regionIds: [] }, '地区'],
    ['no price cap', { maxHourlyYuan: 0 }, '价格上限'],
    ['no image', { imageUuid: '' }, '请选择镜像'],
    ['an interval below the minimum', { intervalSec: 5 }, '不能小于 10 秒'],
    ['a GPU model that no longer exists', { gpuNames: ['GTX 1080'] }, '已不存在'],
    ['a region that no longer exists', { regionIds: ['goneDC'] }, '已不存在'],
    ['an image of the other kind', { imageKind: 'private' as const }, '镜像已不存在'],
  ])('rejects %s', (_case, patch, fragment) => {
    expect(errorsOf(patch).join(' ')).toContain(fragment)
  })
})
