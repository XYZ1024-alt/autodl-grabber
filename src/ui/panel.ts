import { type App, type AppState, isActive } from '../app/app'
import { MAX_INTERVAL_SEC, MIN_INTERVAL_SEC } from '../domain/config'
import type { Catalog, ImageKind } from '../domain/types'
import type { Log } from '../runner/log'
import { h } from './dom'
import { EXPAND_MEANING, EXPAND_RULES, outcomePairs, type Pair, PHASE_LABELS, START_NOTICE } from './format'
import { STYLES } from './styles'

/** An empty box is "not a number", never a silent 0. */
const readNumber = (input: HTMLInputElement): number =>
  input.value.trim() === '' ? Number.NaN : Number(input.value)

const numberInput = (value: number, attrs: Record<string, string>, onValue: (value: number) => void) => {
  const input = h('input', {
    attrs: { type: 'number', ...attrs },
    on: { input: () => onValue(readNumber(input)) },
  })
  input.value = Number.isNaN(value) ? '' : String(value)
  return input
}

const select = <T extends string>(
  options: [value: T, label: string][],
  value: T,
  onValue: (value: T) => void,
) => {
  const element = h(
    'select',
    {
      on: {
        change: () => {
          const chosen = options.find(([optionValue]) => optionValue === element.value)
          if (chosen !== undefined) onValue(chosen[0])
        },
      },
    },
    options.map(([optionValue, label]) => h('option', { text: label, attrs: { value: optionValue } })),
  )
  element.value = value
  return element
}

const field = (label: string, children: (Node | string)[]) =>
  h('div', { class: 'field' }, [h('span', { class: 'label', text: label }), ...children])

const pairList = (pairs: Pair[]) =>
  h(
    'dl',
    { class: 'kv' },
    pairs.flatMap(([label, value]) => [h('dt', { text: label }), h('dd', { text: value })]),
  )

const toggled = (list: string[], item: string, on: boolean): string[] =>
  on ? [...list.filter((other) => other !== item), item] : list.filter((other) => other !== item)

const moved = (list: string[], index: number, offset: number): string[] => {
  const target = index + offset
  const next = [...list]
  const [item] = next.splice(index, 1)
  if (item === undefined || target < 0 || target >= list.length) return list
  next.splice(target, 0, item)
  return next
}

