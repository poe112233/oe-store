/**
 * 把预渲染产物合并进构建输出，并把资源引用对齐到本次构建的真实文件名。
 *
 * 为什么需要这一步：
 * 1) 发布平台上传源码时会排除 build output（dist），云端重新执行 `npm run build`
 *    会生成一个没有预渲染内容的 dist，所以产物必须存在源码目录 `prerender-out/`；
 * 2) 云端 install 解析到的依赖版本可能与本地不同，产出的 `assets/index-<hash>.js`
 *    名字会变，预渲染 HTML 里写死的引用就会 404。这里以本次构建的 index.html
 *    为准，把产物里的资源引用改写成真实文件名。
 *
 * 用法：node scripts/apply-prerender.cjs
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'prerendered')
const DIST = path.join(ROOT, 'dist')

function walk(dir, base = '') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel))
    else if (entry.name.endsWith('.html')) out.push(rel)
  }
  return out
}

/** 从本次构建的 index.html 里取出真实的入口资源路径。 */
function realAssets() {
  const index = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
  return {
    js: (index.match(/assets\/[A-Za-z0-9_.-]+\.js/) || [])[0] || null,
    css: (index.match(/assets\/[A-Za-z0-9_.-]+\.css/) || [])[0] || null,
  }
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.log('[prerender] 没有 prerender-out 目录，跳过（纯 SPA 模式）')
    return
  }
  if (!fs.existsSync(DIST)) {
    throw new Error('dist 不存在，请先执行 npm run build')
  }

  const { js, css } = realAssets()
  console.log(`[prerender] 本次构建资源：js=${js} css=${css}`)

  const files = walk(SRC)
  let copied = 0
  let rewritten = 0

  for (const rel of files) {
    let html = fs.readFileSync(path.join(SRC, rel), 'utf8')
    const before = html
    if (js) html = html.replace(/assets\/[A-Za-z0-9_.-]+\.js/g, js)
    if (css) html = html.replace(/assets\/[A-Za-z0-9_.-]+\.css/g, css)
    if (html !== before) rewritten++

    const to = path.join(DIST, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.writeFileSync(to, html, 'utf8')
    copied++
  }

  console.log(`[prerender] 已合并 ${copied} 个静态页面（其中 ${rewritten} 个做了资源引用对齐）`)
}

main()
