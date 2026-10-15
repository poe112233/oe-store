import { useState } from 'react'
import { GROUPS } from '../config'
import { t, useLang } from '../i18n'
import { createCategory, deleteCategory, updateCategory } from '../lib/api'
import { slugify } from '../lib/import'
import type { Category, GroupKey } from '../types'

const emptyForm = { group_key: 'shoes' as GroupKey, name_en: '', name_zh: '', slug: '', is_visible: true }

export default function CategoriesTab({ categories, reload }: { categories: Category[]; reload: () => Promise<void> }) {
  useLang()
  const [form, setForm] = useState({ ...emptyForm })
  const [editing, setEditing] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  function flash(m: string, isErr = false) {
    if (isErr) setErr(m)
    else setOk(m)
    setTimeout(() => {
      setErr('')
      setOk('')
    }, 3500)
  }

  async function add() {
    setErr('')
    setOk('')
    if (!form.name_en.trim()) return flash(t('Please fill the English name'), true)
    setBusy(true)
    try {
      const sameGroup = categories.filter((c) => c.group_key === form.group_key)
      const order = sameGroup.length ? Math.max(...sameGroup.map((c) => c.sort_order)) + 1 : 1
      await createCategory({
        group_key: form.group_key,
        name_en: form.name_en.trim(),
        name_zh: form.name_zh.trim() || null,
        slug: slugify(form.slug.trim() || form.name_en.trim()),
        sort_order: order,
        is_visible: form.is_visible,
      })
      await reload()
      setForm({ ...emptyForm, group_key: form.group_key })
      flash(t('Category created'))
    } catch (e: any) {
      flash(String(e?.message || e), true)
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing) return
    setBusy(true)
    try {
      await updateCategory(editing.id, {
        group_key: editing.group_key,
        name_en: editing.name_en.trim(),
        name_zh: editing.name_zh?.trim() || null,
        slug: slugify(editing.slug || editing.name_en),
        sort_order: Number(editing.sort_order) || 0,
        is_visible: editing.is_visible,
      })
      await reload()
      setEditing(null)
      flash(t('Saved'))
    } catch (e: any) {
      flash(String(e?.message || e), true)
    } finally {
      setBusy(false)
    }
  }

  async function move(cat: Category, dir: -1 | 1) {
    const list = categories
      .filter((c) => c.group_key === cat.group_key)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    const i = list.findIndex((c) => c.id === cat.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    setBusy(true)
    try {
      for (let k = 0; k < list.length; k++) {
        const target = k === i ? j : k === j ? i : k
        await updateCategory(list[k].id, { sort_order: target + 1 })
      }
      await reload()
    } catch (e: any) {
      flash(String(e?.message || e), true)
    } finally {
      setBusy(false)
    }
  }

  async function remove(cat: Category) {
    const yes = confirm(
      t('Delete category “{name}”? Products in it will be deleted too. This cannot be undone.', { name: cat.name_en }),
    )
    if (!yes) return
    setBusy(true)
    try {
      await deleteCategory(cat.id)
      await reload()
      flash(t('Deleted'))
    } catch (e: any) {
      flash(String(e?.message || e), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="panel">
        <h3>{t('New category')}</h3>
        <div className="grid2">
          <div className="fld">
            <label>{t('Section')}</label>
            <select value={form.group_key} onChange={(e) => setForm({ ...form, group_key: e.target.value as GroupKey })}>
              {GROUPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {t(g.label)}
                </option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label>{t('Name (English)')} *</label>
            <input
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              placeholder="Air Jordan"
            />
          </div>
          <div className="fld">
            <label>{t('Name (Chinese)')}</label>
            <input value={form.name_zh} onChange={(e) => setForm({ ...form, name_zh: e.target.value })} placeholder="选填" />
          </div>
          <div className="fld">
            <label>{t('URL slug')}</label>
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder={t('Leave blank to auto-generate')}
            />
          </div>
        </div>
        <button className="btn sm gold" disabled={busy} onClick={add}>
          {t('Create category')}
        </button>
        {ok && <div className="ok">{ok}</div>}
        {err && <div className="err">{err}</div>}
      </div>

      {editing && (
        <div className="panel" style={{ borderLeft: '3px solid var(--gold)' }}>
          <h3>{t('Edit · {name}', { name: editing.name_en })}</h3>
          <div className="grid2">
            <div className="fld">
              <label>{t('Section')}</label>
              <select
                value={editing.group_key}
                onChange={(e) => setEditing({ ...editing, group_key: e.target.value as GroupKey })}
              >
                {GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {t(g.label)}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label>{t('Name (English)')}</label>
              <input value={editing.name_en} onChange={(e) => setEditing({ ...editing, name_en: e.target.value })} />
            </div>
            <div className="fld">
              <label>{t('Name (Chinese)')}</label>
              <input value={editing.name_zh || ''} onChange={(e) => setEditing({ ...editing, name_zh: e.target.value })} />
            </div>
            <div className="fld">
              <label>{t('URL slug')}</label>
              <input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <label className="note">
              <input
                type="checkbox"
                checked={editing.is_visible}
                onChange={(e) => setEditing({ ...editing, is_visible: e.target.checked })}
              />{' '}
              {t('Show on site')}
            </label>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn sm gold" disabled={busy} onClick={saveEdit}>
              {t('Save')}
            </button>
            <button className="btn sm ghost" onClick={() => setEditing(null)}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>{t('All categories ({n})', { n: categories.length })}</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('Section')}</th>
              <th>{t('Name')}</th>
              <th>{t('Slug')}</th>
              <th style={{ width: 80 }}>{t('Order')}</th>
              <th style={{ width: 90 }}>{t('Status')}</th>
              <th style={{ width: 230 }}>{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.flatMap((g) =>
              categories
                .filter((c) => c.group_key === g.key)
                .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
                .map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="pill">{t(g.label)}</span>
                    </td>
                    <td>
                      <b style={{ fontWeight: 400 }}>{c.name_en}</b>
                      {c.name_zh ? <span style={{ color: 'var(--muted)' }}> · {c.name_zh}</span> : null}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>#/c/{c.slug}</td>
                    <td>{c.sort_order}</td>
                    <td>
                      {c.is_visible ? <span className="pill on">{t('Live')}</span> : <span className="pill">{t('Hidden')}</span>}
                    </td>
                    <td>
                      <div className="row">
                        <button className="mini" disabled={busy} onClick={() => move(c, -1)}>
                          ↑
                        </button>
                        <button className="mini" disabled={busy} onClick={() => move(c, 1)}>
                          ↓
                        </button>
                        <button className="mini" onClick={() => setEditing(c)}>
                          {t('Edit')}
                        </button>
                        <button className="mini danger" disabled={busy} onClick={() => remove(c)}>
                          {t('Delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
        {!categories.length && (
          <div className="note" style={{ marginTop: 12 }}>
            {t('No categories yet. Create one, or use Bulk import.')}
          </div>
        )}
      </div>
    </>
  )
}
