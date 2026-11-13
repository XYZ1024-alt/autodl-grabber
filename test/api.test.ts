import { describe, expect, it } from 'vitest'
import { createAutodlApi } from '../src/autodl/api'
import type { Json } from '../src/autodl/http'

type Call = { path: string; body: { [key: string]: Json } }

/** A fake AutoDL that answers every request with the data the given function returns. */
const setup = (answer: (call: Call) => object | number | string) => {
  const calls: Call[] = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const call = { path: String(input), body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') }
    calls.push(call)
    return new Response(JSON.stringify({ code: 'Success', data: answer(call) }))
  }
  const storage = { getItem: (key: string) => (key === 'token' ? 'a.b.c' : null) }
  return { api: createAutodlApi({ fetch, storage }), calls }
}

const rawHost = (id: string) => ({
  machine_id: id,
  region_sign: 'west-B',
  gpu_name: 'RTX 4090',
  gpu_number: 8,
  gpu_idle_num: 1,
  on_line: 2,
  max_instance_num: 100,
  binding_instance_num: 1,
  payg: true,
  payg_price: 2000,
  max_instance_disk_size: 53687091200,
  max_data_disk_expand_size: 107374182400,
  data_disk_expand_price: { daily_price: 7 },
})

const query = { regionSigns: ['west-B'], gpuNames: ['RTX 4090'], gpuCount: 1 }

describe('countIdleGpus', () => {
  it('asks once per region, in order, and reports idle GPUs per model', async () => {
    const { api, calls } = setup(({ body }) =>
      Array.isArray(body.region_sign_list) && body.region_sign_list.includes('west-B')
        ? [
            { 'RTX 4090': { idle_gpu_num: 2, total_gpu_num: 100 } },
            { 'RTX 5090': { idle_gpu_num: -1, total_gpu_num: 8 } },
          ]
        : [{ 'RTX 4090': { idle_gpu_num: 0, total_gpu_num: 40 } }],
    )
    const result = await api.countIdleGpus([
      { id: 'westDC3', name: '西北B区', signs: ['west-B', 'west-C'] },
      { id: 'beijingDC2', name: '北京B区', signs: ['bj-B1'] },
    ])
    expect(result).toEqual({
      ok: true,
      value: [
        { regionId: 'westDC3', gpuName: 'RTX 4090', idle: 2 },
        { regionId: 'westDC3', gpuName: 'RTX 5090', idle: 0 },
        { regionId: 'beijingDC2', gpuName: 'RTX 4090', idle: 0 },
      ],
    })
    expect(calls.map((call) => call.body.region_sign_list)).toEqual([['west-B', 'west-C'], ['bj-B1']])
    expect(calls.every((call) => call.path === '/api/v1/machine/region/gpu_type')).toBe(true)
  })
})

describe('listMachines', () => {
  const pages = (count: number) => (call: Call) => ({
    list: [rawHost(`host-${call.body.page_index}`)],
    result_total: count,
    max_page: count,
  })

  it('reads every page when the limit allows', async () => {
    const { api, calls } = setup(pages(3))
    const result = await api.listMachines({ ...query, maxPages: 10 })
    expect(result.ok && result.value.machines.map((machine) => machine.id)).toEqual([
      'host-1',
      'host-2',
      'host-3',
    ])
    expect(result.ok && result.value.complete).toBe(true)
    expect(calls.map((call) => call.body.page_index)).toEqual([1, 2, 3])
    expect(calls[0]?.body).toMatchObject({
      region_sign_list: ['west-B'],
      gpu_type_name: ['RTX 4090'],
      charge_type: 'payg',
      default_order: true,
    })
  })

  it('says so when it stopped before the last page', async () => {
    const { api, calls } = setup(pages(3))
    const result = await api.listMachines({ ...query, maxPages: 1 })
    expect(result).toMatchObject({ ok: true, value: { total: 3, complete: false } })
    expect(calls).toHaveLength(1)
  })
})

describe('createInstance', () => {
  it('sends the expansion as extra bytes in both parts of the request', async () => {
    const { api, calls } = setup(() => 'host-1-abcdef12')
    const result = await api.createInstance({
      machineId: 'host-1',
      gpuCount: 2,
      image: {
        kind: 'official',
        uuid: 'base-image-x',
        label: '',
        cuda: '12.8',
        chipCorp: 'nvidia',
        cpuArch: 'x86',
      },
      expandBytes: 100 * 1024 ** 3,
    })
    expect(result).toEqual({ ok: true, value: 'host-1-abcdef12' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.path).toBe('/api/v1/order/instance/create/payg')
    expect(calls[0]?.body).toMatchObject({
      instance_info: {
        machine_id: 'host-1',
        charge_type: 'payg',
        req_gpu_amount: 2,
        base_image_uuid: 'base-image-x',
        private_image_uuid: '',
        expand_data_disk: 107374182400,
      },
      price_info: {
        machine_id: 'host-1',
        charge_type: 'payg',
        num: 2,
        expand_data_disk: 107374182400,
        duration: 1,
      },
    })
  })
})
