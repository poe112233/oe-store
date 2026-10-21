/**
 * Cloudflare Pages Function —— 路由兜底 + 内容页真 404 + 缺失资源不再伪装成 HTML。
 *
 * 背景（2026-10-18 实测）：本项目没放 404.html，CF Pages 对「未命中任何文件」的请求
 * 一律回落到 index.html 并返回 **200 text/html**。后果有两层：
 *   ① 已下架商品的 `/p/<id>/` 变成「200 + 首页标题」的 soft 404（Google 判重复内容）；
 *   ② 缺失图片 `/oe/xxx.webp` 也返回 200 HTML，图片坏了却看不出错。
 * 而放一个根目录 404.html 又会把 /admin 之类客户端路由 308 踢回首页，同样不能用。
 *
 * 所以这里自己做存在性判断，不再依赖 `context.next()` 的状态码：
 *   · 带扩展名 → 取文件；若拿回来是 text/html（说明是兜底），判真 404
 *   · 内容页（/p/<数字> /c/<slug> /blog/<slug>）→ 探 `<path>/index.html`
 *       · 308 = 目录真实存在（Pages 对目录索引做尾斜杠重定向）→ 正常放行
 *       · 200 = 兜底 HTML（文件不存在）→ 返回真 404 页
 *   · 其它路径（/、/admin、语言前缀）→ 回落 index.html，交给前端路由
 */
import { NOT_FOUND_HTML } from './_notfound.js'

/** 内容页形态：这些路径找不到静态文件就是「不存在」，不能退回 SPA 首页 */
const CONTENT_PATH = /^\/(p\/\d+|c\/[a-z0-9][a-z0-9-]*|blog\/[a-z0-9][a-z0-9-]*)\/?$/i

const NOT_FOUND_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex',
}

function notFound() {
  return new Response(NOT_FOUND_HTML, { status: 404, statusText: 'Not Found', headers: NOT_FOUND_HEADERS })
}

function plainNotFound() {
  return new Response('404 — not found', {
    status: 404,
    statusText: 'Not Found',
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' },
  })
}

/** Pages 的 SPA 兜底特征：200 + text/html */
function isFallbackHtml(res) {
  return res.status === 200 && (res.headers.get('content-type') || '').includes('text/html')
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const { pathname } = url
  const req = () => new Request(url.toString(), request)

  // 1) 带扩展名 = 静态资源。真实文件有自己的 content-type；拿回 text/html 就是兜底
  if (/\.[a-z0-9]{1,8}$/i.test(pathname)) {
    const r = await env.ASSETS.fetch(req())
    if (isFallbackHtml(r)) return plainNotFound()
    return r
  }

  // 2) 内容页：探目录索引文件
  if (CONTENT_PATH.test(pathname)) {
    const dir = pathname.replace(/\/+$/, '')
    const probeUrl = new URL(url.toString())
    probeUrl.pathname = dir + '/index.html'
    const doc = await env.ASSETS.fetch(new Request(probeUrl.toString(), request))

    // 308/301 = 该目录下确实有 index.html（Pages 对目录索引做尾斜杠重定向）
    if (doc.status === 308 || doc.status === 301) return env.ASSETS.fetch(req())
    return notFound()
  }

  // 3) 其它客户端路由：交回 Pages 的 SPA 兜底（它会把 index.html 直接返回 200）。
  //    注意不能主动去取 `/index.html` —— Pages 会把它 308 回 `/`，形成自指重定向。
  return env.ASSETS.fetch(req())
}
