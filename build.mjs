import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const { version } = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))

// Userscript metadata. The script runs on the "租用新实例" page (/create), on the GPU market, and on the
// instance list, whose "租用新实例" button leads to /create without a page load.
// No @require/@resource/@connect: nothing is loaded from or sent to
// any host other than the page's own origin. "@grant none" requests no privileged API.
const header = `// ==UserScript==
// @name         AutoDL 自动抢机助手
// @namespace    autodl-grabber
// @version      ${version}
// @description  监测 AutoDL 空闲 GPU，在满足条件时自动创建并开机一台按量计费实例（支持数据盘扩容）。
// @match        https://www.autodl.com/create
// @match        https://www.autodl.com/create/*
// @exclude      https://www.autodl.com/create/pro*
// @match        https://www.autodl.com/market/*
// @match        https://www.autodl.com/console/instance/list*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==
`

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/autodl-grabber.user.js',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: false,
  legalComments: 'none',
  banner: { js: header },
  logLevel: 'info',
})
