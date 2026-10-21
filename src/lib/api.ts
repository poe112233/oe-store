import { db, rpc } from './clouddb'
import { getAdminToken } from './localAuth'
import {
  DEFAULT_PRIVATE,
  DEFAULT_SETTINGS,
  type Category,
  type PrivateConfig,
  type Product,
  type SiteSettings,
} from '../types'

export function unwrap<T>(res: { data: T; error: any }): T {
  if (res.error) throw res.error
  return res.data
}

/* ---------------- public reads ---------------- */

/**
 * 只读兜底快照。
 *
 * 数据库被隔离 / 超额 / 欠费时，数据面会返回 DATABASE_RESOURCE_ISOLATED 之类的错误，
 * 整站会直接白屏成「Could not load the catalogue」。此时改用构建期导出的
 * `/data-snapshot.json` 渲染（内容可能滞后，但站点可用、链接全在），
 * 数据库恢复后无需改代码即自动切回实时数据。
 */
type Snapshot = {
  categories?: Category[]
  products?: Product[]
  settings?: Partial<SiteSettings>
  generatedAt?: string
}

let snapPromise: Promise<Snapshot | null> | null = null

function loadSnapshot(): Promise<Snapshot | null> {
  if (!snapPromise) {
    snapPromise = fetch('/data-snapshot.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && Array.isArray(j.products) ? (j as Snapshot) : null))
      .catch(() => null)
  }
  return snapPromise
}

function warnFallback(what: string, e: unknown) {
  if (typeof console !== 'undefined') {
    console.warn(`[oe] ${what} 实时数据不可用，改用本地快照`, e)
  }
}

export async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await db
      .from('categories')
      .select('id, group_key, name_en, name_zh, slug, sort_order, is_visible')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    const rows = unwrap(res) ?? []
    if (rows.length) return rows
  } catch (e) {
    warnFallback('categories', e)
  }
  const snap = await loadSnapshot()
  return snap?.categories ?? []
}

export async function fetchProducts(): Promise<Product[]> {
  try {
    const res = await db
      .from('products')
      .select('id, category_id, name_en, name_zh, images, links, sort_order, is_visible, clicks, sold_count')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    const rows = unwrap(res) ?? []
    if (rows.length) return rows
  } catch (e) {
    warnFallback('products', e)
  }
  const snap = await loadSnapshot()
  return snap?.products ?? []
}

export async function fetchSettings(): Promise<SiteSettings> {
  try {
    const res = await db.from('site_settings').select('data').limit(1)
    const rows = unwrap(res) ?? []
    const data = rows[0]?.data ?? {}
    if (Object.keys(data).length) {
      return { ...DEFAULT_SETTINGS, ...data, contact: { ...DEFAULT_SETTINGS.contact, ...(data.contact ?? {}) } }
    }
  } catch (e) {
    warnFallback('settings', e)
  }
  const snap = await loadSnapshot()
  const data = snap?.settings ?? {}
  return { ...DEFAULT_SETTINGS, ...data, contact: { ...DEFAULT_SETTINGS.contact, ...(data.contact ?? {}) } }
}

/* ------------------------------------------------------------------ *
 * 管理员数据通道
 *
 * 后台有两种登录方式：
 *   · 邮箱登录  —— 原生云会话，RLS 里的 is_admin() 认 auth.uid()
 *   · 本地管理员账号 —— 自签 token，没有云会话，RLS 认不出来
 *
 * 因此本地会话下所有管理员读写都改走 SECURITY DEFINER 的 oe_admin_read /
 * oe_admin_write（函数内部校验 token，再以表属主身份执行，天然绕过 RLS）。
 * 业务代码不需要关心自己处在哪种登录态。
 * ------------------------------------------------------------------ */

type Row = Record<string, unknown>

function token(): string | null {
  return getAdminToken()
}

/** 读一张「仅管理员可见」的表（private_config 等）。 */
async function adminRead(table: string, limit = 1000): Promise<Row[]> {
  const t = token()
  if (!t) {
    return (unwrap(await db.from(table).select('*').limit(limit)) ?? []) as Row[]
  }
  const res = await rpc('oe_admin_read', { p_token: t, p_table: table, p_limit: limit })
  return (unwrap(res) ?? []) as Row[]
}

async function adminInsert(table: string, payload: Row | Row[]): Promise<Row[]> {
  const t = token()
  if (!t) {
    return (unwrap(await (db.from(table) as any).insert(payload).select()) ?? []) as Row[]
  }
  const res = await rpc('oe_admin_write', {
    p_token: t,
    p_table: table,
    p_action: 'insert',
    p_payload: payload,
    p_match: {},
  })
  return (unwrap(res) ?? []) as Row[]
}