export const mountPanel = (app: App, log: Log, hostId: string, startCollapsed: boolean): void => {
  const host = h('div', { attrs: { id: hostId } })
  const shadow = host.attachShadow({ mode: 'open' })
  const panel = h('div', { class: 'panel' })
  shadow.append(h('style', { text: STYLES }), panel)

  const collapse = h('span', { class: 'hint', text: '收起' })
  const setCollapsed = (collapsed: boolean) => {
    panel.classList.toggle('collapsed', collapsed)
    collapse.textContent = collapsed ? '展开' : '收起'
  }
  const head = h(
    'div',
    { class: 'head', on: { click: () => setCollapsed(!panel.classList.contains('collapsed')) } },
    [h('span', { class: 'title', text: 'AutoDL 自动抢机助手' }), collapse],
  )

  const form = h('fieldset')
  const errors = h('div')
  const startButton = h('button', {
    class: 'primary',
    text: '开始自动抢机',
    on: { click: () => void app.start() },
  })
  const pauseButton = h('button', {
    text: '暂停',
    on: { click: () => (app.getState().runner.phase === 'paused' ? app.resume() : app.pause()) },
  })
  const stopButton = h('button', { class: 'stop', text: '停止', on: { click: () => app.stop() } })
  const startNotice = h('div', {
    class: 'hint warn',
    attrs: { style: 'margin-top:12px' },
    text: START_NOTICE,
  })
  const status = h('div')
  const logBox = h('div', { class: 'log' })
  panel.append(
    head,
    h('div', { class: 'body' }, [
      form,
      errors,
      startNotice,
      h('div', { class: 'actions', attrs: { style: 'margin-top:6px' } }, [
        startButton,
        pauseButton,
        stopButton,
      ]),
      status,
      h('div', { class: 'field' }, [
        h('div', { class: 'row' }, [
          h('span', { class: 'label', text: '运行日志' }),
          h('button', { class: 'small', text: '清空', on: { click: () => log.clear() } }),
        ]),
        logBox,
      ]),
    ]),
  )

  const gpuField = (state: AppState, catalog: Catalog) => {
    const known = catalog.gpuTypes.map((gpu) => gpu.name)
    const stale = state.draft.gpuNames.filter((name) => !known.includes(name))
    const checkbox = (name: string, label: string) => {
      const input = h('input', {
        attrs: { type: 'checkbox' },
        on: {
          change: () =>
            app.updateDraft({ gpuNames: toggled(app.getState().draft.gpuNames, name, input.checked) }),
        },
      })
      input.checked = state.draft.gpuNames.includes(name)
      return h('label', { class: 'check' }, [input, label])
    }
    return field('GPU 型号', [
      h('div', { class: 'box grid' }, [
        ...stale.map((name) => checkbox(name, `${name}（已不存在）`)),
        ...known.map((name) => checkbox(name, name)),
      ]),
    ])
  }

  const regionField = (state: AppState, catalog: Catalog) => {
    const selected = state.draft.regionIds
    const nameOf = (id: string) =>
      catalog.regions.find((region) => region.id === id)?.name ?? `${id}（已不存在）`
    const row = (id: string, index: number) => {
      const input = h('input', {
        attrs: { type: 'checkbox' },
        on: {
          change: () =>
            app.updateDraft({ regionIds: toggled(app.getState().draft.regionIds, id, input.checked) }),
        },
      })
      input.checked = index >= 0
      const move = (label: string, offset: number) =>
        h('button', {
          class: 'small',
          text: label,
          attrs: { type: 'button' },
          on: {
            click: () => app.updateDraft({ regionIds: moved(app.getState().draft.regionIds, index, offset) }),
          },
        })
      return h('div', { class: 'region' }, [
        input,
        h('span', { class: 'rank', text: index >= 0 ? `${index + 1}.` : '' }),
        h('span', { class: 'name', text: nameOf(id) }),
        ...(index >= 0 ? [move('上移', -1), move('下移', 1)] : []),
      ])
    }
    const others = catalog.regions.filter((region) => !selected.includes(region.id))
    return field('地区（序号越小越优先）', [
      h('div', { class: 'box' }, [...selected.map(row), ...others.map((region) => row(region.id, -1))]),
    ])
  }

  const imageField = (state: AppState, catalog: Catalog) => {
    const { imageKind, imageUuid } = state.draft
    const images = imageKind === 'official' ? catalog.officialImages : catalog.privateImages
    const known = images.some((image) => image.uuid === imageUuid)
    const placeholder =
      images.length === 0
        ? '没有可用镜像'
        : imageUuid !== '' && !known
          ? '原镜像已不存在，请重新选择'
          : '请选择镜像'
    return field('镜像', [
      h('div', { class: 'row' }, [
        select<ImageKind>(
          [
            ['official', '官方镜像'],
            ['private', '我的自定义镜像'],
          ],
          imageKind,
          (kind) => app.updateDraft({ imageKind: kind, imageUuid: '' }),
        ),
      ]),
      h('div', { class: 'row', attrs: { style: 'margin-top:6px' } }, [
        select(
          [['', placeholder], ...images.map((image): [string, string] => [image.uuid, image.label])],
          known ? imageUuid : '',
          (uuid) => app.updateDraft({ imageUuid: uuid }),
        ),
      ]),
    ])
  }

  const renderForm = (state: AppState) => {
    const { draft, catalog } = state
    const children: Node[] = []
    if (catalog === null) {
      children.push(
        h('div', { class: 'field' }, [
          h('div', {
            class: state.catalogError === null ? 'hint' : 'danger',
            text: state.catalogError === null ? '正在加载列表…' : `读取列表失败：${state.catalogError}`,
          }),
        ]),
      )
    } else {
      children.push(
        gpuField(state, catalog),
        field('GPU 数量', [
          numberInput(draft.gpuCount, { min: '1', max: '12', step: '1' }, (gpuCount) =>
            app.updateDraft({ gpuCount }),
          ),
        ]),
        regionField(state, catalog),
        field('价格上限（元/时）', [
          numberInput(draft.maxHourlyYuan, { min: '0', step: '0.01' }, (maxHourlyYuan) =>
            app.updateDraft({ maxHourlyYuan }),
          ),
          h('div', {
            class: 'hint',
            text: '全部 GPU 合计，含会员折扣，不含数据盘费用。',
          }),
        ]),
        imageField(state, catalog),
        field('数据盘扩容（GB）', [
          numberInput(draft.expandGb, { min: '0', step: '1' }, (expandGb) => app.updateDraft({ expandGb })),
          h('div', { class: 'hint warn', text: EXPAND_MEANING }),
          h('div', { class: 'hint', text: EXPAND_RULES }),
        ]),
        field(`监测间隔（秒，${MIN_INTERVAL_SEC}～${MAX_INTERVAL_SEC}）`, [
          numberInput(
            draft.intervalSec,
            { min: String(MIN_INTERVAL_SEC), max: String(MAX_INTERVAL_SEC), step: '1' },
            (intervalSec) => app.updateDraft({ intervalSec }),
          ),
        ]),
      )
    }
    children.push(
      h('div', { class: 'field' }, [
        h('button', {
          class: 'small',
          text: '刷新列表',
          attrs: { type: 'button' },
          on: { click: () => void app.reloadCatalog() },
        }),
      ]),
    )
    form.replaceChildren(...children)
  }

  const renderStatus = (state: AppState) => {
    const { runner } = state
    const active = isActive(runner.phase)
    const locked = active || state.busy
    form.disabled = locked
    startButton.disabled = locked
    startNotice.hidden = active
    pauseButton.disabled = runner.phase !== 'monitoring' && runner.phase !== 'paused'
    pauseButton.textContent = runner.phase === 'paused' ? '继续' : '暂停'
    stopButton.disabled = !active

    errors.replaceChildren(
      ...(state.errors.length === 0
        ? []
        : [
            h(
              'div',
              { class: 'errors' },
              state.errors.map((message) => h('div', { text: message })),
            ),
          ]),
    )

    const children: Node[] = [
      h('div', { class: 'status' }, [
        h('div', {
          class: 'phase',
          text: `状态：${PHASE_LABELS[runner.phase]}${runner.polls > 0 ? `（已检查 ${runner.polls} 次）` : ''}`,
        }),
        ...(runner.detail === '' ? [] : [h('div', { text: runner.detail })]),
      ]),
    ]
    if (runner.outcome !== null) {
      const { outcome } = runner
      children.push(
        h('div', { class: outcome.mayBeBilling ? 'outcome billing' : 'outcome' }, [
          pairList(outcomePairs(outcome)),
        ]),
      )
    }
    if (state.pendingCreate && !active)
      children.push(
        h('div', { class: 'errors' }, [
          h('div', {
            text: '上次任务的创建请求没有确认结果，可能已创建实例并在计费。请到控制台的实例列表核对。',
          }),
          h('button', {
            class: 'small',
            text: '我已核对，清除标记',
            on: { click: () => app.clearPendingCreate() },
          }),
        ]),
      )
    status.replaceChildren(...children)
  }

  const renderLog = () => {
    logBox.replaceChildren(
      ...log.entries().map((entry) =>
        h('div', { class: entry.level }, [
          h('span', {
            class: 'time',
            text: new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false }),
          }),
          entry.text,
        ]),
      ),
    )
    logBox.scrollTop = logBox.scrollHeight
  }

  /** Rebuilding the form drops input focus, so it only happens when its structure changes. */
  const formShape = (state: AppState) =>
    [state.catalogError, state.draft.imageKind, state.draft.regionIds.join()].join('|')

  app.subscribe((state, previous) => {
    if (state.catalog !== previous.catalog || formShape(state) !== formShape(previous)) renderForm(state)
    // Anything that needs the user's attention opens the panel.
    if (
      state.runner.phase !== previous.runner.phase &&
      ['paused', 'done', 'failed'].includes(state.runner.phase)
    )
      setCollapsed(false)
    renderStatus(state)
  })
  log.subscribe(renderLog)

  renderForm(app.getState())
  renderStatus(app.getState())
  renderLog()
  setCollapsed(startCollapsed)
  document.body.append(host)
}
