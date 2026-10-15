import { useEffect, useMemo, useState } from 'react'
import { groupLabel, primaryName, secondaryName, t, useLang } from '../i18n'
import { goProps, scrollTop } from '../lib/router'
import type { Category, Product } from '../types'
import { ProductGrid } from './ProductGrid'

export default function CategoryPage({
  category,
  categories,
  products,
  onOpen,
  onDetails,
}: {
  category: Category | undefined
  categories: Category[]
  products: Product[]
  onOpen: (p: Product) => void
  onDetails: (p: Product) => void
}) {
  useLang()
  const [q, setQ] = useState('')
  useEffect(() => {
    scrollTop()
  }, [category?.id])

  const list = useMemo(() => {
    const base = products.filter((p) => p.is_visible && p.category_id === category?.id)
    const kw = q.trim().toLowerCase()
    if (!kw) return base
    return base.filter(
      (p) => p.name_en.toLowerCase().includes(kw) || (p.name_zh || '').toLowerCase().includes(kw),
    )
  }, [products, category?.id, q])

  const siblings = categories.filter(
    (c) => c.is_visible && c.group_key === category?.group_key && c.id !== category?.id,
  )

  if (!category) {
    return (
      <div className="wrap">
        <div className="empty">{t('Collection not found.')}</div>
      </div>
    )
  }

  const sub = secondaryName(category.name_en, category.name_zh)
  const title = primaryName(category.name_en, category.name_zh)
  const grp = groupLabel(category.group_key)
  // 分类名与所属板块同名时（如 Watches / WATCHES），面包屑不重复展示
  const showGroup = grp.trim().toLowerCase() !== title.trim().toLowerCase()

  return (
    <div className="wrap">
      <div className="crumbs">
        <a {...goProps('/')}>{t('Home')}</a>
        <span>/</span>
        {showGroup && (
          <>
            <span>{grp}</span>
            <span>/</span>
          </>
        )}
        <span style={{ color: 'var(--ink)' }}>{title}</span>
      </div>

      <h1 className="page-title">{title}</h1>
      <div className="eyebrow" style={{ marginBottom: 26 }}>
        {sub ? `${sub} · ` : ''}
        {t('{n} pieces', { n: list.length })}
      </div>

      <div className="searchbar-inline">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('Search in this collection')}
          aria-label={t('Search in this collection')}
        />
        {q && (
          <button className="mini" onClick={() => setQ('')}>
            {t('Clear')}
          </button>
        )}
      </div>

      <div style={{ paddingBottom: 40 }}>
        <ProductGrid products={list} categories={categories} onOpen={onOpen} onDetails={onDetails} />
      </div>

      {siblings.length > 0 && (
        <div style={{ paddingBottom: 70 }}>
          <div className="hairline" style={{ marginBottom: 26 }} />
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            {t('More in {group}', { group: groupLabel(category.group_key) })}
          </div>
          <div>
            {siblings.map((c) => (
              <a className="chip" key={c.id} {...goProps('/c/' + c.slug)}>
                {primaryName(c.name_en, c.name_zh)}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
