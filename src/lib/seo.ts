/**
 * 每页独立的 SEO 元信息。
 *
 * 改造前全站共用 index.html 里的一个 title/description，883 个页面无法被区分，
 * 也就没有排名资格。这里按路由写入 title / description / canonical / og，
 * 并在预渲染时被固化成静态标签交给爬虫。
 *
 * canonical 一律指向实际托管域（SITE_ORIGIN）。ores.cc 目前只是 301 入口，
 * 把 canonical 指过去会与 301 落点打架，反而丢信号；等站点能直接跑在 ores.cc 上
 * 再改 config.ts 里的一个常量即可。
 */
import { SITE_ORIGIN } from '../config'
import { pagePath } from './router'

export const BRAND = 'Oriental Essence'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function upsertJsonLd(blocks: Record<string, unknown>[]) {
  const id = 'oe-jsonld'
  document.getElementById(id)?.remove()
  if (!blocks.length) return
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.id = id
  script.textContent = JSON.stringify(blocks.length === 1 ? blocks[0] : blocks)
  document.head.appendChild(script)
}

function clip(text: string, max = 158): string {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}

export interface SeoInput {
  title: string
  description: string
  /** 站内路径，如 `/p/123` */
  path: string
  image?: string
  jsonLd?: Record<string, unknown>[]
}

export function applySeo({ title, description, path, image, jsonLd = [] }: SeoInput) {
  // CF Pages 会把 `/p/829` 308 到 `/p/829/`，canonical 必须写「跳转后的真身」，
  // 否则等于让 Google 去收录一个重定向地址。
  const realPath = pagePath(path.startsWith('/') ? path : '/' + path)
  const url = SITE_ORIGIN + realPath
  const desc = clip(description)

  document.title = title
  upsertMeta('name', 'description', desc)
  upsertLink('canonical', url)

  // 给预渲染脚本用的「本页 SEO 已就绪」标记。
  // 必须带路由值：静态兜底 HTML 里也会带这个属性，只判断存在性会误判成已渲染。
  document.documentElement.setAttribute('data-oe-path', path)

  upsertMeta('property', 'og:type', 'website')
  upsertMeta('property', 'og:site_name', BRAND)
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', desc)
  upsertMeta('property', 'og:url', url)
  upsertMeta('name', 'twitter:card', 'summary_large_image')
  if (image) upsertMeta('property', 'og:image', image)

  upsertJsonLd(jsonLd)
}

/** 组织信息：站点身份的基础信号，首页写入。 */
export function organizationJsonLd(tagline: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND,
    alternateName: 'OE',
    url: SITE_ORIGIN + '/',
    slogan: tagline,
    description:
      'Oriental Essence curates sneakers, timepieces and apparel — selected for craftsmanship, silhouette and quiet luxury.',
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND,
    alternateName: 'OE',
    url: SITE_ORIGIN + '/',
  }
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: SITE_ORIGIN + pagePath(it.path),
    })),
  }
}
