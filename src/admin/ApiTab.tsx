import { useCallback, useEffect, useMemo, useState } from 'react'
import { publicConfig } from '../config'
import { t, useLang } from '../i18n'
import { createApiToken, listApiTokens, revokeApiToken, rpcCode, type ApiTokenRow } from '../lib/localAuth'

function fmt(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

/** 把各种形态的错误对象压成一句人话（SDK 抛出的常是对象，String() 会变成 [object Object]）。 */
function errText(e: unknown): string {
  const code = rpcCode(e)
  if (code === 'NOT_ADMIN' || code === 'UNAUTHORIZED')
    return t('Your sign-in has expired. Please sign in again.')
  if (code === 'LABEL_REQUIRED') return t('Give this key a name first')
  const o = e as { message?: string; details?: string; hint?: string; error_description?: string; error?: string }
  const parts = [o?.message, o?.details, o?.hint, o?.error_description, o?.error].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  )
  if (parts.length) return Array.from(new Set(parts)).join(' · ')
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export default function ApiTab() {
  useLang()
  const [rows, setRows] = useState<ApiTokenRow[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<{ token: string; label: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const base = `${publicConfig.endpoint}/.cloud/database/rest/rpc`
  const appKey = publicConfig.publishableKey

  const reload = useCallback(async () => {
    try {
      setRows(await listApiTokens())
    } catch (e) {
      setErr(errText(e))
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  function flash(m: string, bad = false) {
    if (bad) setErr(m)
    else setMsg(m)
    setTimeout(() => {
      setErr('')
      setMsg('')
    }, 5000)
  }

  async function create() {
    const l = label.trim()
    if (!l) return flash(t('Give this key a name first'), true)
    setBusy(true)
    setErr('')
    try {
      const r = await createApiToken(l)
      setFresh({ token: r.token, label: r.label })
      setLabel('')
      await reload()
      flash(t('Key created'))
    } catch (e) {
      flash(errText(e), true)
    } finally {
      setBusy(false)
    }
  }

  async function toggle(r: ApiTokenRow) {
    setBusy(true)
    setErr('')
    try {
      await revokeApiToken(r.id, !r.revoked)
      await reload()
      flash(r.revoked ? t('Key re-enabled') : t('Key disabled'))
    } catch (e) {
      flash(errText(e), true)
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(tag)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      flash(t('Copy failed — select the text manually'), true)
    }
  }

  const curlSample = useMemo(() => {
    const key = fresh?.token || '<你的密钥>'
    return [
      `curl -s -X POST "${base}/oe_api_products" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "x-wb-webapp-access-key: ${appKey}" \\`,
      `  -d '{"p_key":"${key}","p_limit":5}'`,
    ].join('\n')
  }, [base, appKey, fresh])

  const saveSample = useMemo(() => {
    const key = fresh?.token || '<你的密钥>'
    return [
      `curl -s -X POST "${base}/oe_api_product_save" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "x-wb-webapp-access-key: ${appKey}" \\`,
      `  -d '{"p_key":"${key}","p_data":{"item_id":"7844423713","name_en":"New name","sold_count":300}}'`,
    ].join('\n')
  }, [base, appKey, fresh])

  const endpoints: [string, string][] = [
    [t('List products'), `oe_api_products(p_key, p_limit, p_offset)`],
    [t('Create or update a product'), `oe_api_product_save(p_key, p_data)`],
    [t('Delete a product'), `oe_api_product_delete(p_key, p_id)`],
    [t('List categories'), `oe_api_categories(p_key)`],
  ]

  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        {t('A key can read products and categories, and create, update or delete products — nothing else.')}
      </p>

      {fresh && (
        <div className="panel" style={{ borderLeft: '3px solid var(--gold)', background: '#fffdf7' }}>
          <h3>
            {t('Your new key')} · {fresh.label}
          </h3>
          <div className="row" style={{ alignItems: 'center' }}>
            <code
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: 13,
                wordBreak: 'break-all',
                background: '#fff',
                border: '1px solid var(--line-strong)',
                padding: '10px 12px',
              }}
            >
              {fresh.token}
            </code>
            <button className="mini" onClick={() => copy(fresh.token, 'key')}>
              {copied === 'key' ? t('Copied') : t('Copy')}
            </button>
            <button className="mini" onClick={() => setFresh(null)}>
              {t('Dismiss')}
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>{t('API keys')}</h3>
        <p className="note" style={{ marginTop: 0 }}>
          {t('Keys are stored in plain text, so you can copy them at any time.')}
        </p>

        {rows.length > 0 ? (
          <table className="tbl" style={{ marginBottom: 18 }}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>{t('Name')}</th>
                <th>{t('Key')}</th>
                <th style={{ width: 155 }}>{t('Created')}</th>
                <th style={{ width: 155 }}>{t('Last used')}</th>
                <th style={{ width: 60 }}>{t('Calls')}</th>
                <th style={{ width: 90 }}>{t('Status')}</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                    {r.token_plain || `${r.token_hint}…`}
                    <button
                      className="mini"
                      style={{ marginLeft: 8 }}
                      onClick={() => copy(r.token_plain || '', 'row' + r.id)}
                    >
                      {copied === 'row' + r.id ? t('Copied') : t('Copy')}
                    </button>
                  </td>
                  <td className="note" style={{ margin: 0 }}>
                    {fmt(r.created_at)}
                  </td>
                  <td className="note" style={{ margin: 0 }}>
                    {fmt(r.last_used_at)}
                  </td>
                  <td>{r.use_count}</td>
                  <td>
                    {r.revoked ? (
                      <span className="pill">{t('Disabled')}</span>
                    ) : (
                      <span className="pill on">{t('Active')}</span>
                    )}
                  </td>
                  <td>
                    <button
                      className={'mini' + (r.revoked ? '' : ' danger')}
                      disabled={busy}
                      onClick={() => toggle(r)}
                    >
                      {r.revoked ? t('Enable') : t('Disable')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="note">{t('No keys yet.')}</p>
        )}

        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="fld" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
            <label>{t('Key name')}</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('e.g. Product upkeep')}
              autoComplete="off"
            />
          </div>
          <button className="btn sm gold" disabled={busy} onClick={create}>
            {busy ? t('Please wait…') : t('Create key')}
          </button>
        </div>

        {msg && <div className="ok">{msg}</div>}
        {err && <div className="err">{err}</div>}
      </div>

      <div className="panel">
        <h3>{t('How to call the API')}</h3>
        <p className="note" style={{ marginTop: 0 }}>
          {t('Every call is a POST to this address, with two headers and one JSON body.')}
        </p>

        <div className="fld">
          <label>{t('Endpoint')}</label>
          <code style={{ fontFamily: 'monospace', fontSize: 12.5, wordBreak: 'break-all' }}>
            {base}/&lt;function&gt;
          </code>
        </div>

        <table className="tbl" style={{ marginBottom: 18 }}>
          <thead>
            <tr>
              <th style={{ width: 240 }}>{t('Action')}</th>
              <th>{t('Function')}</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map(([a, f]) => (
              <tr key={f}>
                <td>{a}</td>
                <td className="note" style={{ margin: 0, fontFamily: 'monospace' }}>
                  {f}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <label style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {t('Read products')}
        </label>
        <div className="row" style={{ alignItems: 'flex-start', marginTop: 8 }}>
          <pre
            style={{
              flex: 1,
              margin: 0,
              background: '#fff',
              border: '1px solid var(--line)',
              padding: '12px 14px',
              fontSize: 11.5,
              lineHeight: 1.65,
              overflowX: 'auto',
            }}
          >
            {curlSample}
          </pre>
          <button className="mini" onClick={() => copy(curlSample, 'curl')}>
            {copied === 'curl' ? t('Copied') : t('Copy')}
          </button>
        </div>

        <label
          style={{
            fontSize: 10,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            display: 'block',
            marginTop: 18,
          }}
        >
          {t('Update one product')}
        </label>
        <div className="row" style={{ alignItems: 'flex-start', marginTop: 8 }}>
          <pre
            style={{
              flex: 1,
              margin: 0,
              background: '#fff',
              border: '1px solid var(--line)',
              padding: '12px 14px',
              fontSize: 11.5,
              lineHeight: 1.65,
              overflowX: 'auto',
            }}
          >
            {saveSample}
          </pre>
          <button className="mini" onClick={() => copy(saveSample, 'save')}>
            {copied === 'save' ? t('Copied') : t('Copy')}
          </button>
        </div>

        <ul className="note" style={{ lineHeight: 1.9, marginBottom: 0 }}>
          <li>
            {t(
              'p_data may contain: id, item_id, category_id, name_en, name_zh, images, links, sort_order, is_visible, sold_count.',
            )}
          </li>
          <li>{t('Use id or item_id to update an existing product; omit both to create a new one.')}</li>
          <li>{t('item_id is the Weidian product ID, taken from the product image filename.')}</li>
          <li>{t('Only the fields you send are changed — everything else stays as it is.')}</li>
          <li>{t('A wrong or disabled key returns invalid_api_key; the key cannot touch site settings or admins.')}</li>
        </ul>
      </div>
    </>
  )
}
