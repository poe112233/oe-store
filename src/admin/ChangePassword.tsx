import { useState } from 'react'
import { cloud } from '../cloud'
import { t, useLang } from '../i18n'
import { adminChangePassword, isLocalAdmin, rpcCode } from '../lib/localAuth'

export default function ChangePassword({ account }: { account: string }) {
  useLang()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const local = isLocalAdmin()

  async function submit() {
    setErr('')
    setMsg('')
    if (!oldPw) return setErr(t('Enter your current password'))
    if (!newPw || newPw.length < 6) return setErr(t('New password must be at least 6 characters'))
    if (newPw === oldPw) return setErr(t('New password must be different from the current one'))
    if (newPw !== confirmPw) return setErr(t('The two new passwords do not match'))
    setBusy(true)
    try {
      if (local) {
        await adminChangePassword(oldPw, newPw)
      } else {
        const { error } = await cloud.auth.resetPasswordForOld({ oldPassword: oldPw, newPassword: newPw })
        if (error) throw error
      }
      setMsg(t('Password updated. Use the new password next time you sign in.'))
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e: any) {
      const m = String(e?.message || e || '')
      const code = rpcCode(e)
      if (code === 'WRONG_PASSWORD' || (/password/i.test(m) && /invalid|incorrect|wrong|mismatch/i.test(m))) {
        setErr(t('Current password is wrong'))
      } else if (code === 'WEAK_PASSWORD') {
        setErr(t('New password must be at least 6 characters'))
      } else if (code === 'NOT_ADMIN') {
        setErr(t('Your sign-in has expired. Please sign in again.'))
      } else {
        setErr(m || t('Change failed'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        {t('Change the password of {email}. You stay signed in on this device.', { email: account || '—' })}
      </p>
      <div className="fld">
        <label>{t('Current password')}</label>
        <input
          type="password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>
      <div className="fld">
        <label>{t('New password')}</label>
        <input
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </div>
      <div className="fld">
        <label>{t('Confirm new password')}</label>
        <input
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </div>
      <div className="row">
        <button className="btn gold" disabled={busy} onClick={submit}>
          {busy ? t('Please wait…') : t('Update password')}
        </button>
      </div>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="err">{err}</div>}
      <p className="note" style={{ marginTop: 14, fontSize: 11.5 }}>
        {local
          ? t(
              'Forgot the current password? Ask another administrator to set a new one from the administrator account panel.',
            )
          : t(
              'Forgot the current password? Sign out, then use “Forgot password” on the sign-in page to reset it by email code.',
            )}
      </p>
    </>
  )
}
