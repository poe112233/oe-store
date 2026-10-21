import { db, rpc } from './clouddb'

/**
 * 后台「本地管理员账号」会话层。
 *
 * 平台只允许用邮箱 / 手机号注册终端用户（且注册必须过验证码），无法凭空造出不绑邮箱的账号。
 * 因此这里自建了一套独立的账号体系：账号 + 密码存在 admin_accounts 表里（bcrypt 哈希），
 * 登录成功由数据库签发一个随机 token，前端存 localStorage。
 *
 * 所有校验都在 SECURITY DEFINER 函数里完成，表本身开了 RLS 且没有任何策略 —— 客户端
 * 既读不到密码哈希，也写不了账号，只能通过 RPC 走受控入口。
 */

const TOKEN_KEY = 'oe_admin_token'

let cached: string | null | undefined

export function getAdminToken(): string | null {
  if (cached !== undefined) return cached
  try {
    cached = localStorage.getItem(TOKEN_KEY)
  } catch {
    cached = null
  }
  return cached
}

export function setAdminToken(token: string | null): void {
  cached = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* 隐私模式下 localStorage 可能不可用，退化为仅内存会话 */
  }
}

/** 当前是否处在「本地管理员账号」登录态（不代表 token 仍然有效，需 adminMe() 确认）。 */
export function isLocalAdmin(): boolean {
  return !!getAdminToken()
}

export type AdminIdentity = { username: string; display_name: string }

export type AdminAccountRow = {
  username: string
  display_name: string
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

/** 把 RPC 抛出的错误归一成业务码（如 INVALID_CREDENTIALS / NOT_ADMIN）。 */
export function rpcCode(e: unknown): string {
  const raw = (e as { message?: string })?.message ?? (e as { code?: string })?.code ?? String(e ?? '')
  const m = String(raw).trim()
  const hit = m.match(/[A-Z][A-Z_]{3,}/)
  return (hit ? hit[0] : m).toUpperCase()
}

function ensure<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

export async function adminLogin(username: string, password: string): Promise<AdminIdentity> {
  const data = ensure(
    (await rpc('oe_admin_login', {
      p_username: username,
      p_password: password,
    })) as { data: { token?: string; username?: string; display_name?: string } | null; error: unknown },
  )
  if (!data?.token) throw new Error('INVALID_CREDENTIALS')
  setAdminToken(data.token)
  return {
    username: data.username || username,
    display_name: data.display_name || data.username || username,
  }
}

/** 校验本地 token 是否仍然有效；无效则顺手清掉。 */
export async function adminMe(): Promise<AdminIdentity | null> {
  const token = getAdminToken()
  if (!token) return null
  try {
    const data = ensure(
      (await rpc('oe_admin_me', { p_token: token })) as {
        data: { username?: string; display_name?: string } | null
        error: unknown
      },
    )
    if (!data?.username) {
      setAdminToken(null)
      return null
    }
    return { username: data.username, display_name: data.display_name || data.username }
  } catch {
    // 网络抖动也当成失效，避免卡在 loading；重新登录成本很低
    setAdminToken(null)
    return null
  }
}

export async function adminLogout(): Promise<void> {
  const token = getAdminToken()
  setAdminToken(null)
  if (!token) return
  try {
    await rpc('oe_admin_logout', { p_token: token })
  } catch {
    /* 本地已登出，服务端残留 token 到期自动失效 */
  }
}

export async function adminChangePassword(oldPassword: string, newPassword: string): Promise<void> {
  const token = getAdminToken()
  if (!token) throw new Error('NOT_ADMIN')
  ensure(
    (await rpc('oe_admin_change_password', {
      p_token: token,
      p_old: oldPassword,
      p_new: newPassword,
    })) as { data: unknown; error: unknown },
  )
}

/* 账号管理类接口在「邮箱登录」下也允许调用：
   此时没有本地 token，传空串，由数据库侧的 oe_admin_authorized() 用 is_admin() 放行。 */
function mgmtToken(): string {
  return getAdminToken() ?? ''
}

export async function listAdminAccounts(): Promise<{ accounts: AdminAccountRow[]; current: string }> {
  const data = ensure(
    (await rpc('oe_admin_list_accounts', { p_token: mgmtToken() })) as {
      data: { accounts?: AdminAccountRow[]; current?: string } | null
      error: unknown
    },
  )
  return { accounts: data?.accounts ?? [], current: data?.current ?? '' }
}

export async function saveAdminAccount(username: string, password: string, displayName: string): Promise<void> {
  ensure(
    (await rpc('oe_admin_set_account', {
      p_token: mgmtToken(),
      p_username: username,
      p_password: password,
      p_display_name: displayName,
    })) as { data: unknown; error: unknown },
  )
}

export async function deleteAdminAccount(username: string): Promise<void> {
  ensure(
    (await rpc('oe_admin_delete_account', { p_token: mgmtToken(), p_username: username })) as {
      data: unknown
      error: unknown
    },
  )
}

/* ---------------- 对外 API 密钥 ----------------
 *
 * 后台有两种登录态，两条通道都要能用：
 *   · 本地管理员账号 —— 没有云会话，走 oe_admin_api_token* RPC（内部校验 token）
 *   · 邮箱登录        —— 走原生的 api_tokens 表，RLS 策略用 is_admin() 认人
 * 表 api_tokens 上只有 is_admin() 的策略，所以原生通道只有邮箱管理员读得到；
 * 明文密钥存在 token_plain 列里，同样只有管理员能读。
 */

export type ApiTokenRow = {
  id: number
  label: string
  token_hint: string
  token_plain: string | null
  created_at: string
  last_used_at: string | null
  use_count: number
  revoked: boolean
}

function randomKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return 'oe_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function listApiTokens(): Promise<ApiTokenRow[]> {
  const t = getAdminToken()
  if (!t) {
    const rows = ensure(
      (await (db.from('api_tokens') as any).select('*')) as { data: ApiTokenRow[] | null; error: unknown },
    )
    return (rows ?? []).slice().sort((a, b) => a.id - b.id)
  }
  const data = ensure(
    (await rpc('oe_admin_api_tokens', { p_token: t })) as {
      data: ApiTokenRow[] | null
      error: unknown
    },
  )
  return data ?? []
}

