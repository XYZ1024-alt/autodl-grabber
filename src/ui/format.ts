import { bytesToGb, formatGb, formatYuan } from '../domain/units'
import type { Outcome, Phase } from '../runner/runner'

/** The wording for the data disk setting. It is the extra paid size, not the total size. */
export const EXPAND_MEANING = '免费数据盘之外额外付费的容量，不是总容量。付费部分按日扣费，关机期间也扣。'

export const EXPAND_RULES = '可扩容空间不足的主机会被跳过。'

/** Shown next to the start button while idle: there is no confirmation step after it. */
export const START_NOTICE =
  '发现符合条件的主机后直接创建并开机，立即开始计费，不再确认。每次任务最多创建一台。'

export const PHASE_LABELS: Record<Phase, string> = {
  idle: '未开始',
  starting: '正在启动',
  monitoring: '监测中',
  paused: '已暂停',
  creating: '正在创建（请求已发出）',
  verifying: '正在核对创建结果',
  done: '已完成',
  stopped: '已停止',
  failed: '已停止（需要处理）',
}

export type Pair = [label: string, value: string]

export const outcomePairs = (outcome: Outcome): Pair[] => {
  const { instance, machine, quote } = outcome
  const pairs: Pair[] = []
  if (instance !== null) {
    const free = machine?.freeDiskBytes
    const total =
      instance.dataDiskTotalBytes > 0 ? instance.dataDiskTotalBytes : (free ?? 0) + instance.expandBytes
    pairs.push(
      ['实例 ID', instance.uuid],
      ['状态', instance.status],
      ['GPU', `${instance.gpuName} × ${instance.gpuCount} 卡`],
      [
        '地区',
        `${instance.regionName}${machine === null ? '' : ` / ${machine.alias}`}（主机 ${instance.machineId}）`,
      ],
      [
        '数据盘',
        free === undefined
          ? `付费扩容 ${bytesToGb(instance.expandBytes)} GB`
          : `免费 ${formatGb(free)} + 付费扩容 ${formatGb(instance.expandBytes)} = 共 ${formatGb(total)}`,
      ],
      ['实例费用', `${formatYuan(instance.hourlyMilli)}/时`],
    )
  } else if (machine !== null) {
    pairs.push(
      ['目标主机', `${machine.regionName} / ${machine.alias}（${machine.id}）`],
      ['GPU', machine.gpuName],
    )
    if (quote !== null) pairs.push(['实例费用', `${formatYuan(quote.hourlyMilli)}/时（预览价）`])
  }
  if (quote !== null)
    pairs.push([
      '数据盘费用',
      quote.expandBytes === 0 ? '未扩容' : `${formatYuan(quote.diskDailyMilli)}/日（预览价）`,
    ])
  else if (instance !== null) pairs.push(['数据盘费用', '未知，请到控制台查看'])
  return pairs
}
