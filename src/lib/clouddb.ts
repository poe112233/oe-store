import { getAdminToken } from './localAuth'

/**
 * 极简数据通道 —— 直接打本站 `/api`（Cloudflare Pages Functions + D1）。
 *
 * 为什么不再用云 SDK：数据面在腾讯云 CloudBase，实例一旦被隔离（欠费/到期）
 * 整站立刻 503，且不在同一个云账号里。现在读写都在 CF 边缘完成。
 *
 * 这里刻意复刻了原 SDK 的调用形状（`db.from(t).select(...).order(...)` 与
 * `rpc(fn, args)` 都返回 `{ data, error }`），所以业务代码几乎不用改：
 *   unwrap(res) / ensure(res) 的判错逻辑照旧。
 */

type Res<T = unknown> = { data: T | null; error: { code: string; message: string } | null }

const BASE = '/api'

function adminHeaders(): Record<string, string> {
  const t = getAdminToken()
  return t ? { 'x-oe-admin': t } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<Res<T>> {
  try {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    })
    const text = await res.text()
    const body = text ? JSON.parse(text) : null
    if (!res.ok) {
      const err = body?.error ?? body ?? { code: `HTTP_${res.status}`, message: `HTTP_${res.status}` }
      return { data: null, error: { code: String(err.code || `HTTP_${res.status}`), message: String(err.message || err.code || res.statusText) } }
    }
    return { data: (body as T) ?? null, error: null }
  } catch (e) {
    return { data: null, error: { code: 'NETWORK', message: String((e as Error)?.message || e) } }
  }
}

/**
 * 调后端 RPC：返回形状与云 SDK 一致（`{ data, error }`）。
 * 服务端统一回 `{ data: <返回值> }`，这里要剥掉外层，否则业务侧拿到的会是
 * `{ data: {...} }` 而不是 `{...}`（登录时就会表现为「有 token 却报密码错误」）。
 */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<Res<T>> {
  const res = await request<{ data: T } | T>('/rpc', { method: 'POST', body: JSON.stringify({ fn, args }) })
  if (res.error) return { data: null, error: res.error }
  const body = res.data as unknown
  const unwrapped =
    body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')
      ? (body as { data: T }).data
      : (body as T)
  return { data: (unwrapped ?? null) as T | null, error: null }
}

type OrderDir = { ascending?: boolean }

class Query {
  private table: string
  private op: 'select' | 'insert' | 'update' | 'delete' | null = null
  private cols = '*'
  private orders: string[] = []
  private limitN?: number
  private filters: [string, string][] = []
  private body: unknown

  constructor(table: string) {
    this.table = table
  }

  select(cols = '*') {
    this.cols = cols
    if (!this.op) this.op = 'select'
    return this
  }
  insert(payload: unknown) {
    this.op = 'insert'
    this.body = payload
    return this
  }
  update(patch: unknown) {
    this.op = 'update'
    this.body = patch
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  order(col: string, opts: OrderDir = { ascending: true }) {
    this.orders.push(`${col}.${opts.ascending === false ? 'desc' : 'asc'}`)
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  eq(col: string, value: unknown) {
    this.filters.push([col, `eq.${String(value)}`])
    return this
  }

  private qs(): string {
    const p = new URLSearchParams()
    if (this.cols && this.cols !== '*') p.set('select', this.cols)
    if (this.orders.length) p.set('order', this.orders.join(','))
    if (this.limitN) p.set('limit', String(this.limitN))
    for (const [k, v] of this.filters) p.set(k, v)
    const s = p.toString()
    return s ? '?' + s : ''
  }

  private run(): Promise<Res<unknown>> {
    const op = this.op ?? 'select'
    if (op === 'select') return request(`/db/${this.table}${this.qs()}`)
    if (op === 'insert') {
      // insert 之后若还调用了 .select()，服务端已经 RETURNING *，直接用返回值
      return request(`/db/${this.table}`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(this.body ?? {}),
      })
    }
    if (op === 'update') {
      return request(`/db/${this.table}${this.qs()}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify(this.body ?? {}),
      })
    }
    return request(`/db/${this.table}${this.qs()}`, { method: 'DELETE', headers: adminHeaders() })
  }

  // 让 `await q.select()` / `await q.insert(...).select()` 触发真实请求
  then<TResult1 = Res<unknown>, TResult2 = never>(
    onfulfilled?: ((value: Res<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected)
  }
}

export const db = {
  from(table: string) {
    return new Query(table)
  },
}
