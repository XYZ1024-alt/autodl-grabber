export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel {
  /* Clear of the page's own controls: the create page keeps "创建并开机" in a fixed 90px bar at the
     bottom, and the site header is 60px high. */
  position: fixed; right: 16px; bottom: 104px; z-index: 2147483000;
  width: 400px; max-height: calc(100vh - 180px); display: flex; flex-direction: column;
  font: 13px/1.5 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2329;
  background: #fff; border: 1px solid #d0d7de; border-radius: 10px; box-shadow: 0 8px 28px rgba(15, 23, 42, .18);
}
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; user-select: none; }
.head .title { font-weight: 600; flex: 1; }
.body { overflow-y: auto; padding: 0 12px 12px; border-top: 1px solid #eaecf0; }
.collapsed { width: auto; }
.collapsed .body { display: none; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.field { margin-top: 10px; }
.field > label, .label { display: block; font-weight: 600; margin-bottom: 4px; }
.hint { color: #667085; font-size: 12px; margin-top: 3px; }
.warn { color: #b54708; }
.danger { color: #b42318; }
.row { display: flex; gap: 8px; align-items: center; }
.row > * { min-width: 0; }
input[type="number"], select {
  width: 100%; height: 30px; padding: 0 8px; font: inherit; color: inherit;
  border: 1px solid #d0d7de; border-radius: 6px; background: #fff;
}
input:disabled, select:disabled, button:disabled { opacity: .55; cursor: not-allowed; }
.box { border: 1px solid #eaecf0; border-radius: 6px; padding: 6px 8px; max-height: 132px; overflow-y: auto; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
.check { display: flex; align-items: center; gap: 6px; }
.region { display: flex; align-items: center; gap: 6px; padding: 1px 0; }
.region .name { flex: 1; }
.rank { color: #175cd3; font-weight: 600; min-width: 18px; }
button {
  font: inherit; height: 30px; padding: 0 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid #d0d7de; background: #fff; color: #1f2329;
}
button.small { height: 22px; padding: 0 6px; font-size: 12px; }
button.primary { background: #175cd3; border-color: #175cd3; color: #fff; }
button.stop { border-color: #f0b4ae; color: #b42318; }
.actions { display: flex; gap: 8px; margin-top: 12px; }
.actions button { flex: 1; }
.errors { margin-top: 10px; padding: 8px; border-radius: 6px; background: #fef3f2; color: #b42318; }
.errors div + div { margin-top: 4px; }
.status { margin-top: 12px; padding: 8px; border-radius: 6px; background: #f6f8fa; }
.status .phase { font-weight: 600; }
.outcome { margin-top: 8px; padding: 8px; border-radius: 6px; border: 1px solid #d0d7de; }
.outcome.billing { border-color: #f0b4ae; background: #fff8f7; }
.kv { display: grid; grid-template-columns: 76px 1fr; gap: 2px 8px; margin-top: 6px; }
.kv dt { color: #667085; }
.kv dd { margin: 0; word-break: break-all; }
.log { margin-top: 6px; height: 150px; overflow-y: auto; padding: 6px 8px; border-radius: 6px;
  background: #101828; color: #e4e7ec; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.log .warn { color: #fec84b; }
.log .error { color: #fda29b; }
.log .time { color: #98a2b3; margin-right: 6px; }
`
