import { describe, expect, it } from 'vitest'
import { rejectionReason, rentModeAllows, selectMachines } from '../src/domain/select'
import { GIB } from '../src/domain/units'
import { host, plan } from './fixtures'

const criteria = plan().criteria

describe('rejectionReason', () => {
  it('accepts a host that meets every criterion', () => {
    expect(rejectionReason(host(), criteria)).toBeNull()
  })

  it.each([
    ['another GPU model', { gpuName: 'RTX 3090' }, 'GPU 型号'],
    ['a region that was not selected', { regionSign: 'elsewhere' }, '地区'],
    ['no idle GPU', { gpuIdle: 0 }, '空闲 GPU 不足'],
    ['a price above the cap', { hourlyMilliByLevel: { member_user: 5001 } }, '超过上限'],
    ['too little room for the expansion', { maxExpandBytes: 99 * GIB }, '可扩容上限 99 GB'],
    ['a host CUDA below the image CUDA', { highestCuda: '12.4' }, '高于主机支持的最高版本'],
    ['another CPU architecture', { cpuArch: 'arm' }, '架构不一致'],
    ['a chip without implemented image rules', { chipCorp: 'mthreads' }, '未实现'],
  ])('rejects %s', (_case, patch, fragment) => {
    expect(rejectionReason(host(patch), criteria)).toContain(fragment)
  })

  it('checks an image of unknown architecture by its CUDA version only', () => {
    const unknown = { ...criteria, image: { ...criteria.image, chipCorp: '', cpuArch: '' } }
    expect(rejectionReason(host(), unknown)).toBeNull()
    expect(rejectionReason(host({ highestCuda: '12.4' }), unknown)).toContain('高于主机支持的最高版本')
  })

  it('prices by the member level of the account and by the GPU count', () => {
    const twoCards = plan({ gpuCount: 2, maxHourlyYuan: 3.8 }).criteria
    expect(rejectionReason(host(), twoCards)).toBeNull()
    expect(rejectionReason(host(), { ...twoCards, memberLevel: 'normal_user' })).toContain('超过上限')
  })

  it('accepts an expansion equal to the room the host has left', () => {
    expect(rejectionReason(host({ maxExpandBytes: 100 * GIB }), criteria)).toBeNull()
  })

  it('requires the minimum CUDA version of the GPU series', () => {
    const oldImage = plan({ gpuNames: ['RTX 5090'], imageUuid: 'mock-image-pt21' }).criteria
    expect(rejectionReason(host({ gpuName: 'RTX 5090', highestCuda: '13.0' }), oldImage)).toContain(
      '不低于 12.8',
    )
  })
})

describe('rentModeAllows', () => {
  it('has no restriction without a rent mode', () => {
    expect(rentModeAllows('', 1, 8)).toBe(true)
  })

  it('needs at least N GPUs on a "Base N" host that has N idle', () => {
    expect(rentModeAllows('Base 2', 1, 4)).toBe(false)
    expect(rentModeAllows('Base 2', 3, 4)).toBe(true)
    expect(rentModeAllows('Base 2', 1, 1)).toBe(true)
  })

  it('needs a multiple of N GPUs on a "Unit N" host', () => {
    expect(rentModeAllows('Unit 2', 3, 8)).toBe(false)
    expect(rentModeAllows('Unit 2', 4, 8)).toBe(true)
  })
})

describe('selectMachines', () => {
  it('orders by region priority, then price, then idle GPUs', () => {
    const hosts = [
      host({ id: 'second-region-cheap', regionSign: 'mock-b1', hourlyMilliByLevel: { member_user: 1000 } }),
      host({ id: 'first-region-dear', regionSign: 'mock-a1', hourlyMilliByLevel: { member_user: 3000 } }),
      host({ id: 'first-region-cheap', regionSign: 'mock-a2', hourlyMilliByLevel: { member_user: 1500 } }),
      host({
        id: 'first-region-cheap-more-idle',
        regionSign: 'mock-a2',
        hourlyMilliByLevel: { member_user: 1500 },
        gpuIdle: 6,
      }),
    ]
    expect(selectMachines(hosts, criteria).eligible.map((machine) => machine.id)).toEqual([
      'first-region-dear',
      'first-region-cheap-more-idle',
      'first-region-cheap',
      'second-region-cheap',
    ])
  })

  it('follows the order in which the user ranked the regions', () => {
    const reversed = plan({ regionIds: ['mockDC2', 'mockDC1'] }).criteria
    const hosts = [host({ id: 'one', regionSign: 'mock-a1' }), host({ id: 'two', regionSign: 'mock-b1' })]
    expect(selectMachines(hosts, reversed).eligible.map((machine) => machine.id)).toEqual(['two', 'one'])
  })

  it('reports why each other host was left out', () => {
    const { eligible, rejected } = selectMachines([host(), host({ id: 'full', gpuIdle: 0 })], criteria)
    expect(eligible).toHaveLength(1)
    expect(rejected.map((item) => item.machine.id)).toEqual(['full'])
  })
})
