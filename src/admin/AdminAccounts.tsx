import { useCallback, useEffect, useState } from 'react'
import { t, useLang } from '../i18n'
import {
  deleteAdminAccount,
  listAdminAccounts,
  rpcCode,
  saveAdminAccount,
  type AdminAccountRow,
} from '../lib/localAuth'

function fmt(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export default function AdminAccounts() {
  useLang()
  const [rows, setRows] = useState<AdminAccountRow[]>([])
  const [current, setCurrent] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    try {
      const { accounts, current: me } = await listAdminAccounts()
      setRows(accounts)
      setCurrent(me)
      setLoaded(true)
    } catch (e) {
      setErr(describe(e))
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  function describe(e: unknown): string {
    switch (rpcCode(e)) {
      case 'BAD_USERNAME':
        return t('Account name must be 3–24 characters: a–z, 0–9, dot, dash, underscore')
      case 'WEAK_PASSWORD':
        return t('Password must be at least 6 characters')
      case 'CANNOT_DELETE_SELF':
        return t('You cannot delete the account you are signed in with')
      case 'LAST_ACCOUNT':
        return t('At least one administrator account must remain')
      case 'NOT_ADMIN':
        return t('Your sign-in has expired. Please sign in again.')
      default:
        return String((e as { message?: string })?.message || e || t('Creation failed'))
    }
  }

  const exists = rows.some((r) => r.username === username.trim().toLowerCase())
  const isSelf = !!username.trim() && username.trim().toLowerCase() === current

  async function submit() {
    setErr('')
    setMsg('')
    const u = username.trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,24}$/.test(u))
      return setErr(t('Account name must be 3–24 characters: a–z, 0–9, dot, dash, underscore'))
    if (!exists && password.length < 6) return setErr(t('Password must be at least 6 characters'))
    if (password && password.length < 6) return setErr(t('Password must be at least 6 characters'))
    if (u === current && password)
      return setErr(
        t('To change your own password, use the “Change password” panel instead — it keeps you signed in.'),
      )

    setBusy(true)
    try {
      await saveAdminAccount(u, password, displayName.trim())
      setUsername('')
      setDisplayName('')
      setPassword('')
      setMsg(t('Administrator account saved'))
      await reload()
    } catch (e) {
      setErr(describe(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(name: string) {
    setErr('')
    setMsg('')
    if (!window.confirm(t('Delete the administrator account “{name}”? This cannot be undone.', { name }))) return
    setBusy(true)
    try {
      await deleteAdminAccount(name)
      if (username.trim().toLowerCase() === name) {
        setUsername('')
        setDisplayName('')
        setPassword('')
      }
      await reload()
    } catch (e) {
      setErr(describe(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        {t(
          'Administrator accounts sign in from the single sign-in form with a username and a password — no email or phone required.',
        )}
      </p>

      {loaded && rows.length > 0 && (
        <table className="tbl" style={{ marginBottom: 18 }}>
          <thead>
            <tr>
              <th style={{ width: 170 }}>{t('Account name')}</th>
              <th style={{ width: 170 }}>{t('Display name')}</th>
              <th>{t('Last sign-in')}</th>
              <th style={{ width: 170 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.username}>
                <td>
                  <span className="pill on">{r.username}</span>
                  {r.username === current && (
                    <span className="note" style={{ marginLeft: 8, fontSize: 11 }}>
                      {t('You')}
                    </span>
                  )}
                </td>
                <td>{r.display_name}</td>
                <td className="note" style={{ margin: 0 }}>
                  {fmt(r.last_login_at)}
                </td>
                <td>
                  <button
                    className="mini"
                    disabled={busy}
                    onClick={() => {
                      setUsername(r.username)
                      setDisplayName(r.display_name)
                      setPassword('')
                      setErr('')
                      setMsg('')
                    }}
                  >
                    {t('Reset password')}
                  </button>
                  <button
                    className="mini danger"
                    style={{ marginLeft: 6 }}
                    disabled={busy || r.username === current}
                    onClick={() => remove(r.username)}
                  >
                    {t('Delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="fld" style={{ width: 170, marginBottom: 0 }}>
          <label>{t('Account name')}</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            autoComplete="off"
          />
        </div>
        <div className="fld" style={{ width: 170, marginBottom: 0 }}>
          <label>{t('Display name')}</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" />
        </div>
        <div className="fld" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <label>{t('Password')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>
        <button className="btn sm gold" disabled={busy} onClick={submit}>
          {busy ? t('Please wait…') : exists ? t('Update') : t('Save administrator')}
        </button>
      </div>

      <p className="note" style={{ marginTop: 10, fontSize: 11.5 }}>
        {exists && !isSelf ? t('Leave blank to keep the current password') : ''}
        {isSelf ? t('To change your own password, use the “Change password” panel instead — it keeps you signed in.') : ''}
      </p>

      {msg && <div className="ok">{msg}</div>}
      {err && <div className="err">{err}</div>}
    </>
  )
}
