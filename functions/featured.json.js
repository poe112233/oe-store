/**
 * `GET /featured.json` —— 主站当前精选（落地页取数源）。
 *
 * 站群（oebuylink / kakobuyoe 等）的「热门商品」区在浏览器里拉这份 JSON 重绘，
 * 所以主站后台一改精选、数量或排序，落地页在缓存过期后自动跟着变，不需要重新构建。
 *
 * 数据来自数据面（服务端直连，不受域名白名单影响），缓存 5 分钟。
 */
import { pickFeatured } from './_featured.js'

const UPSTREAM = 'https://oe-brand.app.workbuddy.host'
const REST = UPSTREAM + '/.cloud/database/rest'
const KEY = 'wbpk_LBkK4tO5FUutWDujrDXhyb_jYM6R3tvM50Zst8HehG43terKRDr3fET'
const PROD_SITE = 'https://ores.cc'
const CACHE_SECONDS = 300

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': `public, max-age=${CACHE_SECONDS}`,
}

async function pull(table, query) {
  const res = await fetch(`${REST}/${table}?${query}`, {
    headers: { 'x-wb-webapp-access-key': KEY },
  })
  if (!res.ok) throw new Error(`${table} ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json)) throw new Error(`${table} 非数组响应`)
  return json
}

export async function onRequestGet() {
  try {
    const [settingsRows, products, categories] = await Promise.all([
      pull('site_settings', 'select=data&limit=1'),
      pull('products', 'select=id,category_id,name_en,name_zh,images,sold_count,is_visible,sort_order&order=sort_order.asc,id.asc&limit=3000'),
      pull('categories', 'select=id,slug,name_en,name_zh,group_key,is_visible,sort_order&order=sort_order.asc,id.asc&limit=500'),
    ])
    const s = (settingsRows[0] && settingsRows[0].data) || {}
    const picked = pickFeatured(products, categories, {
      mode: s.featured_mode,
      count: s.featured_count,
      ids: s.featured_ids,
    })
    const catById = new Map(categories.map((c) => [c.id, c]))

    const items = picked.map((p) => {
      const c = catById.get(p.category_id) || {}
      const img = (p.images || [])[0] || ''
      return {
        id: p.id,
        name_en: p.name_en || '',
        name_zh: p.name_zh || '',
        image: img,
        sold: p.sold_count || 0,
        category: { slug: c.slug || '', name_en: c.name_en || '', name_zh: c.name_zh || '' },
        url: `${PROD_SITE}/p/${p.id}/`,
      }
    })

    return new Response(
      JSON.stringify({
        updated: new Date().toISOString(),
        mode: s.featured_mode === 'manual' ? 'manual' : 'auto',
        count: items.length,
        items,
      }),
      { headers: JSON_HEADERS },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err && err.message) || err), items: [] }), {
      status: 502,
      headers: { ...JSON_HEADERS, 'cache-control': 'no-store' },
    })
  }
}

export async function onRequestHead(context) {
  const res = await onRequestGet(context)
  return new Response(null, { status: res.status, headers: res.headers })
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-max-age': '86400',
    },
  })
}
