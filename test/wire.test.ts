import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  InstancePage,
  MachinePage,
  OfficialImageTree,
  PricePreview,
  RegionList,
  toInstance,
  toMachine,
  toOfficialImages,
  toPriceQuote,
  toRegions,
} from '../src/autodl/wire'

// Response samples as observed on www.autodl.com on 2026-11-13, reduced to a few entries and with
// account-specific values replaced.

const machine = {
  machine_id: '9el52ll8z4',
  machine_alias: '578机',
  region_sign: 'west-E',
  region_name: '西北B区',
  gpu_name: 'vGPU-32GB',
  gpu_number: 8,
  gpu_idle_num: 3,
  on_line: 2,
  max_instance_num: 180,
  binding_instance_num: 130,
  payg: true,
  payg_price: 1660,
  machine_sku_info: [
    {
      type: 'payg',
      current_price: 1660,
      level_config: [
        { discount: 100, discounted_price: 1660, level_name: 'normal_user' },
        { discount: 95, discounted_price: 1577, level_name: 'member_user' },
      ],
    },
    { type: 'daily', current_price: 38650, level_config: [] },
  ],
  chip_corp: 'nvidia',
  cpu_arch: 'x86',
  highest_cuda_version: '12.4',
  rent_mode: '',
  max_instance_disk_size: 53687091200,
  max_data_disk_expand_size: 139586437120,
  data_disk_expand_price: { daily_price: 7, monthly_price: 130 },
  machine_base_info: { cpu_name: 'ignored' },
}

const first = <T>(list: T[]): T => {
  const [item] = list
  if (item === undefined) throw new Error('empty list')
  return item
}

describe('host list', () => {
  const page = (list: object[] | null) => ({ list, result_total: list?.length ?? 0, max_page: 1 })
  const map = (patch: object) => toMachine(first(parse(MachinePage, page([{ ...machine, ...patch }])).list))

  it('maps a host into the domain model', () => {
    expect(map({})).toMatchObject({
      id: '9el52ll8z4',
      regionSign: 'west-E',
      gpuIdle: 3,
      hourlyMilli: 1660,
      hourlyMilliByLevel: { normal_user: 1660, member_user: 1577 },
      freeDiskBytes: 50 * 1024 ** 3,
      maxExpandBytes: 139586437120,
      diskDailyMilliPerGb: 7,
    })
  })

  it.each([
    ['is in a sold-out state', { on_line: 3 }],
    ['has no instance slot left', { binding_instance_num: 180 }],
    ['does not offer pay-as-you-go', { payg: false }],
  ])('reports no idle GPU when the host %s', (_case, patch) => {
    expect(map(patch).gpuIdle).toBe(0)
  })

  it('accepts an empty page', () => {
    expect(parse(MachinePage, page(null)).list).toEqual([])
  })
})

describe('regions', () => {
  it('groups region signs by data center, keeps the order and leaves out restricted regions', () => {
    const raw = parse(RegionList, {
      region_list: [
        {
          region_sign: 'west-B',
          region_name: '西北B区',
          data_center: 'westDC3',
          used_for: 'all',
          visible: 'all',
        },
        {
          region_sign: 'bj-B1',
          region_name: '北京B区',
          data_center: 'beijingDC2',
          used_for: 'all',
          visible: 'all',
        },
        {
          region_sign: 'west-C',
          region_name: '西北B区',
          data_center: 'westDC3',
          used_for: 'all',
          visible: 'all',
        },
        {
          region_sign: 'west-X',
          region_name: '西北企业区',
          data_center: 'westDC2',
          used_for: 'all',
          visible: 'enterprise',
        },
        {
          region_sign: 'dep-A',
          region_name: '部署区',
          data_center: 'depDC1',
          used_for: 'deployment',
          visible: 'all',
        },
      ],
    })
    expect(toRegions(raw)).toEqual([
      { id: 'westDC3', name: '西北B区', signs: ['west-B', 'west-C'] },
      { id: 'beijingDC2', name: '北京B区', signs: ['bj-B1'] },
    ])
  })
})

describe('official images', () => {
  it('flattens the framework tree into selectable images', () => {
    const leaf = (uuid: string, v: string) => ({
      label_name: { chip_corp: 'nvidia', cpu_arch: 'x86', is_desktop: false, uuid, v },
    })
    const tree = parse(OfficialImageTree, [
      {
        label_name: 'PyTorch',
        children: [
          {
            label_name: '2.8.0',
            children: [{ label_name: '3.12(ubuntu22.04)', children: [leaf('base-image-a', '12.8')] }],
          },
        ],
      },
      { label_name: 'Miniconda', children: null },
    ])
    expect(toOfficialImages(tree)).toEqual([
      {
        kind: 'official',
        uuid: 'base-image-a',
        label: 'PyTorch / 2.8.0 / 3.12(ubuntu22.04) / CUDA 12.8',
        cuda: '12.8',
        chipCorp: 'nvidia',
        cpuArch: 'x86',
      },
    ])
  })
})

describe('price preview', () => {
  it('reads the payable prices and the expansion the platform priced', () => {
    const raw = parse(PricePreview, {
      payg_price: 1580,
      origin_price: 1660,
      expand_data_disk: 107374182400,
      data_disk_info: { data_disk_deal_daily_price: 670, data_disk_origin_daily_price: 700 },
    })
    expect(toPriceQuote(raw)).toEqual({
      hourlyMilli: 1580,
      originHourlyMilli: 1660,
      expandBytes: 107374182400,
      diskDailyMilli: 670,
    })
  })
})

describe('instance list', () => {
  it('maps an instance and keeps no credential fields', () => {
    const raw = parse(InstancePage, {
      list: [
        {
          uuid: 'abcdefghij-12345678',
          machine_id: 'abcdefghij',
          region_name: '西北B区',
          snapshot_gpu_alias_name: 'RTX PRO 6000',
          req_gpu_amount: 1,
          status: 'running',
          charge_type: 'payg',
          payg_price: 8360,
          expand_data_disk_size: 214748364800,
          usage_info: { data_disk_total_size: 268435456000 },
          created_at: '2026-11-13T16:33:48+08:00',
          root_password: 'must-not-survive',
          jupyter_token: 'must-not-survive',
          ssh_command: 'must-not-survive',
        },
      ],
    })
    const instance = toInstance(first(raw.list))
    expect(instance).toEqual({
      uuid: 'abcdefghij-12345678',
      machineId: 'abcdefghij',
      regionName: '西北B区',
      gpuName: 'RTX PRO 6000',
      gpuCount: 1,
      status: 'running',
      chargeType: 'payg',
      hourlyMilli: 8360,
      expandBytes: 214748364800,
      dataDiskTotalBytes: 268435456000,
      createdAt: '2026-11-13T16:33:48+08:00',
    })
    expect(JSON.stringify(instance)).not.toContain('must-not-survive')
  })
})
