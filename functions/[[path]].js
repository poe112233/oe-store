/**
 * Cloudflare Pages Function —— SPA 前端路由兜底。
 *
 * 为什么不用 `_redirects` 的 `/* /index.html 200`：
 * 该规则会连静态资源（/oe/**.webp、/assets/**）一起吞掉，图片请求会返回 HTML，
 * 表现为"图片全部坏掉但 HTTP 200"。这里只在「未命中任何静态资源」且「路径不带
 * 文件扩展名」时才回落到 index.html，静态资源与接口一律放行。
 */
export async function onRequest(context) {
  const res = await context.next()
  if (res.status !== 404) return res

  const { pathname } = new URL(context.request.url)
  // 带扩展名的请求是静态资源，真不存在就保持 404，不要伪装成页面
  if (/\.[a-z0-9]{1,8}$/i.test(pathname)) return res

  const url = new URL(context.request.url)
  url.pathname = '/index.html'
  return context.env.ASSETS.fetch(new Request(url.toString(), context.request))
}
