import { useEffect, useState } from 'react'

export interface Route {
  name: 'home' | 'category' | 'product' | 'admin' | 'notfound'
  param?: string
}

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * 路由形态（2026-10-12 由 hash 改为真实路径，为了能被谷歌索引）：
 *   /           首页
 *   /c/<slug>   分类
 *   /p/<id>     商品
 *   /admin      后台
 *
 * 旧版是 `#/c/xxx`、`#/p/xxx`，hash 片段不会被搜索引擎当作独立页面，
 * 825 个商品页因此对爬虫完全不可见。这里在加载时把旧链接原地规范化为真实路径，
 * 既保住老链接可用，又不产生重复内容。
 */
function normalizeLegacyHash() {
  const h = window.location.hash
  if (!h.startsWith('#/')) return
  const target = h.slice(1) || '/'
  try {
    window.history.replaceState(null, '', target)
  } catch {
    /* replaceState 在 file:// 等场景会抛错，忽略即可 */
  }
}
normalizeLegacyHash()

function readPath(): string {
  const h = window.location.hash
  if (h.startsWith('#/')) return h.slice(1)
  return window.location.pathname
}

function parse(input: string): Route {
  let raw = input.split('?')[0].split('#')[0]
  try {
    raw = decodeURI(raw)
  } catch {
    /* 非法百分号编码时按原样处理 */
  }
  const parts = raw.replace(/\/+$/, '').split('/').filter(Boolean)
  if (!parts.length) return { name: 'home' }
  const [head, tail] = parts
  if (head === 'admin') return { name: 'admin' }
  if (head === 'c' && tail) return { name: 'category', param: tail }
  if (head === 'p' && tail) return { name: 'product', param: tail }
  return { name: 'notfound' }
}

function emit() {
  for (const fn of listeners) fn()
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(readPath()))
  useEffect(() => {
    const onChange = () => setRoute(parse(readPath()))
    listeners.add(onChange)
    window.addEventListener('popstate', onChange)
    return () => {
      listeners.delete(onChange)
      window.removeEventListener('popstate', onChange)
    }
  }, [])
  return route
}

/**
 * 站点真实 URL 形态。
 *
 * CF Pages 对「目录索引」类路径（`/p/829` → `/p/829/index.html`）会先回 308 补尾斜杠，
 * 所以浏览器的最终地址是 `/p/829/`。站内链接若还写无斜杠版本，爬虫每点一次就多吃一跳
 * 重定向，canonical 也会指向一个「会跳转的地址」。这里统一产出带斜杠的真身：
 *   `/p/829` → `/p/829/`、`/c/nike` → `/c/nike/`
 * 首页 `/` 与 `/admin` 维持原样。
 */
export function pagePath(path: string): string {
  if (!path || path.includes('?') || path.includes('#')) return path
  if (/^\/(p|c)\/[^/]+$/.test(path)) return path + '/'
  return path
}

export function go(path: string) {
  const target = pagePath(path)
  if (readPath() === target) return
  window.history.pushState(null, '', target)
  emit()
}

/**
 * 给需要导航的元素生成真实 `href` —— 关键：搜索引擎只认 `<a href>`，
 * 没有 href 的 onClick 对爬虫等于不存在，站内页面之间就串不起来。
 * 保留单页无刷新体验：普通左键点击时拦截，交给 pushState 处理。
 */
export function goProps(path: string, extra?: () => void): { href: string; onClick: (e: any) => void } {
  return {
    href: pagePath(path),
    onClick: (e: any) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      extra?.()
      go(path)
    },
  }
}

export function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
}
