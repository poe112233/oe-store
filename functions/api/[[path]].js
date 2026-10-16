/**
 * Cloudflare Pages Function —— 数据接口同域代理。
 *
 * 为什么需要：站点数据来自 WorkBuddy 云数据面，而数据面按来源域名做白名单校验，
 * 第三方域名（含 ores.cc）直连会返回 403 且不带 CORS 放行头。把前端的数据前缀
 * 设为 `/api`（构建期 VITE_API_BASE=/api），请求先到本站同域，再由这里服务端转发，
 * 浏览器侧就不存在跨域问题。
 *
 * 路由：`/api/.cloud/database/rest/rpc/<fn>` → `https://<上游>/.cloud/database/rest/rpc/<fn>`
 */

const UPSTREAM = 'https://oe-brand.app.workbuddy.host'

const STRIP_REQUEST_HEADERS = [
  'host',
  'cf-connecting-ip',
  'cf-connecting-ipv6',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
]

const STRIP_RESPONSE_HEADERS = [
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
]

export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)
  // /api/xxx → https://<UPSTREAM>/xxx
  const target = UPSTREAM + url.pathname.replace(/^\/api/, '') + url.search

  const headers = new Headers(request.headers)
  for (const h of STRIP_REQUEST_HEADERS) headers.delete(h)
  // 数据面按来源域名做白名单校验，第三方域名会被拒（403）。
  // 本代理代表本站访问上游，故把来源改写成受信任的托管域。
  headers.set('Origin', UPSTREAM)
  headers.set('Referer', UPSTREAM + '/')

  const init = { method: request.method, headers, redirect: 'manual' }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  let upstream
  try {
    upstream = await fetch(target, init)
  } catch (err) {
    return new Response(
      JSON.stringify({ message: '数据面暂时不可达', detail: String((err && err.message) || err) }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } }
    )
  }

  const out = new Headers(upstream.headers)
  for (const h of STRIP_RESPONSE_HEADERS) out.delete(h)
  // 同域调用本不需要 CORS 头，保留一份以便将来跨子域复用
  if (!out.has('access-control-allow-origin')) out.set('access-control-allow-origin', url.origin)

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  })
}

/** 预检请求直接放行，避免依赖上游返回 CORS 头。 */
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': new URL(context.request.url).origin,
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,apikey,x-client-info',
      'access-control-max-age': '86400',
    },
  })
}
