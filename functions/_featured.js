/**
 * 精选推荐算法（Pages Function 版，与 src/lib/featured.ts 保持同一套规则）。
 *
 * 复制一份的理由：Functions 与前端是两个构建产物，前端那份依赖 React 生态与 TS 路径，
 * 不能直接 import。两份规则必须同步改 —— 改动点集中在 pickFeatured() 内部。
 */

export const FEATURED_DEFAULT = 12
export const FEATURED_MAX = 24

const MIN_PER_GROUP = 1
const MIN_IMAGES = 2
const GROUPS = ['shoes', 'watches', 'apparel']

function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function weightedSample(weights, n, rand) {
  const idx = weights.map((_, i) => i)
  const w = weights.slice()
  const out = []
  while (out.length < n && idx.length) {
    const total = w.reduce((s, x) => s + x, 0)
    if (total <= 0) break
    let r = rand() * total
    let k = 0
    for (; k < w.length - 1; k++) {
      r -= w[k]
      if (r <= 0) break
    }
    out.push(idx[k])
    idx.splice(k, 1)
    w.splice(k, 1)
  }
  return out
}

function productWeight(p) {
  const imgs = (p.images || []).length
  const imgBoost = imgs >= 6 ? 4 : imgs >= 3 ? 3 : imgs >= 2 ? 2 : 1
  const sold = 1 + Math.log1p(Math.max(0, p.sold_count || 0))
  return imgBoost * sold
}

function pickInCat(list, rand) {
  const k = weightedSample(list.map(productWeight), 1, rand)[0]
  return list[k ?? 0]
}

/**
 * @param {object[]} products
 * @param {object[]} categories
 * @param {{mode?:string,count?:number,ids?:number[]}} cfg
 * @param {Date} seedDate
 */
export function pickFeatured(products, categories, cfg = {}, seedDate = new Date()) {
  const visibleCats = (categories || []).filter((c) => c.is_visible)
  const count = Math.min(FEATURED_MAX, Math.max(1, Math.round(Number(cfg.count) || FEATURED_DEFAULT)))
  const maxPerGroup = Math.max(2, Math.ceil(count / 3))

  const catById = new Map(visibleCats.map((c) => [c.id, c]))
  const base = (products || []).filter(
    (p) =>
      p.is_visible &&
      (p.images || []).length > 0 &&
      p.category_id != null &&
      catById.has(p.category_id),
  )
  const rich = base.filter((p) => (p.images || []).length >= MIN_IMAGES)
  const usable = rich.length >= count * 2 ? rich : base
  if (!usable.length) return []

  if (cfg.mode === 'manual') {
    const seen = new Set()
    const out = []
    for (const id of cfg.ids || []) {
      if (out.length >= count) break
      const p = usable.find((x) => x.id === id)
      if (!p || seen.has(p.id)) continue
      seen.add(p.id)
      out.push(p)
    }
    if (out.length) return out
  }

  const byCat = new Map()
  for (const p of usable) {
    const arr = byCat.get(p.category_id)
    if (arr) arr.push(p)
    else byCat.set(p.category_id, [p])
  }

  const rand = makeRng(hashStr(seedDate.toISOString().slice(0, 10) + '|featured|v1'))
  const picked = []
  const usedCat = new Set()
  const groupUsed = { shoes: 0, watches: 0, apparel: 0 }

  // 自动模式下的「置顶」：后台勾选的商品固定占位，其余按每日随机补齐
  for (const id of cfg.ids || []) {
    if (picked.length >= count) break
    const p = usable.find((x) => x.id === id)
    if (!p || picked.some((x) => x.id === p.id)) continue
    picked.push(p)
    usedCat.add(p.category_id)
    const g = typeof p.category_id === 'number' ? (catById.get(p.category_id) || {}).group_key : null
    if (g && g in groupUsed) groupUsed[g]++
  }

  for (const g of GROUPS) {
    if (picked.length >= count) break
    if ((groupUsed[g] || 0) >= MIN_PER_GROUP) continue
    const pool = visibleCats.filter(
      (c) => c.group_key === g && !usedCat.has(c.id) && ((byCat.get(c.id) || []).length > 0),
    )
    if (!pool.length) continue
    const k = weightedSample(pool.map((c) => Math.sqrt(byCat.get(c.id).length)), 1, rand)[0]
    const c = pool[k]
    picked.push(pickInCat(byCat.get(c.id), rand))
    usedCat.add(c.id)
    groupUsed[g]++
  }

  while (picked.length < count) {
    const pool = visibleCats.filter(
      (c) =>
        !usedCat.has(c.id) &&
        ((byCat.get(c.id) || []).length > 0) &&
        (groupUsed[c.group_key] ?? 0) < maxPerGroup,
    )
    if (!pool.length) break
    const k = weightedSample(pool.map((c) => Math.sqrt(byCat.get(c.id).length)), 1, rand)[0]
    if (k === undefined) break
    const c = pool[k]
    picked.push(pickInCat(byCat.get(c.id), rand))
    usedCat.add(c.id)
    groupUsed[c.group_key] = (groupUsed[c.group_key] ?? 0) + 1
  }

  return picked
}