async function adminUpdate(table: string, patch: Row, match: Row): Promise<Row[]> {
  const t = token()
  if (!t) {
    let q: any = (db.from(table) as any).update(patch)
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
    return (unwrap(await q.select()) ?? []) as Row[]
  }
  const res = await rpc('oe_admin_write', {
    p_token: t,
    p_table: table,
    p_action: 'update',
    p_payload: patch,
    p_match: match,
  })
  return (unwrap(res) ?? []) as Row[]
}

async function adminDelete(table: string, match: Row): Promise<Row[]> {
  const t = token()
  if (!t) {
    let q: any = db.from(table).delete()
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
    return (unwrap(await q.select()) ?? []) as Row[]
  }
  const res = await rpc('oe_admin_write', {
    p_token: t,
    p_table: table,
    p_action: 'delete',
    p_payload: {},
    p_match: match,
  })
  return (unwrap(res) ?? []) as Row[]
}

/* ---------------- admin: site content ---------------- */

export async function saveSettings(data: SiteSettings): Promise<void> {
  const existing = await adminRead('site_settings')
  const patch = { data, updated_at: new Date().toISOString() }
  if (existing.length) {
    const rows = await adminUpdate('site_settings', patch, { id: existing[0].id })
    if (!rows.length) throw new Error('保存失败：没有权限或记录不存在')
  } else {
    const rows = await adminInsert('site_settings', { data })
    if (!rows.length) throw new Error('保存失败')
  }
}

/* ---------------- admin: private config ---------------- */

export async function fetchPrivateConfig(): Promise<PrivateConfig> {
  const rows = await adminRead('private_config')
  return { ...DEFAULT_PRIVATE, ...((rows[0]?.data as Partial<PrivateConfig>) ?? {}) }
}

export async function savePrivateConfig(data: PrivateConfig): Promise<void> {
  const existing = await adminRead('private_config')
  const patch = { data, updated_at: new Date().toISOString() }
  if (existing.length) {
    const rows = await adminUpdate('private_config', patch, { id: existing[0].id })
    if (!rows.length) throw new Error('保存失败：没有权限')
  } else {
    const rows = await adminInsert('private_config', { data })
    if (!rows.length) throw new Error('保存失败')
  }
}

/* ---------------- admin: categories ---------------- */

export async function createCategory(payload: Partial<Category>): Promise<void> {
  const rows = await adminInsert('categories', payload as Row)
  if (!rows.length) throw new Error('创建失败：没有管理员权限')
}

export async function updateCategory(id: number, patch: Partial<Category>): Promise<void> {
  const rows = await adminUpdate('categories', patch as Row, { id })
  if (!rows.length) throw new Error('更新失败：没有管理员权限')
}

export async function deleteCategory(id: number): Promise<void> {
  const rows = await adminDelete('categories', { id })
  if (!rows.length) throw new Error('删除失败：没有管理员权限')
}

/* ---------------- admin: products ---------------- */

export async function createProduct(payload: Partial<Product>): Promise<Product | null> {
  const rows = await adminInsert('products', payload as Row)
  if (!rows.length) throw new Error('创建失败：没有管理员权限')
  return rows[0] as unknown as Product
}

export async function createProductsBulk(payloads: Partial<Product>[]): Promise<number> {
  if (!payloads.length) return 0
  let done = 0
  for (let i = 0; i < payloads.length; i += 50) {
    const chunk = payloads.slice(i, i + 50)
    const rows = await adminInsert('products', chunk as Row[])
    done += rows.length
    if (!rows.length) throw new Error('批量写入被拒绝：没有管理员权限')
  }
  return done
}

export async function updateProduct(id: number, patch: Partial<Product>): Promise<void> {
  const rows = await adminUpdate('products', patch as Row, { id })
  if (!rows.length) throw new Error('更新失败：没有管理员权限')
}

export async function deleteProduct(id: number): Promise<void> {
  const rows = await adminDelete('products', { id })
  if (!rows.length) throw new Error('删除失败：没有管理员权限')
}

/** 访客点击购买时累加计数：走 SECURITY DEFINER 函数，无需登录。 */
export async function trackClick(id: number): Promise<void> {
  try {
    await rpc('increment_clicks', { pid: id })
  } catch {
    /* 计数失败不影响跳转 */
  }
}
