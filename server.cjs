/**
 * 静态站点服务器（发布用）。
 *
 * 为什么不直接用 `vite preview`：sirv 不做 clean URL 解析，
 * 请求 `/p/3` 会落到 SPA 兜底的 index.html —— 预渲染的静态页永远命不中，
 * 收录改造就白做了。这里按 静态文件 → `<path>.html` → `<path>/index.html`
 * → SPA 兜底 的顺序解析，并优先返回预渲染产物。
 *
 * 约束：监听 $PORT、绑定 0.0.0.0（发布平台的单端口反代要求）。
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const DIST = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT) || 3000
const HOST = '0.0.0.0'

/**
 * 预渲染专用兜底开关（生产环境不设，行为不变）。
 *
 * 为什么需要：内容页在 dist 里还没有预渲染产物时，本服务器按设计返回真 404
 * （防软 404）。但预渲染要抓的正是「用新构建的 SPA 现场渲染」的结果，
 * 此时 dist 只有 index.html —— 没有这个开关，/p/* 与 /c/* 全部 404，预渲染跑不动；
 * 而把上一轮产物先塞进 dist 又会因为旧 assets hash 已失效（JS 加载 404）
 * 导致 React 不挂载、抓到上一轮的陈旧 DOM。
 * 因此预渲染时显式打开：内容页也回落到 SPA 外壳，让应用现场渲染。
 */
const PRERENDER_MODE = process.env.OE_PRERENDER_FALLBACK === '1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.map': 'application/json; charset=utf-8',
}

function exists(p) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/** 把 URL 路径安全地映射到 dist 内的相对路径，挡住 ../ 穿越。 */
function safeJoin(urlPath) {
  let rel
  try {
    rel = decodeURIComponent(urlPath.split('?')[0])
  } catch {
    rel = urlPath.split('?')[0]
  }
  const norm = path.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  return path.join(DIST, norm)
}

function resolveFile(urlPath) {
  const rel = urlPath.replace(/\/+$/, '')
  if (!rel) return path.join(DIST, 'index.html')

  const direct = safeJoin(rel)
  if (exists(direct)) return direct

  // /p/3 → /p/3.html
  if (exists(direct + '.html')) return direct + '.html'

  // /p/3 → /p/3/index.html（预渲染产物的目录形态）
  const indexed = path.join(direct, 'index.html')
  if (exists(indexed)) return indexed

  return null
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }

  const url = req.url || '/'
  const urlPath = url.split('?')[0]

  // 尾斜杠规范化：/p/3/ → /p/3，避免同一内容两个 URL
  if (urlPath.length > 1 && urlPath.endsWith('/')) {
    const qs = url.slice(urlPath.length)
    res.writeHead(301, { Location: urlPath.replace(/\/+$/, '') + qs })
    res.end()
    return
  }

  let file = resolveFile(urlPath)
  let fallback = false
  if (!file) {
    file = path.join(DIST, 'index.html')
    fallback = true
  }

  if (!exists(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
    return
  }

  // 内容页（商品/分类）不存在时必须给真 404 —— 用 200 返回首页是「软 404」，
  // 会白白消耗抓取预算，还拉低整站质量评估。后台等应用页仍走 SPA 兜底。
  const missingContent = !PRERENDER_MODE && fallback && /^\/(p|c)\//.test(urlPath)

  const ext = path.extname(file).toLowerCase()
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // 带 hash 的构建产物可长期缓存；HTML 必须每次回源，否则新页面发不出去
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  }
  if (fallback) headers['X-OE-Fallback'] = 'spa'
  if (missingContent) headers['X-Robots-Tag'] = 'noindex'

  res.writeHead(missingContent ? 404 : 200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(file).pipe(res)
})

server.listen(PORT, HOST, () => {
  console.log(`OE site serving dist/ on http://${HOST}:${PORT}`)
})