export async function createApiToken(label: string): Promise<{ id: number; label: string; token: string }> {
  const t = getAdminToken()
  if (t) {
    const data = ensure(
      (await rpc('oe_admin_api_token_create', { p_token: t, p_label: label })) as {
        data: { id?: number; label?: string; token?: string } | null
        error: unknown
      },
    )
    if (!data?.token) throw new Error('CREATE_FAILED')
    return { id: Number(data.id), label: data.label || label, token: data.token }
  }

  // 邮箱登录态：本地生成密钥，只把哈希 + 明文写进表（RLS 判定 is_admin()）
  const key = randomKey()
  const rows = ensure(
    (await (db.from('api_tokens') as any)
      .insert({
        label,
        token_hash: await sha256Hex(key),
        token_hint: key.slice(0, 11),
        token_plain: key,
        revoked: false,
      })
      .select()) as { data: ApiTokenRow[] | null; error: unknown },
  )
  const row = (rows ?? [])[0]
  if (!row) throw new Error('CREATE_FAILED')
  return { id: row.id, label: row.label || label, token: key }
}

export async function revokeApiToken(id: number, revoked: boolean): Promise<void> {
  const t = getAdminToken()
  if (t) {
    ensure(
      (await rpc('oe_admin_api_token_revoke', {
        p_token: t,
        p_id: id,
        p_revoked: revoked,
      })) as { data: unknown; error: unknown },
    )
    return
  }
  ensure(
    (await (db.from('api_tokens') as any).update({ revoked }).eq('id', id).select()) as {
      data: unknown
      error: unknown
    },
  )
}
