import { GROUPS } from '../config'
import type { Category, Product } from '../types'

/**
 * 首页「精选推荐」选品。
 *
 * 旧逻辑：按 products 顺序取「每个分类的第一件」→ 永远同样 8 件、且都集中在
 * 排序最前的分类里。
 *
 * 新逻辑：**每日轮换的确定性随机**
 *   · 以日期串做种子（mulberry32），同一天内多次访问结果一致，次日自动换新；
 *   · 分类维度：按「可用商品数」加权随机抽 8 个不同分类（每次访问同一分类最多出 1 件），
 *     三大类每组保底 1 个、每组最多 4 个 —— 避免 8 件全是鞋或全是表；
 *   · 商品维度：在选中的分类里加权随机，偏好「图多（≥3 张）」与「已售高」的款，
 *     降低抽到单图/冷门款拉低观感的概率；
 *   · 只挑有图、可见、且归属可见分类的商品。
 *
 * 想临时钉死某几件：把 id 填进 PIN_IDS（会优先占位，其余按算法补齐）。
 */
const PIN_IDS: number[] = []

const SLOTS = 8
const MAX_PER_GROUP = 4
const MIN_PER_GROUP = 1
/** 精选优先多图款（详情页更好看）；候选不足时才退到单图 */
const MIN_IMAGES = 2

/** mulberry32：小、快、确定性 PRNG */
function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 按权重不放回抽样，抽 n 个下标 */
function weightedSample(weights: number[], n: number, rand: () => number): number[] {
  const idx = weights.map((_, i) => i)
  const w = weights.slice()
  const out: number[] = []
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

/** 单件商品的吸引力权重：多图 + 已售高 更容易被选中 */
function productWeight(p: Product) {
  const imgs = p.images?.length || 0
  const imgBoost = imgs >= 6 ? 4 : imgs >= 3 ? 3 : imgs >= 2 ? 2 : 1
  const sold = 1 + Math.log1p(Math.max(0, p.sold_count || 0))
  return imgBoost * sold
}

export function pickFeatured(
  products: Product[],
  categories: Category[],
  seedDate = new Date(),
): Product[] {
  const visibleCats = categories.filter((c) => c.is_visible)

  // 候选：可见 + 有图 + 归属可见分类
  const catById = new Map(visibleCats.map((c) => [c.id, c]))
  const base = products.filter(
    (p) =>
      p.is_visible &&
      (p.images?.length || 0) > 0 &&
      p.category_id != null &&
      catById.has(p.category_id),
  )
  const rich = base.filter((p) => (p.images?.length || 0) >= MIN_IMAGES)
  const usable = rich.length >= SLOTS * 2 ? rich : base
  if (!usable.length) return []

  const byCat = new Map<number, Product[]>()
  for (const p of usable) {
    const k = p.category_id as number
    const arr = byCat.get(k)
    if (arr) arr.push(p)
    else byCat.set(k, [p])
  }

  const rand = makeRng(hashStr(`${seedDate.toISOString().slice(0, 10)}|featured|v1`))
  const picked: Product[] = []
  const usedCat = new Set<number>()
  const groupUsed: Record<string, number> = { shoes: 0, watches: 0, apparel: 0 }

  // 1) 手动钉死
  for (const id of PIN_IDS) {
    if (picked.length >= SLOTS) break
    const p = usable.find((x) => x.id === id)
    if (!p || usedCat.has(p.category_id as number)) continue
    picked.push(p)
    usedCat.add(p.category_id as number)
    const g = catById.get(p.category_id as number)?.group_key
    if (g && g in groupUsed) groupUsed[g]++
  }

  // 2) 每组保底 1 个
  for (const g of GROUPS) {
    if (picked.length >= SLOTS) break
    if (groupUsed[g.key] >= MIN_PER_GROUP) continue
    const pool = visibleCats.filter(
      (c) => c.group_key === g.key && !usedCat.has(c.id) && (byCat.get(c.id)?.length || 0) > 0,
    )
    if (!pool.length) continue
    const k = weightedSample(
      pool.map((c) => Math.sqrt(byCat.get(c.id)!.length)),
      1,
      rand,
    )[0]
    const c = pool[k]
    picked.push(pickInCat(byCat.get(c.id)!, rand))
    usedCat.add(c.id)
    groupUsed[g.key]++
  }

  // 3) 剩余槽位：全分类加权随机（受每组上限约束）
  while (picked.length < SLOTS) {
    const pool = visibleCats.filter(
      (c) =>
        !usedCat.has(c.id) &&
        (byCat.get(c.id)?.length || 0) > 0 &&
        (groupUsed[c.group_key] ?? 0) < MAX_PER_GROUP,
    )
    if (!pool.length) break
    const k = weightedSample(
      pool.map((c) => Math.sqrt(byCat.get(c.id)!.length)),
      1,
      rand,
    )[0]
    if (k === undefined) break
    const c = pool[k]
    picked.push(pickInCat(byCat.get(c.id)!, rand))
    usedCat.add(c.id)
    groupUsed[c.group_key] = (groupUsed[c.group_key] ?? 0) + 1
  }

  return picked
}

/** 在某个分类里按权重抽一件 */
function pickInCat(list: Product[], rand: () => number): Product {
  const k = weightedSample(list.map(productWeight), 1, rand)[0]
  return list[k ?? 0]
}
