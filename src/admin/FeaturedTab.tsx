import { useMemo, useState } from 'react'
import { t, useLang } from '../i18n'
import { saveSettings } from '../lib/api'
import { FEATURED_MAX } from '../lib/featured'
import type { Category, Product, SiteSettings } from '../types'

/**
 * 精选推荐配置。
 *
 * - 自动：每天确定性随机（按分类分散、偏好多图与热销款），次日自动换新；
 * - 手工：完全按这里勾选的顺序展示，适合主推当季款/清库存；
 * - 数量：首页精选区显示多少件（默认 12，最多 24）。
 *
 * 保存后立刻生效：首页与对外 `featured.json`（落地页取数源）都读这份设置。
 */
export default function FeaturedTab({
  settings,
  products,
  categories,
  onSaved,
}: {
  settings: SiteSettings
  products: Product[]
  categories: Category[]
  onSaved: () => Promise<void>
}) {
  useLang()
  const [mode, setMode] = useState<'auto' | 'manual'>(settings.featured_mode || 'auto')
  const [count, setCount] = useState<number>(settings.featured_count || 12)
  const [ids, setIds] = useState<number[]>(settings.featured_ids || [])
  const [q, setQ] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const picked = ids.map((id) => byId.get(id)).filter(Boolean) as Product[]

  const candidates = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return products
      .filter((p) => p.is_visible && (p.images?.length || 0) > 0)
      .filter((p) => (filterCat === 'all' ? true : p.category_id === Number(filterCat)))
      .filter((p) =>
        !kw
          ? true
          : (p.name_en || '').toLowerCase().includes(kw) || (p.name_zh || '').toLowerCase().includes(kw),
      )
      .slice(0, 120)
  }, [products, q, filterCat])

  function add(id: number) {
    if (ids.includes(id)) return
    setIds([...ids, id])
    setOk('')
  }
  function remove(id: number) {
    setIds(ids.filter((x) => x !== id))
    setOk('')
  }
  function move(id: number, dir: -1 | 1) {
    const i = ids.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    const next = ids.slice()
    next[i] = ids[j]
    next[j] = id
    setIds(next)
    setOk('')
  }

  async function save() {
    setBusy(true)
    setErr('')
    setOk('')
    try {
      const clean = Math.min(FEATURED_MAX, Math.max(1, Math.round(Number(count) || 12)))
      await saveSettings({ ...settings, featured_mode: mode, featured_count: clean, featured_ids: ids })
      await onSaved()
      setOk(t('Saved — live immediately'))
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const nameOf = (p: Product) => p.name_zh || p.name_en
  const catNameOf = (p: Product) => catById.get(p.category_id as number)?.name_en || '—'

  return (
    <div className="panel">
      <h3>{t('Featured picks')}</h3>
      <p className="note" style={{ marginTop: 0 }}>
        {t('Controls the “Signature picks” block on the homepage, and the featured list that all landing pages read.')}
      </p>

      <div className="grid2">
        <div className="fld">
          <label>{t('Selection mode')}</label>
          <div className="row">
            <button
              className={'btn sm' + (mode === 'auto' ? '' : ' ghost')}
              onClick={() => setMode('auto')}
            >
              {t('Automatic (daily rotation)')}
            </button>
            <button
              className={'btn sm' + (mode === 'manual' ? '' : ' ghost')}
              onClick={() => setMode('manual')}
            >
              {t('Manual selection')}
            </button>
          </div>
          <p className="note" style={{ marginTop: 8 }}>
            {mode === 'auto'
              ? t('A different, spread-across-categories set is drawn every day — no maintenance needed.')
              : t('Shown exactly in the order you pick below. Items that go offline are skipped automatically.')}
          </p>
        </div>

        <div className="fld">
          <label>{t('How many picks')}</label>
          <div className="row">
            <input
              type="number"
              min={1}
              max={FEATURED_MAX}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              style={{ width: 110 }}
            />
            {[8, 12, 16, 20].map((n) => (
              <button key={n} className={'btn sm' + (count === n ? '' : ' ghost')} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <p className="note" style={{ marginTop: 8 }}>
            {t('Between 1 and {max}. Landing pages always take the first 8.', { max: FEATURED_MAX })}
          </p>
        </div>
      </div>

      {(
        <>
          <div className="fld" style={{ marginTop: 18 }}>
            <label>
              {mode === 'manual' ? t('Selected order') : t('Pinned picks')} · {picked.length}/{count}
            </label>
            {mode === 'auto' && (
              <p className="note" style={{ marginTop: 0 }}>
                {t('Pinned items always appear in the featured block; the remaining slots still rotate every day. Leave empty for pure rotation.')}
              </p>
            )}
            {picked.length === 0 ? (
              <div className="note">{t('Nothing selected yet — pick products from the list below.')}</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>#</th>
                    <th>{t('Product')}</th>
                    <th style={{ width: 130 }}>{t('Category')}</th>
                    <th style={{ width: 150 }}>{t('Order')}</th>
                  </tr>
                </thead>
                <tbody>
                  {picked.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i + 1}</td>
                      <td>
                        <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                          <img
                            src={p.images[0]}
                            alt=""
                            width={38}
                            height={38}
                            style={{ objectFit: 'cover', borderRadius: 4 }}
                          />
                          <span>
                            {nameOf(p)} <small style={{ opacity: 0.55 }}>#{p.id}</small>
                          </span>
                        </div>
                      </td>
                      <td>{catNameOf(p)}</td>
                      <td>
                        <div className="row">
                          <button className="btn sm ghost" onClick={() => move(p.id, -1)} disabled={i === 0}>
                            ↑
                          </button>
                          <button
                            className="btn sm ghost"
                            onClick={() => move(p.id, 1)}
                            disabled={i === picked.length - 1}
                          >
                            ↓
                          </button>
                          <button className="btn sm ghost" onClick={() => remove(p.id)}>
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="fld" style={{ marginTop: 18 }}>
            <label>{t('Add products')}</label>
            <div className="row">
              <input
                placeholder={t('Search by name…')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                <option value="all">{t('All categories')}</option>
                {categories
                  .filter((c) => c.is_visible)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_en}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div style={{ maxHeight: 420, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}>
            <table className="tbl">
              <tbody>
                {candidates.map((p) => {
                  const on = ids.includes(p.id)
                  return (
                    <tr key={p.id}>
                      <td style={{ width: 52 }}>
                        <img
                          src={p.images[0]}
                          alt=""
                          width={40}
                          height={40}
                          style={{ objectFit: 'cover', borderRadius: 4 }}
                        />
                      </td>
                      <td>{nameOf(p)}</td>
                      <td style={{ width: 130 }}>{catNameOf(p)}</td>
                      <td style={{ width: 96 }}>
                        <button
                          className={'btn sm' + (on ? ' ghost' : '')}
                          onClick={() => (on ? remove(p.id) : add(p.id))}
                        >
                          {on ? t('Remove') : t('Add')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {candidates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="note">
                      {t('No products match this filter.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {err && <div className="err">{err}</div>}
      {ok && <div className="ok">{ok}</div>}

      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? t('Saving…') : t('Save')}
        </button>
        <span className="note">
          {t('Effective immediately for the homepage and all landing pages (within 5 minutes of cache).')}
        </span>
      </div>
    </div>
  )
}
