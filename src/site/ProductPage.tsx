import { useEffect, useMemo, useState } from 'react'
import { groupLabel, primaryName, secondaryName, t, useLang } from '../i18n'
import { go, goProps, scrollTop } from '../lib/router'
import type { Category, Product } from '../types'
import { ProductGrid } from './ProductGrid'

export default function ProductPage({
  product,
  category,
  categories,
  products,
  onOpen,
  onDetails,
}: {
  product: Product | undefined
  category: Category | undefined
  categories: Category[]
  products: Product[]
  onOpen: (p: Product) => void
  onDetails: (p: Product) => void
}) {
  useLang()
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    scrollTop()
    setIdx(0)
  }, [product?.id])

  const images = useMemo(
    () => (Array.isArray(product?.images) ? product!.images.filter(Boolean) : []),
    [product],
  )

  const siblings = useMemo(() => {
    if (!product) return []
    return products
      .filter((p) => p.is_visible && p.id !== product.id && p.category_id === product.category_id)
      .slice(0, 8)
  }, [products, product])

  if (!product) {
    return (
      <div className="wrap">
        <div className="empty">{t('Product not found.')}</div>
      </div>
    )
  }

  const name = primaryName(product.name_en, product.name_zh)
  const sub = secondaryName(product.name_en, product.name_zh)
  const sold = Number(product.sold_count) || 0
  const catName = category ? primaryName(category.name_en, category.name_zh) : ''
  const grp = category ? groupLabel(category.group_key) : ''
  const showGroup = grp.trim().toLowerCase() !== catName.trim().toLowerCase()

  return (
    <div className="wrap">
      <div className="crumbs">
        <a {...goProps('/')}>{t('Home')}</a>
        <span>/</span>
        {category && (
          <>
            {showGroup && (
              <>
                <span>{grp}</span>
                <span>/</span>
              </>
            )}
            <a {...goProps('/c/' + category.slug)}>{catName}</a>
            <span>/</span>
          </>
        )}
        <span style={{ color: 'var(--ink)' }}>{name}</span>
      </div>

      <div className="pdp">
        <div className="pdp-media">
          <div className="pdp-main">
            {images.length ? (
              <img src={images[idx]} alt={name} />
            ) : (
              <div className="card-ph">OE</div>
            )}
            {sold > 0 && <span className="card-sold">{t('Sold {n}+', { n: sold })}</span>}
          </div>
          {images.length > 1 && (
            <div className="pdp-thumbs">
              {images.map((src, i) => (
                <button
                  key={src + i}
                  className={'pdp-thumb' + (i === idx ? ' on' : '')}
                  onClick={() => setIdx(i)}
                  aria-label={`${t('Photo {n}', { n: i + 1 })}`}
                >
                  <img src={src} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdp-info">
          <div className="eyebrow">{catName ? `${grp} · ${catName}` : t('Product details')}</div>
          <h1 className="page-title" style={{ marginTop: 10 }}>
            {name}
          </h1>
          {sub && (
            <div className="eyebrow" style={{ marginBottom: 18 }}>
              {sub}
            </div>
          )}
          <div className="pdp-meta">
            {sold > 0 && <span>{t('Sold {n}+', { n: sold })}</span>}
            {images.length > 1 && <span>{t('{n} photos', { n: images.length })}</span>}
          </div>

          <div className="pdp-actions">
            <button className="btn gold" onClick={() => onOpen(product)}>
              {t('Buy now')}
            </button>
            {category && (
              <button className="btn ghost" onClick={() => go('/c/' + category.slug)}>
                {t('Back to {name}', { name: catName })}
              </button>
            )}
          </div>

          <p className="note" style={{ marginTop: 22 }}>
            {t('Pick a platform below to buy — we inspect, pack and ship worldwide.')}
          </p>

          {/* 微店原链接：想看卖家原始商品页/实拍图时用 */}
          {(product.links || {}).weidian && (
            <p className="note" style={{ marginTop: 10 }}>
              <a
                href={product.links.weidian}
                target="_blank"
                rel="noopener noreferrer"
                style={{ borderBottom: '1px solid var(--gold)', paddingBottom: 2 }}
              >
                {t('View the original listing on Weidian')} →
              </a>
            </p>
          )}
        </div>
      </div>

      {siblings.length > 0 && (
        <div style={{ paddingBottom: 70 }}>
          <div className="hairline" style={{ marginBottom: 26 }} />
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            {t('More from this collection')}
          </div>
          <ProductGrid products={siblings} categories={categories} onOpen={onOpen} onDetails={onDetails} />
        </div>
      )}
    </div>
  )
}
