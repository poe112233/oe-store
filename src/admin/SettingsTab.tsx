import { useState } from 'react'
import { t, useLang } from '../i18n'
import { saveSettings } from '../lib/api'
import type { SiteSettings } from '../types'

export default function SettingsTab({ settings, onSaved }: { settings: SiteSettings; onSaved: () => Promise<void> }) {
  useLang()
  const [f, setF] = useState<SiteSettings>({ ...settings, contact: { ...settings.contact } })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  async function save() {
    setBusy(true)
    setErr('')
    setOk('')
    try {
      await saveSettings(f)
      await onSaved()
      setOk(t('Saved — live immediately'))
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <h3>{t('Site content')}</h3>
      <p className="note" style={{ marginTop: 0 }}>
        {t('Site copy is shared across all languages — it is shown exactly as you type it.')}
      </p>
      <div className="grid2">
        <div className="fld">
          <label>{t('Brand name')}</label>
          <input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
        </div>
        <div className="fld">
          <label>{t('Tagline')}</label>
          <input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} />
        </div>
      </div>

      <div className="fld">
        <label>{t('Intro paragraph (hero)')}</label>
        <textarea value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} />
      </div>

      <div className="fld">
        <label>{t('Hero background image URL')}</label>
        <input
          value={f.hero_image}
          onChange={(e) => setF({ ...f, hero_image: e.target.value })}
          placeholder={t('Blank keeps a plain background')}
        />
      </div>

      <div className="fld">
        <label>{t('Footer note')}</label>
        <input value={f.footer_note} onChange={(e) => setF({ ...f, footer_note: e.target.value })} />
      </div>

      <div className="grid2">
        <div className="fld">
          <label>{t('Contact email')}</label>
          <input
            value={f.contact.email}
            onChange={(e) => setF({ ...f, contact: { ...f.contact, email: e.target.value } })}
            placeholder="hello@example.com"
          />
        </div>
        <div className="fld">
          <label>{t('Telegram URL')}</label>
          <input
            value={f.contact.telegram}
            onChange={(e) => setF({ ...f, contact: { ...f.contact, telegram: e.target.value } })}
            placeholder="https://t.me/..."
          />
        </div>
        <div className="fld">
          <label>{t('WhatsApp URL')}</label>
          <input
            value={f.contact.whatsapp}
            onChange={(e) => setF({ ...f, contact: { ...f.contact, whatsapp: e.target.value } })}
            placeholder="https://wa.me/..."
          />
        </div>
        <div className="fld">
          <label>{t('Discord URL')}</label>
          <input
            value={f.contact.discord}
            onChange={(e) => setF({ ...f, contact: { ...f.contact, discord: e.target.value } })}
            placeholder="https://discord.gg/..."
          />
        </div>
        <div className="fld">
          <label>
            {t('Discord URL')} · {t('Profile')}
          </label>
          <input
            value={f.contact.discord_profile}
            onChange={(e) => setF({ ...f, contact: { ...f.contact, discord_profile: e.target.value } })}
            placeholder="https://discord.com/users/..."
          />
        </div>
        <div className="fld">
          <label>{t('TikTok URL')}</label>
          <input
            value={f.contact.tiktok}
            onChange={(e) => setF({ ...f, contact: { ...f.contact, tiktok: e.target.value } })}
            placeholder="https://www.tiktok.com/@..."
          />
        </div>
        <div className="fld">
          <label>{t('YouTube URL')}</label>
          <input
            value={f.contact.youtube}
            onChange={(e) => setF({ ...f, contact: { ...f.contact, youtube: e.target.value } })}
            placeholder="https://www.youtube.com/channel/..."
          />
        </div>
        <div className="fld">
          <label>{t('WeChat ID')}</label>
          <input value={f.contact.wechat} onChange={(e) => setF({ ...f, contact: { ...f.contact, wechat: e.target.value } })} />
        </div>
      </div>
      <p className="note" style={{ marginTop: -4 }}>
        {t('Contact links appear in the footer and in the “Follow us” section.')}
      </p>

      <button className="btn sm gold" disabled={busy} onClick={save}>
        {busy ? t('Saving…') : t('Save site content')}
      </button>
      {ok && <div className="ok">{ok}</div>}
      {err && <div className="err">{err}</div>}
    </div>
  )
}
