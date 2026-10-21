import { useEffect, useState } from 'react'
import { PLATFORMS } from '../config'
import { primaryName, secondaryName, t, useLang } from '../i18n'
import { trackClick } from '../lib/api'
import { goProps } from '../lib/router'
import type { Category, Product, SiteSettings } from '../types'

function firstImage(p: Product): string {
  return Array.isArray(p.images) && p.images.length ? p.images[0] : ''
}

export function ProductCard({
  product,
  category,
  onOpen,
  onDetails,
}: {
  product: Product
  category?: Category
  /** 打开购买渠道面板 */
  onOpen: (p: Product) => void
  /** 进入商品详情页 */
  onDetails: (p: Product) => void
}) {
  const img = firstImage(product)
  const isNew = product.sort_order < 0
  const sold = Number(product.sold_count) || 0
  const name = primaryName(product.name_en, product.name_zh)
  const sub =
    secondaryName(product.name_en, product.name_zh) ||
    (category ? primaryName(category.name_en, category.name_zh) : '')
  const photos = Array.isArray(product.images) ? product.images.length : 0
  const nav = goProps('/p/' + product.id)

  return (
    <div className="card">
      {/* 点图片 = 看更多详情图；真实 href 让爬虫能顺着爬到商品页 */}
      <a className="card-media" {...nav} aria-label={`${t('View details')} · ${name}`}>
        {img ? <img src={img} alt={name} loading="lazy" /> : <div className="card-ph">OE</div>}
        {isNew && <span className="card-badge">{t('Featured')}</span>}
        {sold > 0 && <span className="card-sold">{t('Sold {n}+', { n: sold })}</span>}
        {photos > 1 && <span className="card-photos">{t('{n} photos', { n: photos })}</span>}
        <span className="card-shop">{t('View details')}</span>
      </a>
      <a className="card-name" {...nav}>
        {name}
        {sub && <span>{sub}</span>}
      </a>
      {/* 购买按钮左侧是「查看详情」 */}
      <div className="card-actions">
        <button className="card-btn" onClick={() => onDetails(product)}>
          {t('View details')}
        </button>
        <button className="card-btn solid" onClick={() => onOpen(product)}>
          {t('Buy now')}
        </button>
      </div>
    </div>
  )
}

export function ProductGrid({
  products,
  categories,
  onOpen,
  onDetails,
}: {
  products: Product[]
  categories: Category[]
  onOpen: (p: Product) => void
  onDetails: (p: Product) => void
}) {
  useLang()
  if (!products.length) {
    return <div className="empty">{t('No products in this collection yet.')}</div>
  }
  return (
    <div className="grid">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          category={categories.find((c) => c.id === p.category_id)}
          onOpen={onOpen}
          onDetails={onDetails}
        />
      ))}
    </div>
  )
}

export function BuySheet({
  product,
  settings,
  onClose,
}: {
  product: Product
  settings: SiteSettings
  onClose: () => void
}) {
  useLang()
  const [note, setNote] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const available = PLATFORMS.filter((p) => (product.links || {})[p.key])
  const name = primaryName(product.name_en, product.name_zh)
  const sub = secondaryName(product.name_en, product.name_zh)
  const sold = Number(product.sold_count) || 0

  async function pick(key: string) {
    const url = (product.links || {})[key]
    if (!url) return
    trackClick(product.id)
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div className="mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label={t('Close')}>
          ×
        </button>
        <div className="eyebrow">{t('Choose where to buy')}</div>
        <h3>{name}</h3>
        {sub && <div className="sub">{sub}</div>}
        <div className="sheet-meta">
          {sold > 0 && <span>{t('Sold {n}+', { n: sold })}</span>}
          <a {...goProps('/p/' + product.id, onClose)} style={{ cursor: 'pointer' }}>
            {t('View details')} →
          </a>
        </div>
        {Array.isArray(product.images) && product.images.length > 1 && (
          <div className="thumbs">
            {product.images.slice(0, 8).map((src) => (
              <img key={src} src={src} alt="" loading="lazy" />
            ))}
          </div>
        )}
        {available.length ? (
          <div className="plat-list">
            {available.map((p) => (
              <a
                key={p.key}
                className="plat"
                href={(product.links || {})[p.key]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  pick(p.key)
                }}
              >
                <span className="mark">
                  {p.logo ? (
                    <img src={p.logo} alt="" loading="lazy" />
                  ) : (
                    <i className="mono">{p.name.slice(0, 1)}</i>
                  )}
                </span>
                <span className="nm">
                  <b>{p.name}</b>
                  <small>{t(p.desc)}</small>
                </span>
                <em className="go">{t('Buy')} →</em>
              </a>
            ))}
          </div>
        ) : (
          <div className="note">
            {t('No purchase link yet for this item.')} {t(settings.footer_note)}
          </div>
        )}
        {/* 微店原链接：与六个购买渠道并排但视觉上更轻，标明是卖家源页 */}
        {(product.links || {}).weidian && (
          <div style={{ marginTop: 14 }}>
            <div className="plat-list">
              <a
                className="plat plat-origin"
                href={product.links.weidian}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="mark">
                  <img src="/brand/weidian.png" alt="" loading="lazy" />
                </span>
                <span className="nm">
                  <b>
                    {t('Original listing')} · Weidian
                  </b>
                  <small>{t("Seller's own page")}</small>
                </span>
                <em className="go">{t('Open on Weidian')} →</em>
              </a>
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              {t(
                'The original listing opens on the seller’s Weidian page — payment and delivery are handled there.',
              )}
            </p>
          </div>
        )}

        {note && <div className="err">{note}</div>}
        {settings.contact?.telegram && (
          <div className="note" style={{ marginTop: 18 }}>
            {t('Need help? Contact us on Telegram')}{' '}
            <a
              href={settings.contact.telegram}
              target="_blank"
              rel="noopener noreferrer"
              style={{ borderBottom: '1px solid var(--gold)' }}
            >
              @OE
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
