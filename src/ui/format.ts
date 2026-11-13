import { bytesToGb, formatGb, formatYuan } from '../domain/units'
import type { Outcome, Phase } from '../runner/runner'

/** The wording for the data disk setting. It is the extra paid size, not the total size. */
export const EXPAND_MEANING =
  '填写的是在主机自带的免费数据盘之外“额外增加”的付费容量，不是扩容后的总容量（总容量 = 免费数据盘 + 此处填写的大小）。'

export const EXPAND_RULES =
  '规则与 AutoDL 创建页一致：整数 GB，最小 0（0 表示不扩容），步长 1，上限为所选主机的“可扩容”空间。可扩容空间不足的主机会被跳过，不会改用更小的容量。'

/** Shown next to the start button: there is no confirmation step after it. */
export const START_NOTICE =
  '点击“开始自动抢机”后立即开始监测，不再弹出确认。发现符合条件的主机会直接创建并开机一台按量计费实例，随即开始计费；一次任务最多创建一台。'

export const EXPAND_FEE_NOTE =
  '扩容费用：找到主机后，平台给出的预览价会写入运行日志并显示在结果里；取不到时显示“未知”。按量计费实例的付费数据盘按日扣费，关机期间也计费。'

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
      ['实例费用', `${formatYuan(instance.hourlyMilli)}/时（实例列表返回的实付单价）`],
    )
  } else if (machine !== null) {
    pairs.push(
      ['目标主机', `${machine.regionName} / ${machine.alias}（${machine.id}）`],
      ['GPU', machine.gpuName],
    )
    if (quote !== null) pairs.push(['实例费用', `${formatYuan(quote.hourlyMilli)}/时（平台预览价）`])
  }
  if (quote !== null)
    pairs.push([
      '数据盘费用',
      quote.expandBytes === 0
        ? '无（未扩容）'
        : `${formatYuan(quote.diskDailyMilli)}/日（创建前的平台预览价）`,
    ])
  else if (instance !== null) pairs.push(['数据盘费用', '未知（没有取得平台预览价），请到控制台查看'])
  return pairs
}
