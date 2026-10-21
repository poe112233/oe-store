import { useState } from 'react'
import LangSwitch from '../components/LangSwitch'
import { LogoLockup } from '../components/Logo'
import { t, useLang } from '../i18n'
import { adminLogin } from '../lib/localAuth'

/**
 * 后台登录：只有「账号 + 密码」一条路径。
 * 数据已迁到 Cloudflare D1，平台原生邮箱会话不再存在，因此这里不保留任何邮箱入口。
 */
export default function Login({ onDone }: { onDone: () => void }) {
  useLang()
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function signIn() {
    setErr('')
    const name = account.trim().toLowerCase()
    const pass = password.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').trim()
    if (!name || !pass) {
      setErr(t('Please enter account and password'))
      return
    }
    setBusy(true)
    try {
      await adminLogin(name, pass)
      onDone()
    } catch (e: any) {
      const code = String(e?.code || e?.message || '')
      setErr(
        code === 'INVALID_CREDENTIALS' || !code
          ? t('Wrong account or password')
          : `${t('Sign-in failed')} · ${code}`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <LogoLockup name="ORIENTAL ESSENCE" sub={t('Manager')} size={40} tone="gold" />
          <LangSwitch />
        </div>

        <h1>{t('Sign in')}</h1>
        <p className="note" style={{ marginBottom: 22 }}>
          {t('Sign in with your administrator account and password.')}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            signIn()
          }}
        >
          <div className="fld">
            <label>{t('Account')}</label>
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={t('Your administrator account')}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          <div className="fld">
            <label>{t('Password')}</label>
            <div className="pwd-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('Your password')}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="pwd-toggle"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? t('Hide password') : t('Show password')}
                title={showPwd ? t('Hide password') : t('Show password')}
              >
                {showPwd ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 5.1A9.9 9.9 0 0112 5c5 0 9 4.5 9 7 0 .9-.7 2.2-1.9 3.4M6.3 6.4C3.9 8 2.6 10.2 2.6 12c0 2.5 4 7 9.4 7 1.5 0 2.9-.4 4.1-1" />
                    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M2.6 12S6.6 5 12 5s9.4 7 9.4 7-4 7-9.4 7-9.4-7-9.4-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button className="btn" type="submit" disabled={busy} style={{ width: '100%', marginTop: 6 }}>
            {busy ? t('Please wait…') : t('Sign in')}
          </button>
        </form>

        {err && (
          <div>
            <div className="err">{err}</div>
            <p className="note" style={{ marginTop: 6, fontSize: 11.5 }}>
              {t('If your browser autofilled an old password, clear it and type again — tap the eye icon to check.')}
            </p>
          </div>
        )}

        <p className="note" style={{ marginTop: 16, fontSize: 11.5 }}>
          {t('Only administrators can write data; browsing needs no login.')}
        </p>
      </div>
    </div>
  )
}
