import { useState } from 'react'
import LangSwitch from '../components/LangSwitch'
import { LogoLockup } from '../components/Logo'
import { cloud } from '../cloud'
import { t, useLang } from '../i18n'
import { adminLogin, rpcCode, setAdminToken } from '../lib/localAuth'

type Mode = 'signin' | 'reset'

export default function Login({ onDone }: { onDone: () => void }) {
  useLang()
  const [mode, setMode] = useState<Mode>('signin')
  // 同一个输入框既收管理员账号（admin）也收邮箱（you@example.com），按有没有 @ 自动选通道
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [resetChallenge, setResetChallenge] = useState<{
    email: string
    updateUser: (u: { nonce: string; password: string }) => Promise<any>
  } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  function fail(e: any, fallback: string) {
    const raw = e as { message?: string; details?: string; error_description?: string; code?: string } | undefined
    const parts = [raw?.error_description, raw?.message, raw?.details].filter(
      (x): x is string => typeof x === 'string' && x.length > 0,
    )
    setErr(parts.length ? Array.from(new Set(parts)).join(' · ') : String(e || fallback))
  }

  function clearNotices() {
    setErr('')
    setMsg('')
  }

  function switchTo(next: Mode) {
    clearNotices()
    setPassword('')
    setCode('')
    setMode(next)
  }

  function startCooldown() {
    setCooldown(60)
    const timer = setInterval(() => {
      setCooldown((n) => {
        if (n <= 1) {
          clearInterval(timer)
          return 0
        }
        return n - 1
      })
    }, 1000)
  }

  const looksLikeEmail = id.includes('@')

  /** 账号 + 密码：走自建的管理员账号体系，不绑邮箱/手机。 */
  async function signInWithAccount(value: string) {
    await adminLogin(value.trim().toLowerCase(), password)
  }

  /** 邮箱 + 密码：走平台原生云会话。 */
  async function signInWithEmail(value: string) {
    // 走邮箱通道时清掉可能残留的本地管理员会话，避免后台认错身份
    setAdminToken(null)
    const { error } = await cloud.auth.signInWithPassword({ email: value.trim(), password })
    if (error) throw error
  }

  /** 合并入口：按输入内容自动判断走账号还是邮箱。 */
  async function signIn() {
    clearNotices()
    const value = id.trim()
    if (!value || !password) return setErr(t('Please enter account and password'))
    setBusy(true)
    try {
      if (looksLikeEmail) await signInWithEmail(value)
      else await signInWithAccount(value)
      onDone()
    } catch (e: any) {
      const code = rpcCode(e)
      const raw = String(e?.message || e?.error_description || '')
      // 云认证返回的是英文原文（如 "Username or password incorrect."），这里统一翻成当前语言
      const wrong =
        code === 'INVALID_CREDENTIALS' ||
        code === 'INVALID_LOGIN_CREDENTIALS' ||
        /invalid login credentials|username or password incorrect|invalid_grant|invalid password|incorrect/i.test(raw)
      if (wrong) setErr(t('Wrong account or password'))
      else fail(e, t('Wrong account or password'))
    } finally {
      setBusy(false)
    }
  }

  async function sendResetCode() {
    clearNotices()
    const value = id.trim()
    if (!value) return setErr(t('Enter your account first'))
    if (!value.includes('@')) return setErr(t('Password reset needs the email address'))
    setBusy(true)
    try {
      const { data, error } = await cloud.auth.resetPasswordForEmail(value)
      if (error) throw error
      setResetChallenge({ email: value, updateUser: data.updateUser })
      setMsg(t('Verification code sent to your inbox (check spam too)'))
      startCooldown()
    } catch (e: any) {
      fail(e, t('Failed to send verification code'))
    } finally {
      setBusy(false)
    }
  }

  async function doReset() {
    clearNotices()
    if (!resetChallenge) return setErr(t('Get a code for this email first'))
    if (!code) return setErr(t('Enter the verification code'))
    if (!password || password.length < 6) return setErr(t('Set a password of at least 6 characters'))
    setBusy(true)
    try {
      const { error } = await resetChallenge.updateUser({ nonce: code.trim(), password })
      if (error) throw error
      setResetChallenge(null)
      setCode('')
      setPassword('')
      setMode('signin')
      setMsg(t('Password updated — sign in with the new password.'))
    } catch (e: any) {
      fail(e, t('Wrong or expired code'))
    } finally {
      setBusy(false)
    }
  }

  const submit = mode === 'signin' ? signIn : doReset
  const submitLabel = busy ? t('Please wait…') : mode === 'signin' ? t('Sign in') : t('Set new password')

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <LogoLockup name="Oriental Essence" sub={t('Manager')} size={40} tone="gold" />
          <LangSwitch />
        </div>

        <h1 style={{ marginTop: 22 }}>{mode === 'reset' ? t('Reset password') : t('Sign in')}</h1>
        <p className="note" style={{ marginTop: 0, marginBottom: 20 }}>
          {mode === 'reset'
            ? t('Enter your account, get a verification code, then set a new password.')
            : t('Sign in with an administrator account, or with the email address linked to it.')}
        </p>

        <div className="fld">
          <label>{mode === 'reset' ? t('Email address') : t('Account or email')}</label>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            type="text"
            placeholder={mode === 'reset' ? t('Enter your email address') : t('Enter your account or email')}
            autoComplete="username"
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>

        <div className="fld">
          <label>{mode === 'reset' ? t('New password') : t('Password')}</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && mode === 'signin') submit()
            }}
          />
        </div>

        {mode === 'reset' && (
          <div className="fld">
            <label>{t('Email verification code')}</label>
            <div className="row">
              <input style={{ flex: 1 }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
              <button className="mini" type="button" disabled={busy || cooldown > 0} onClick={sendResetCode}>
                {cooldown > 0 ? `${cooldown}s` : t('Get code')}
              </button>
            </div>
          </div>
        )}

        <button className="btn gold" style={{ width: '100%', marginTop: 6 }} disabled={busy} onClick={submit}>
          {submitLabel}
        </button>

        {msg && <div className="ok">{msg}</div>}
        {err && <div className="err">{err}</div>}

        <p className="note" style={{ marginTop: 16, fontSize: 11.5 }}>
          {mode === 'reset' ? (
            <button className="linkbtn" type="button" onClick={() => switchTo('signin')}>
              {t('Back to sign in')}
            </button>
          ) : (
            <button className="linkbtn" type="button" onClick={() => switchTo('reset')}>
              {t('Forgot password?')}
            </button>
          )}
        </p>

        <p className="note" style={{ marginTop: 12, fontSize: 11.5 }}>
          {t('Only administrators can write data; browsing needs no login.')}
        </p>
      </div>
    </div>
  )
}
