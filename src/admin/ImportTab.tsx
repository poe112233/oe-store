import { useMemo, useRef, useState } from 'react'
import { GROUPS } from '../config'
import { t, useLang } from '../i18n'
import { createCategory, createProductsBulk, fetchCategories, fetchProducts } from '../lib/api'
import { parsePasted, slugify, type ParsedRow } from '../lib/import'
import type { Category, GroupKey, Product } from '../types'

export default function ImportTab({
  categories,
  reloadProducts,
  reloadCategories,
}: {
  categories: Category[]
  reloadProducts: () => Promise<void>
  reloadCategories: () => Promise<void>
}) {
  useLang()
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [skipped, setSkipped] = useState(0)
  const [platCols, setPlatCols] = useState<string[]>([])
  const [target, setTarget] = useState<string>(categories[0] ? String(categories[0].id) : '__new__')
  const [newName, setNewName] = useState('')
  const [newGroup, setNewGroup] = useState<GroupKey>('shoes')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [rawHint, setRawHint] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    e.preventDefault()
    const parsed = parsePasted(html, text)
    setRows(parsed.rows)
    setSkipped(parsed.skipped)
    setPlatCols(parsed.platformColumns)
    setRawHint(parsed.hasHtmlLinks ? t('Table with hyperlinks detected') : t('Plain text only — no links captured'))
    setTimeout(() => {
      if (boxRef.current) boxRef.current.innerText = t('Pasted {n} product rows', { n: parsed.rows.length })
    }, 0)
  }

  function clearAll() {
    setRows([])
    setSkipped(0)
    setPlatCols([])
    setRawHint('')
    if (boxRef.current) boxRef.current.innerText = ''
  }

  const preview = useMemo(() => rows.slice(0, 20), [rows])

  async function run() {
    if (!rows.length) return
    setBusy(true)
    setErr('')
    setOk('')
    try {
      let categoryId: number
      if (target === '__new__') {
        if (!newName.trim()) throw new Error(t('Please fill the new category name'))
        const same = categories.filter((c) => c.group_key === newGroup)
        const order = same.length ? Math.max(...same.map((c) => c.sort_order)) + 1 : 1
        await createCategory({
          group_key: newGroup,
          name_en: newName.trim(),
          name_zh: null,
          slug: slugify(newName.trim()),
          sort_order: order,
          is_visible: true,
        })
        await reloadCategories()
        const list = await fetchCategories()
        const found = list.filter((c) => c.name_en === newName.trim()).pop()
        if (!found) throw new Error(t('New category was created but could not be read back. Refresh and retry.'))
        categoryId = found.id
      } else {
        categoryId = Number(target)
      }

      const sameCat = (await fetchProducts()).filter((p: Product) => p.category_id === categoryId)
      let order = sameCat.length ? Math.max(...sameCat.map((p) => p.sort_order)) + 1 : 1
      const payloads = rows.map((r) => ({
        category_id: categoryId,
        name_en: r.name,
        name_zh: null,
        images: [],
        links: r.links,
        sort_order: order++,
        is_visible: true,
      }))
      const n = await createProductsBulk(payloads)
      await reloadProducts()
      setOk(t('Imported {n} products', { n }))
      clearAll()
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="panel">
        <h3>{t('Bulk import from spreadsheet')}</h3>
        <p className="note" style={{ marginTop: 0 }}>
          {t('Select the product-name and six Buylink columns (with the header row) in your spreadsheet, press Ctrl+C, then paste below.')}
          <br />
          {t('Links are only carried in the HTML clipboard format — copying as plain text will not bring them over.')}
        </p>
        <div
          ref={boxRef}
          className="pastebox"
          contentEditable
          suppressContentEditableWarning
          onPaste={handlePaste}
          style={{ marginTop: 14 }}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="mini" onClick={clearAll}>
            {t('Clear')}
          </button>
          {rawHint && <span className="note">{rawHint}</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="panel">
            <h3>{t('Preview · {n} rows', { n: rows.length })}</h3>
            <div className="row" style={{ marginBottom: 14 }}>
              {platCols.length > 0 && (
                <span className="note">{t('Platform columns detected: {list}', { list: platCols.join(', ') })}</span>
              )}
              {skipped > 0 && <span className="note">{t('Skipped {n} rows (titles, group rows, blanks)', { n: skipped })}</span>}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('Product name')}</th>
                    <th>{t('Links captured')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td className="note">
                        {Object.entries(r.links)
                          .map(([k, v]) => `${k} → ${v.slice(0, 48)}…`)
                          .join('　')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > preview.length && (
              <div className="note" style={{ marginTop: 10 }}>
                {t('Showing first {n} rows…', { n: preview.length })}
              </div>
            )}
          </div>

          <div className="panel">
            <h3>{t('Import into')}</h3>
            <div className="grid2">
              <div className="fld">
                <label>{t('Target category')}</label>
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name_en}
                    </option>
                  ))}
                  <option value="__new__">+ {t('New category…')}</option>
                </select>
              </div>
              {target === '__new__' && (
                <>
                  <div className="fld">
                    <label>{t('New category name (English)')}</label>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Air Jordan" />
                  </div>
                  <div className="fld">
                    <label>{t('Section')}</label>
                    <select value={newGroup} onChange={(e) => setNewGroup(e.target.value as GroupKey)}>
                      {GROUPS.map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.label} · {g.zh}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <button className="btn sm gold" disabled={busy} onClick={run}>
              {busy ? t('Importing…') : t('Import {n} products', { n: rows.length })}
            </button>
            {ok && <div className="ok">{ok}</div>}
            {err && <div className="err">{err}</div>}
          </div>
        </>
      )}
    </>
  )
}
