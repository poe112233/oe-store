import { useRef, useState } from 'react'
import { t, useLang } from '../i18n'
import { savePrivateConfig } from '../lib/api'
import { publicUrl, uploadImage } from '../lib/github'
import type { PrivateConfig } from '../types'

export default function HostForm({ priv, onSaved }: { priv: PrivateConfig; onSaved: () => Promise<void> }) {
  useLang()
  const [f, setF] = useState<PrivateConfig>({ ...priv })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [testUrl, setTestUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    setBusy(true)
    setErr('')
    setOk('')
    try {
      await savePrivateConfig(f)
      await onSaved()
      setOk(t('Saved'))
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function test(files: FileList | null) {
    if (!files || !files.length) return
    setBusy(true)
    setErr('')
    setOk('')
    setTestUrl('')
    try {
      const r = await uploadImage(files[0], f)
      setTestUrl(r.url)
      setOk(t('Test upload succeeded — this is its public URL'))
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        {t('Images are hosted in a GitHub repository and delivered through the jsDelivr global CDN. The upload token is stored in the database and readable only by the administrator.')}
      </p>

      <div className="fld">
        <label>{t('GitHub repository (owner/repo)')}</label>
        <input
          value={f.github_repo}
          onChange={(e) => setF({ ...f, github_repo: e.target.value })}
          placeholder="poe112233/oe-gallery"
        />
      </div>
      <div className="fld">
        <label>{t('Branch')}</label>
        <input value={f.github_branch} onChange={(e) => setF({ ...f, github_branch: e.target.value })} placeholder="main" />
      </div>
      <div className="fld">
        <label>{t('Personal access token (needs Contents read/write on that repo)')}</label>
        <textarea
          value={f.github_token}
          onChange={(e) => setF({ ...f, github_token: e.target.value })}
          placeholder="github_pat_..."
          style={{ fontFamily: 'monospace', fontSize: 12, minHeight: 70 }}
        />
      </div>
      <div className="fld">
        <label>{t('CDN mode')}</label>
        <select value={f.cdn_mode} onChange={(e) => setF({ ...f, cdn_mode: e.target.value as PrivateConfig['cdn_mode'] })}>
          <option value="jsdelivr">{t('jsDelivr (recommended, global)')}</option>
          <option value="raw">{t('GitHub raw (fallback)')}</option>
        </select>
      </div>

      <div className="hairline" style={{ margin: '22px 0' }} />
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        {t('Upload protection')}
      </div>

      <div className="fld">
        <label>
          <input
            type="checkbox"
            checked={f.compress_images}
            onChange={(e) => setF({ ...f, compress_images: e.target.checked })}
          />{' '}
          {t('Compress on upload (limit longest edge, convert to webp)')}
        </label>
      </div>
      <div className="fld">
        <label>{t('Longest edge (px)')}</label>
        <input
          type="number"
          value={f.max_width}
          onChange={(e) => setF({ ...f, max_width: Number(e.target.value) || 1600 })}
          disabled={!f.compress_images}
        />
      </div>

      <div className="fld">
        <label>
          <input type="checkbox" checked={f.watermark} onChange={(e) => setF({ ...f, watermark: e.target.checked })} />{' '}
          {t('Brand watermark (bottom right)')}
        </label>
      </div>
      <div className="fld">
        <label>{t('Watermark text')}</label>
        <input
          value={f.watermark_text}
          onChange={(e) => setF({ ...f, watermark_text: e.target.value })}
          disabled={!f.watermark}
          placeholder="Oriental Essence"
        />
      </div>
      <p className="note" style={{ fontSize: 11.5 }}>
        {t('Compression lowers the value of a copied image and the watermark keeps your brand on it. Both run locally in the browser — the original is never uploaded.')}
      </p>

      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn sm gold" disabled={busy} onClick={save}>
          {t('Save')}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => test(e.target.files)} />
        <button className="btn sm ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          {t('Test upload')}
        </button>
      </div>

      {ok && <div className="ok">{ok}</div>}
      {err && <div className="err">{err}</div>}
      {testUrl && (
        <div style={{ marginTop: 14 }}>
          <img src={testUrl} alt="" style={{ maxWidth: 200, border: '1px solid var(--line)' }} />
          <div className="note" style={{ wordBreak: 'break-all', marginTop: 8 }}>
            {testUrl}
          </div>
        </div>
      )}
      <p className="note" style={{ marginTop: 16, fontSize: 11.5 }}>
        {t('Current CDN prefix example:')} {publicUrl(f, 'products/202601/sample.jpg')}
      </p>
    </>
  )
}
