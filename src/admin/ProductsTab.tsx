import { useMemo, useRef, useState } from 'react'
import { PLATFORMS } from '../config'
import { t, useLang } from '../i18n'
import { createProduct, deleteProduct, updateProduct } from '../lib/api'
import { buyLinksFrom } from '../lib/buyLinks'
import { uploadImage } from '../lib/github'
import type { Category, PrivateConfig, Product } from '../types'

const PAGE = 40

type Draft = {
  id?: number
  category_id: number | null
  name_en: string
  name_zh: string
  images: string
  links: Record<string, string>
  sort_order: number
  is_visible: boolean
  sold_count: number
}

function toDraft(p: Product): Draft {
  return {
    id: p.id,
    category_id: p.category_id,
    name_en: p.name_en,
    name_zh: p.name_zh || '',
    images: (p.images || []).join('\n'),
    links: { ...(p.links || {}) },
    sort_order: p.sort_order,
    is_visible: p.is_visible,
    sold_count: Number(p.sold_count) || 0,
  }
}

export default function ProductsTab({
  categories,
  products,
  priv,
  reload,
}: {
  categories: Category[]
  products: Product[]
  priv: PrivateConfig
  reload: () => Promise<void>
}) {
  useLang()
  const [filterCat, setFilterCat] = useState<string>('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [wdInput, setWdInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function flash(m: string, isErr = false) {
    if (isErr) setErr(m)
    else setOk(m)
    setTimeout(() => {
      setErr('')
      setOk('')
    }, 4000)
  }

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return products.filter((p) => {
      if (filterCat !== 'all' && String(p.category_id) !== filterCat) return false
      if (!kw) return true
      return p.name_en.toLowerCase().includes(kw) || (p.name_zh || '').toLowerCase().includes(kw)
    })
  }, [products, filterCat, q])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE))
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE)

  function openNew() {
    const cat = filterCat !== 'all' ? Number(filterCat) : categories[0]?.id ?? null
    const same = products.filter((p) => p.category_id === cat)
    setWdInput('')
    setDraft({
      category_id: cat,
      name_en: '',
      name_zh: '',
      images: '',
      links: {},
      sort_order: same.length ? Math.max(...same.map((p) => p.sort_order)) + 1 : 1,
      is_visible: true,
      sold_count: 0,
    })
  }

  /** 从微店链接（或图床文件名）一键填满六个渠道的购买链接 */
  function fillBuyLinks(source?: string) {
    if (!draft) return
    const input = source ?? wdInput ?? ''
    const links = buyLinksFrom(input) || buyLinksFrom(draft.images.split(/\r?\n/)[0] || '')
    if (!links) return flash(t('Could not read an itemID from that link.'), true)
    setDraft({ ...draft, links: { ...draft.links, ...links } })
    flash(t('Filled {n} purchase links', { n: Object.keys(links).length }))
  }

  async function doUpload(files: FileList | null) {
    if (!files || !files.length || !draft) return
    if (!priv.github_token) return flash(t('Image host token not configured. Go to Account → Image host.'), true)
    setUploading(true)
    try {
      const urls: string[] = []
      for (const f of Array.from(files)) {
        const r = await uploadImage(f, priv)
        urls.push(r.url)
      }
      const merged = [draft.images.trim(), ...urls].filter(Boolean).join('\n')
      setDraft({ ...draft, images: merged })
      flash(t('Uploaded {n} images', { n: urls.length }))
    } catch (e: any) {
      flash(String(e?.message || e), true)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    if (!draft) return
    if (!draft.name_en.trim()) return flash(t('Please fill the English product name'), true)
    setBusy(true)
    try {
      const payload: Partial<Product> = {
        category_id: draft.category_id,
        name_en: draft.name_en.trim(),
        name_zh: draft.name_zh.trim() || null,
        images: draft.images
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
        links: Object.fromEntries(
          Object.entries(draft.links)
            .map(([k, v]) => [k, (v || '').trim()])
            .filter(([, v]) => v),
        ),
        sort_order: Number(draft.sort_order) || 0,
        is_visible: draft.is_visible,
        sold_count: Math.max(0, Math.round(Number(draft.sold_count) || 0)),
      }
      if (draft.id) await updateProduct(draft.id, payload)
      else await createProduct(payload)
      await reload()
      setDraft(null)
      flash(t('Saved'))
    } catch (e: any) {
      flash(String(e?.message || e), true)
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: Product) {
    if (!confirm(t('Delete product “{name}”? This cannot be undone.', { name: p.name_en }))) return
    setBusy(true)
    try {
      await deleteProduct(p.id)
      await reload()
      flash(t('Deleted'))
    } catch (e: any) {
      flash(String(e?.message || e), true)
    } finally {
      setBusy(false)
    }
  }

  async function toggleVisible(p: Product) {
    setBusy(true)
    try {
      await updateProduct(p.id, { is_visible: !p.is_visible })
      await reload()
    } catch (e: any) {
      flash(String(e?.message || e), true)
    } finally {
      setBusy(false)
    }
  }

  const thumbs = draft
    ? draft.images
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  return (
    <>
      {draft && (
        <div className="panel" style={{ borderLeft: '3px solid var(--gold)' }}>
          <h3>{draft.id ? t('Edit product') : t('New product')}</h3>
          <div className="grid2">
            <div className="fld">
              <label>{t('Category')}</label>
              <select
                value={draft.category_id ?? ''}
                onChange={(e) => setDraft({ ...draft, category_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">{t('— Uncategorised —')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{t('Order in category')}</label>
              <input
                type="number"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
              />
            </div>
            <div className="fld">
              <label>{t('Sold count (display only)')}</label>
              <input
                type="number"
                min={0}
                step={10}
                value={draft.sold_count}
                onChange={(e) => setDraft({ ...draft, sold_count: Number(e.target.value) })}
              />
            </div>
            <div className="fld">
              <label>{t('Name (English)')} *</label>
              <input value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })} />
            </div>
            <div className="fld">
              <label>{t('Name (Chinese)')}</label>
              <input value={draft.name_zh} onChange={(e) => setDraft({ ...draft, name_zh: e.target.value })} />
            </div>
          </div>

          <div className="fld">
            <label>{t('Images · one URL per line')}</label>
            <textarea
              value={draft.images}
              onChange={(e) => setDraft({ ...draft, images: e.target.value })}
              placeholder={'https://cdn.jsdelivr.net/gh/.../a.jpg\nhttps://cdn.jsdelivr.net/gh/.../b.jpg'}
              style={{ minHeight: 110, fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>
          <div className="row" style={{ marginBottom: 14 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => doUpload(e.target.files)}
            />
            <button className="mini" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? t('Uploading…') : t('Upload images to image host')}
            </button>
            {thumbs.length > 0 && <span className="note">{t('{n} images', { n: thumbs.length })}</span>}
          </div>
          {thumbs.length > 0 && (
            <div className="thumbs" style={{ marginBottom: 18 }}>
              {thumbs.map((th, i) => (
                <div key={th + i} style={{ position: 'relative' }}>
                  <img src={th} alt="" />
                  <button
                    className="mini danger"
                    style={{ position: 'absolute', top: 2, right: 2, padding: '1px 6px' }}
                    onClick={() => {
                      const next = thumbs.filter((_, k) => k !== i)
                      setDraft({ ...draft, images: next.join('\n') })
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <label style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            {t('Purchase links')}
          </label>
          <div className="row" style={{ marginTop: 10, gap: 8, alignItems: 'flex-end' }}>
            <div className="fld" style={{ margin: 0, flex: 1, minWidth: 240 }}>
              <label>{t('Weidian product link')}</label>
              <input
                value={wdInput}
                placeholder={t('Example: https://weidian.com/item.html?itemID=7848992891')}
                onChange={(e) => setWdInput(e.target.value)}
                onPaste={(e) => {
                  const v = e.clipboardData.getData('text')
                  if (v.trim()) {
                    e.preventDefault()
                    setWdInput(v.trim())
                    setTimeout(() => fillBuyLinks(v.trim()), 0)
                  }
                }}
              />
            </div>
            <button className="mini" onClick={() => fillBuyLinks()}>
              {t('Auto-fill purchase links')}
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            {PLATFORMS.map((p) => (
              <div className="fld" key={p.key}>
                <label>{p.name}</label>
                <input
                  value={draft.links[p.key] || ''}
                  onChange={(e) => setDraft({ ...draft, links: { ...draft.links, [p.key]: e.target.value } })}
                  placeholder="https://..."
                />
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <label className="note">
              <input
                type="checkbox"
                checked={draft.is_visible}
                onChange={(e) => setDraft({ ...draft, is_visible: e.target.checked })}
              />{' '}
              {t('Show on site')}
            </label>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn sm gold" disabled={busy} onClick={save}>
              {t('Save')}
            </button>
            <button className="btn sm ghost" onClick={() => setDraft(null)}>
              {t('Cancel')}
            </button>
            {draft.id && (
              <button
                className="btn sm ghost"
                onClick={async () => {
                  const target = products.find((p) => p.id === draft.id)
                  if (target) await remove(target)
                  setDraft(null)
                }}
              >
                {t('Delete')}
              </button>
            )}
          </div>
          {ok && <div className="ok">{ok}</div>}
          {err && <div className="err">{err}</div>}
        </div>
      )}

      <div className="panel">
        <div className="row" style={{ marginBottom: 16 }}>
          <div className="fld" style={{ margin: 0, minWidth: 200 }}>
            <label>{t('Filter by category')}</label>
            <select
              value={filterCat}
              onChange={(e) => {
                setFilterCat(e.target.value)
                setPage(0)
              }}
            >
              <option value="all">{t('All ({n})', { n: products.length })}</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name_en}（{products.filter((p) => p.category_id === c.id).length}）
                </option>
              ))}
            </select>
          </div>
          <div className="fld" style={{ margin: 0, minWidth: 220, flex: 1 }}>
            <label>{t('Search products')}</label>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(0)
              }}
              placeholder={t('Product name keyword')}
            />
          </div>
          <button className="btn sm" onClick={openNew}>
            + {t('New product')}
          </button>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 60 }}>{t('Image')}</th>
              <th>{t('Name')}</th>
              <th style={{ width: 150 }}>{t('Category')}</th>
              <th style={{ width: 70 }}>{t('Clicks')}</th>
              <th style={{ width: 70 }}>{t('Sold')}</th>
              <th style={{ width: 80 }}>{t('Status')}</th>
              <th style={{ width: 190 }}>{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {view.map((p) => (
              <tr key={p.id}>
                <td className="thumb-cell">
                  {p.images?.[0] ? <img src={p.images[0]} alt="" loading="lazy" /> : <span className="note">—</span>}
                </td>
                <td>
                  {p.name_en}
                  {p.name_zh ? <span style={{ color: 'var(--muted)' }}> · {p.name_zh}</span> : null}
                  <div className="note" style={{ fontSize: 11 }}>
                    {t('{n} links · order {m}', { n: Object.keys(p.links || {}).length, m: p.sort_order })}
                  </div>
                </td>
                <td>{categories.find((c) => c.id === p.category_id)?.name_en || '—'}</td>
                <td>{p.clicks || 0}</td>
                <td>{p.sold_count || 0}</td>
                <td>{p.is_visible ? <span className="pill on">{t('Live')}</span> : <span className="pill">{t('Hidden')}</span>}</td>
                <td>
                  <div className="row">
                    <button className="mini" onClick={() => setDraft(toDraft(p))}>
                      {t('Edit')}
                    </button>
                    <button className="mini" disabled={busy} onClick={() => toggleVisible(p)}>
                      {p.is_visible ? t('Hide') : t('Show')}
                    </button>
                    <button className="mini danger" disabled={busy} onClick={() => remove(p)}>
                      {t('Del')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!view.length && (
          <div className="note" style={{ marginTop: 12 }}>
            {t('No matching products.')}
          </div>
        )}

        {pageCount > 1 && (
          <div className="row" style={{ marginTop: 16 }}>
            <button className="mini" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ← {t('Prev')}
            </button>
            <span className="note">
              {page + 1} / {pageCount}
            </span>
            <button className="mini" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
              {t('Next')} →
            </button>
          </div>
        )}
      </div>
    </>
  )
}
