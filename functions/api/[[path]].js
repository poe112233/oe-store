/**
 * Pages Functions —— 自建数据接口（Cloudflare D1）。
 *
 * 取代原先转发到 WorkBuddy/CloudBase 的代理：数据库被隔离时整站会挂，
 * 现在数据就在同一个 Cloudflare 账号里的 D1，读写都在边缘完成。
 *
 * 路由：
 *   GET    /api/db/<table>?select=a,b&order=c.asc&limit=100&<col>=eq.<v>
 *   POST   /api/db/<table>            （body: 对象或数组 → INSERT，返回新行）
 *   PATCH  /api/db/<table>?...        （body: patch → UPDATE，返回改后的行）
 *   DELETE /api/db/<table>?...        （返回被删的行）
 *   POST   /api/rpc                   （body: { fn, args } → { data } 或错误）
 *
 * 写操作一律要求管理员 token（admin_sessions）；公开读取只放行白名单表与字段。
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

const PUBLIC_TABLES = {
  categories: ['id', 'group_key', 'name_en', 'name_zh', 'slug', 'sort_order', 'is_visible', 'parent_id'],
  products: ['id', 'category_id', 'name_en', 'name_zh', 'images', 'links', 'sort_order', 'is_visible', 'clicks', 'sold_count', 'created_at'],
  site_settings: ['id', 'data', 'updated_at'],
}

const ADMIN_TABLES = {
  categories: ['id', 'slug', 'name_en', 'name_zh', 'group_key', 'sort_order', 'is_visible', 'parent_id'],
  products: ['id', 'category_id', 'name_en', 'name_zh', 'images', 'links', 'sort_order', 'is_visible', 'clicks', 'sold_count', 'created_at'],
  site_settings: ['id', 'data', 'updated_at'],
  private_config: ['id', 'data', 'updated_at'],
  api_tokens: ['id', 'label', 'token_hash', 'token_hint', 'token_plain', 'created_at', 'last_used_at', 'use_count', 'revoked'],
  admins: ['id', 'username', 'display_name', 'last_login_at', 'created_at'],
}

const SESSION_DAYS = 30

/* ---------------- 基础工具 ---------------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function fail(code, status = 400, extra = {}) {
  return json({ code, message: code, ...extra }, status)
}

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

function randHex(n = 32) {
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return hex(b)
}

async function pbkdf2(password, saltHex, iterations = 100000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)))
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
  return hex(bits)
}

async function hashPassword(password) {
  const salt = randHex(16)
  const h = await pbkdf2(password, salt)
  return `pbkdf2$${100000}$${salt}$${h}`
}

async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored || '').split('$')
  if (scheme !== 'pbkdf2') return false
  const h = await pbkdf2(password, salt, Number(iter) || 100000)
  // 定长比较
  if (h.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}

/* ---------------- 鉴权 ---------------- */

async function currentAdmin(env, token) {
  if (!token) return null
  const th = await sha256(token)
  const row = await env.DB.prepare(
    `SELECT a.id, a.username, a.display_name, s.expires_at
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.token = ?1`,
  )
    .bind(th)
    .first()
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?1').bind(th).run()
    return null
  }
  return row
}


/**
 * 只读查询走 D1 读复制（任意副本即可）。
 * 写入必须回主库，所以只有读路径用这个。
 */
function readDb(env) {
  try {
    if (env.DB && typeof env.DB.withSession === 'function') {
      return env.DB.withSession('first-unconstrained')
    }
  } catch {
    /* 运行时不支持就退回主库 */
  }
  return env.DB
}

/* ---------------- 查询构造 ---------------- */

function parseSelect(table, cols, allowed) {
  if (!cols || cols === '*') return [...allowed]
  const want = cols.split(',').map((s) => s.trim()).filter(Boolean)
  return want.filter((c) => allowed.includes(c))
}

function parseOrder(order, allowed) {
  if (!order) return ''
  const parts = order.split(',').map((s) => s.trim()).filter(Boolean)
  const out = []
  for (const p of parts) {
    const [col, dir] = p.split('.')
    if (!allowed.includes(col)) continue
    out.push(`${col} ${String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`)
  }
  return out.length ? ` ORDER BY ${out.join(', ')}` : ''
}

function coerce(v) {
  if (v === 'true') return 1
  if (v === 'false') return 0
  if (/^-?\d+$/.test(v)) return Number(v)
  if (v === 'null') return null
  return v
}

function buildWhere(params, allowed) {
  const clauses = []
  const binds = []
  for (const [k, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue
    if (!allowed.includes(k)) continue
    const [op, ...rest] = String(raw).split('.')
    const val = rest.join('.')
    if (op === 'eq') {
      clauses.push(`${k} = ?${binds.length + 1}`)
      binds.push(coerce(val))
    } else if (op === 'neq') {
      clauses.push(`${k} <> ?${binds.length + 1}`)
      binds.push(coerce(val))
    } else if (op === 'lt' || op === 'gt') {
      clauses.push(`${k} ${op === 'lt' ? '<' : '>'} ?${binds.length + 1}`)
      binds.push(coerce(val))
    } else if (op === 'is') {
      clauses.push(`${k} IS ${val === 'null' ? 'NULL' : 'NOT NULL'}`)
    }
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', binds }
}

function rowOut(table, row) {
  const out = { ...row }
  for (const k of ['images', 'links', 'data']) {
    if (typeof out[k] === 'string') {
      try {
        out[k] = JSON.parse(out[k])
      } catch {
        /* 保持原样 */
      }
    }
  }
  if ('is_visible' in out) out.is_visible = !!out.is_visible
  if ('revoked' in out) out.revoked = !!out.revoked
  return out
}

function encode(table, value) {
  if (value === undefined) return null
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

/* ---------------- 表操作 ---------------- */

async function listRows(env, table, url, allowed) {
  const cols = parseSelect(table, url.searchParams.get('select'), allowed)
  const where = buildWhere(url.searchParams, allowed)
  const order = parseOrder(url.searchParams.get('order'), allowed)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 2000, 5000)
  const offset = Number(url.searchParams.get('offset')) || 0
  const sql = `SELECT ${cols.join(', ')} FROM ${table}${where.sql}${order} LIMIT ${limit} OFFSET ${offset}`
  const { results } = await readDb(env).prepare(sql).bind(...where.binds).all()
  return (results || []).map((r) => rowOut(table, r))
}

async function insertRows(env, table, payload, allowed) {
  const rows = Array.isArray(payload) ? payload : [payload]
  const out = []
  for (const r of rows) {
    const cols = Object.keys(r).filter((k) => allowed.includes(k))
    if (!cols.length) continue
    const placeholders = cols.map((_, i) => `?${i + 1}`).join(', ')
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`
    const res = await env.DB.prepare(sql)
      .bind(...cols.map((c) => encode(table, r[c])))
      .first()
    if (res) out.push(rowOut(table, res))
  }
  return out
}

async function updateRows(env, table, payload, url, allowed) {
  const cols = Object.keys(payload || {}).filter((k) => allowed.includes(k) && k !== 'id')
  if (!cols.length) return []
  const where = buildWhere(url.searchParams, allowed)
  if (!where.sql) throw new Error('REFUSE_UPDATE_WITHOUT_FILTER')
  const sets = cols.map((c, i) => `${c} = ?${i + 1}`).join(', ')
  const sql = `UPDATE ${table} SET ${sets}${where.sql.replace(/\?(\d+)/g, (_, n) => `?${Number(n) + cols.length}`)} RETURNING *`
  const { results } = await env.DB.prepare(sql)
    .bind(...cols.map((c) => encode(table, payload[c])), ...where.binds)
    .all()
  return (results || []).map((r) => rowOut(table, r))
}

async function deleteRows(env, table, url, allowed) {
  const where = buildWhere(url.searchParams, allowed)
  if (!where.sql) throw new Error('REFUSE_DELETE_WITHOUT_FILTER')
  const { results } = await env.DB.prepare(`DELETE FROM ${table}${where.sql} RETURNING *`)
    .bind(...where.binds)
    .all()
  return (results || []).map((r) => rowOut(table, r))
}


/* ---------------- 对外 API 密钥 ---------------- */

async function requireApiKey(env, key) {
  if (!key) throw new Error('INVALID_API_KEY')
  const hash = await sha256(String(key))
  const row = await env.DB.prepare('SELECT id FROM api_tokens WHERE token_hash = ?1 AND revoked = 0').bind(hash).first()
  if (!row) throw new Error('INVALID_API_KEY')
  await env.DB.prepare("UPDATE api_tokens SET use_count = use_count + 1, last_used_at = datetime('now') WHERE id = ?1")
    .bind(row.id)
    .run()
  return row.id
}

/* ---------------- RPC ---------------- */

async function rpcHandler(env, fn, a) {
  switch (fn) {
    /* --- 登录 / 会话 --- */
    case 'oe_admin_login': {
      const username = String(a.p_username || '').trim()
      const password = String(a.p_password || '').trim()  // 去掉复制粘贴带进来的首尾空白
      if (!username || !password) throw new Error('INVALID_CREDENTIALS')
      const admin = await env.DB.prepare('SELECT * FROM admins WHERE username = ?1').bind(username).first()
      if (!admin) throw new Error('INVALID_CREDENTIALS')
      if (!(await verifyPassword(password, admin.password_hash))) throw new Error('INVALID_CREDENTIALS')
      const token = randHex(32)
      const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()
      await env.DB.batch([
        env.DB.prepare('INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES (?1, ?2, ?3)').bind(
          await sha256(token),
          admin.id,
          expires,
        ),
        env.DB.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?1").bind(admin.id),
      ])
      return { token, username: admin.username, display_name: admin.display_name || admin.username }
    }
    case 'oe_admin_me': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      return { username: admin.username, display_name: admin.display_name || admin.username }
    }
    case 'oe_admin_logout': {
      if (a.p_token) await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?1').bind(await sha256(a.p_token)).run()
      return { ok: true }
    }
    case 'oe_admin_change_password': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      const row = await env.DB.prepare('SELECT password_hash FROM admins WHERE id = ?1').bind(admin.id).first()
      if (!(await verifyPassword(String(a.p_old || ''), row.password_hash))) throw new Error('INVALID_CREDENTIALS')
      if (String(a.p_new || '').length < 6) throw new Error('PASSWORD_TOO_SHORT')
      await env.DB.prepare('UPDATE admins SET password_hash = ?1 WHERE id = ?2')
        .bind(await hashPassword(String(a.p_new)), admin.id)
        .run()
      return { ok: true }
    }

    /* --- 账号管理 --- */
    case 'oe_admin_list_accounts': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      const { results } = await env.DB.prepare(
        'SELECT username, display_name, 1 AS is_active, created_at, last_login_at FROM admins ORDER BY id',
      ).all()
      return { accounts: results || [], current: admin.username }
    }
    case 'oe_admin_set_account': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      const username = String(a.p_username || '').trim()
      if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) throw new Error('BAD_USERNAME')
      const display = String(a.p_display_name || username)
      const exists = await env.DB.prepare('SELECT id FROM admins WHERE username = ?1').bind(username).first()
      if (exists) {
        if (a.p_password) {
          await env.DB.prepare('UPDATE admins SET password_hash = ?1, display_name = ?2 WHERE id = ?3')
            .bind(await hashPassword(String(a.p_password)), display, exists.id)
            .run()
        } else {
          await env.DB.prepare('UPDATE admins SET display_name = ?1 WHERE id = ?2').bind(display, exists.id).run()
        }
      } else {
        if (String(a.p_password || '').length < 6) throw new Error('PASSWORD_TOO_SHORT')
        await env.DB.prepare('INSERT INTO admins (username, password_hash, display_name) VALUES (?1, ?2, ?3)')
          .bind(username, await hashPassword(String(a.p_password)), display)
          .run()
      }
      return { ok: true }
    }
    case 'oe_admin_delete_account': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      const username = String(a.p_username || '')
      if (username === admin.username) throw new Error('CANNOT_DELETE_SELF')
      const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first()
      if ((cnt?.n || 0) <= 1) throw new Error('LAST_ADMIN')
      await env.DB.prepare('DELETE FROM admins WHERE username = ?1').bind(username).run()
      return { ok: true }
    }

    /* --- 对外 API 密钥 --- */
    case 'oe_admin_api_tokens': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      const { results } = await env.DB.prepare(
        'SELECT id, label, token_hint, token_plain, created_at, last_used_at, use_count, revoked FROM api_tokens ORDER BY id',
      ).all()
      return (results || []).map((r) => ({ ...r, revoked: !!r.revoked }))
    }
    case 'oe_admin_api_token_create': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      const key = 'oe_' + randHex(24)
      const row = await env.DB.prepare(
        'INSERT INTO api_tokens (label, token_hash, token_hint, token_plain) VALUES (?1, ?2, ?3, ?4) RETURNING id, label',
      )
        .bind(String(a.p_label || ''), await sha256(key), key.slice(0, 11), key)
        .first()
      return { id: row.id, label: row.label, token: key }
    }
    case 'oe_admin_api_token_revoke': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      await env.DB.prepare('UPDATE api_tokens SET revoked = ?1 WHERE id = ?2').bind(a.p_revoked ? 1 : 0, a.p_id).run()
      return { ok: true }
    }

    /* --- 通用读写（后台所有表） --- */
    case 'oe_admin_read': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      const table = String(a.p_table || '')
      const allowed = ADMIN_TABLES[table]
      if (!allowed) throw new Error('BAD_TABLE')
      const limit = Math.min(Number(a.p_limit) || 500, 2000)
      const { results } = await readDb(env).prepare(`SELECT ${allowed.join(', ')} FROM ${table} LIMIT ${limit}`).all()
      return (results || []).map((r) => rowOut(table, r))
    }
    case 'oe_admin_write': {
      const admin = await currentAdmin(env, a.p_token)
      if (!admin) throw new Error('NOT_ADMIN')
      const table = String(a.p_table || '')
      const allowed = ADMIN_TABLES[table]
      if (!allowed) throw new Error('BAD_TABLE')
      const action = String(a.p_action || '')
      const payload = a.p_payload ?? {}
      const match = a.p_match ?? {}
      if (action === 'insert') {
        const rows = await insertRows(env, table, payload, allowed)
        return rows
      }
      const cols = Object.keys(match).filter((k) => allowed.includes(k))
      if (!cols.length) throw new Error('MATCH_REQUIRED')
      const whereSql = ' WHERE ' + cols.map((c, i) => `${c} = ?${i + 1}`).join(' AND ')
      const whereBinds = cols.map((c) => encode(table, match[c]))
      if (action === 'update') {
        const sets = Object.keys(payload).filter((k) => allowed.includes(k) && k !== 'id')
        if (!sets.length) return []
        const sql = `UPDATE ${table} SET ${sets.map((c, i) => `${c} = ?${i + 1}`).join(', ')}${whereSql.replace(
          /\?(\d+)/g,
          (_, n) => `?${Number(n) + sets.length}`,
        )} RETURNING *`
        const { results } = await env.DB.prepare(sql)
          .bind(...sets.map((c) => encode(table, payload[c])), ...whereBinds)
          .all()
        return (results || []).map((r) => rowOut(table, r))
      }
      if (action === 'delete') {
        const { results } = await env.DB.prepare(`DELETE FROM ${table}${whereSql} RETURNING *`)
          .bind(...whereBinds)
          .all()
        return (results || []).map((r) => rowOut(table, r))
      }
      throw new Error('BAD_ACTION')
    }

    /* --- 访客计数 --- */
    case 'increment_clicks': {
      const pid = Number(a.pid)
      if (!pid) return { ok: false }
      await env.DB.prepare('UPDATE products SET clicks = clicks + 1 WHERE id = ?1').bind(pid).run()
      return { ok: true }
    }

    /* --- 对外 API（p_key 鉴权，给脚本/表格用） --- */
    case 'oe_api_products': {
      await requireApiKey(env, a.p_key)
      const limit = Math.min(Number(a.p_limit) || 200, 1000)
      const offset = Number(a.p_offset) || 0
      const { results } = await readDb(env).prepare(
        `SELECT ${ADMIN_TABLES.products.join(', ')} FROM products WHERE is_visible = 1 ORDER BY sort_order ASC, id ASC LIMIT ${limit} OFFSET ${offset}`,
      ).all()
      return (results || []).map((r) => rowOut('products', r))
    }
    case 'oe_api_categories': {
      await requireApiKey(env, a.p_key)
      const { results } = await readDb(env).prepare(
        `SELECT ${ADMIN_TABLES.categories.join(', ')} FROM categories ORDER BY sort_order ASC, id ASC`,
      ).all()
      return (results || []).map((r) => rowOut('categories', r))
    }
    case 'oe_api_product_save': {
      await requireApiKey(env, a.p_key)
      const data = a.p_data || {}
      const id = Number(data.id) || 0
      if (id) {
        const rows = await updateRows(
          env, 'products', data,
          new URL('https://x/?id=eq.' + id),
          ADMIN_TABLES.products,
        )
        return rows[0] || null
      }
      const rows = await insertRows(env, 'products', data, ADMIN_TABLES.products)
      return rows[0] || null
    }
    case 'oe_api_product_delete': {
      await requireApiKey(env, a.p_key)
      const id = Number(a.p_id) || 0
      if (!id) throw new Error('BAD_ID')
      const { results } = await env.DB.prepare('DELETE FROM products WHERE id = ?1 RETURNING id').bind(id).all()
      return { deleted: (results || []).length }
    }

    default:
      throw new Error('UNKNOWN_FUNCTION')
  }
}

/* ---------------- 入口 ---------------- */

export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api/, '')

  if (!env.DB) return fail('DB_NOT_BOUND', 500)

  try {
    if (path === '/rpc' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      try {
        const data = await rpcHandler(env, String(body.fn || ''), body.args || {})
        return json({ data })
      } catch (e) {
        const code = String((e && e.message) || 'ERROR')
        const status = code === 'NOT_ADMIN' ? 401 : 400
        return json({ error: { code, message: code } }, status)
      }
    }

    const m = path.match(/^\/db\/([a-z_]+)$/)
    if (m) {
      const table = m[1]
      if (request.method === 'GET') {
        const allowed = PUBLIC_TABLES[table]
        if (!allowed) return fail('BAD_TABLE', 404)
        return json(await listRows(env, table, url, allowed))
      }
      // 写操作必须有管理员会话
      const token = request.headers.get('x-oe-admin') || ''
      const admin = await currentAdmin(env, token)
      if (!admin) return fail('NOT_ADMIN', 401)
      const allowed = ADMIN_TABLES[table]
      if (!allowed) return fail('BAD_TABLE', 404)
      const body = await request.json().catch(() => ({}))
      if (request.method === 'POST') return json(await insertRows(env, table, body, allowed))
      if (request.method === 'PATCH') return json(await updateRows(env, table, body, url, allowed))
      if (request.method === 'DELETE') return json(await deleteRows(env, table, url, allowed))
      return fail('METHOD_NOT_ALLOWED', 405)
    }

    return fail('NOT_FOUND', 404)
  } catch (e) {
    return fail(String((e && e.message) || 'SERVER_ERROR'), 500)
  }
}
