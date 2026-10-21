import { useCallback, useEffect, useMemo, useState } from 'react'
import LangSwitch from '../components/LangSwitch'
import { LogoLockup } from '../components/Logo'
import { activeSocials } from '../components/Social'
import { GROUPS, PLATFORMS, SITE_ORIGIN } from '../config'
import { groupLabel, primaryName, t, useLang } from '../i18n'
import { fetchCategories, fetchProducts, fetchSettings } from '../lib/api'
import { pickFeatured } from '../lib/featured'
import type { BootData } from '../lib/boot'
import { go, goProps, type Route, pagePath } from '../lib/router'
import { applySeo, breadcrumbJsonLd, organizationJsonLd, websiteJsonLd } from '../lib/seo'
import { DEFAULT_SETTINGS, type Category, type Product, type SiteSettings } from '../types'
import CategoryPage from './CategoryPage'
import Home from './Home'
import ProductPage from './ProductPage'
import { BuySheet, ProductGrid } from './ProductGrid'

export default function SiteApp({ route, boot }: { route: Route; boot: BootData | null }) {
  useLang()
  const [categories, setCategories] = useState<Category[]>(boot?.categories ?? [])
  const [products, setProducts] = useState<Product[]>(boot?.products ?? [])
  const [settings, setSettings] = useState<SiteSettings>(boot?.settings ?? DEFAULT_SETTINGS)
  // 有预取数据时不必再进 loading 态，直接渲染 —— 静态内容与 React 渲染无缝衔接
  const [loading, setLoading] = useState(!boot)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [active, setActive] = useState<Product | null>(null)

  useEffect(() => {
    if (boot) return
    let alive = true
    ;(async () => {
      try {
        const [c, p, s] = await Promise.all([fetchCategories(), fetchProducts(), fetchSettings()])
        if (!alive) return
        setCategories(c)
        setProducts(p)
        setSettings(s)
      } catch (e: any) {
        if (alive) setError(String(e?.message || e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [boot])

  const visibleProducts = useMemo(() => products.filter((p) => p.is_visible), [products])

  // 精选推荐：后台可切「手工指定 / 每日确定性随机」，数量也由后台决定
  const featured = useMemo(
    () =>
      pickFeatured(visibleProducts, categories, {
        mode: settings.featured_mode,
        count: settings.featured_count,
        ids: settings.featured_ids,
      }),
    [visibleProducts, categories, settings.featured_mode, settings.featured_count, settings.featured_ids],
  )

  const searchResults = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return []
    return visibleProducts
      .filter(
        (p) =>
          p.name_en.toLowerCase().includes(kw) ||
          (p.name_zh || '').toLowerCase().includes(kw) ||
          (categories.find((c) => c.id === p.category_id)?.name_en || '').toLowerCase().includes(kw),
      )
      .slice(0, 60)
  }, [q, visibleProducts, categories])

  const openProduct = useCallback((p: Product) => setActive(p), [])

  /** 进商品详情页 */
  const openDetails = useCallback((p: Product) => {
    setQ('')
    go('/p/' + p.id)
  }, [])

  const currentCategory = route.name === 'category' ? categories.find((c) => c.slug === route.param) : undefined

  const currentProduct =
    route.name === 'product' ? visibleProducts.find((p) => String(p.id) === String(route.param)) : undefined
  const currentProductCat = currentProduct
    ? categories.find((c) => c.id === currentProduct.category_id)
    : undefined

  /* 每页独立的 SEO 元信息（title / description / canonical / 结构化数据）。
     预渲染时会连同渲染结果一起被固化成静态标签，交给爬虫。 */
  useEffect(() => {
    if (loading) return
    const channels = PLATFORMS.map((p) => p.name.toUpperCase()).join(', ')

    if (route.name === 'product' && currentProduct) {
      const name = primaryName(currentProduct.name_en, currentProduct.name_zh)
      const catName = currentProductCat
        ? primaryName(currentProductCat.name_en, currentProductCat.name_zh)
        : 'Collection'
      const grp = currentProductCat ? groupLabel(currentProductCat.group_key) : ''
      const path = `/p/${currentProduct.id}`
      applySeo({
        title: `${name} — ${catName} | Oriental Essence`,
        description: `${name} in ${catName}, curated by Oriental Essence. Available through ${channels}.`,
        path,
        image: Array.isArray(currentProduct.images) ? currentProduct.images[0] : undefined,
        jsonLd: [
          // ⚠️ 这里绝不能声明 @type: Product。
          // 商品没有价格（products 表无 price 列），Google 的产品摘要要求 Product 必须带
          // offers / review / aggregateRating 之一，否则按「严重问题」报错并剥夺富媒体结果。
          // 2026-10-18 事故：此前的 Product 标记导致 GSC「产品摘要：应指定 offers、
          // review 或 aggregateRating」共 173 个受影响页面（经站群 /p/* 的 301 归属放大）。
          // 改用 ItemPage：语义准确、无任何富媒体强制字段，也不会被误判成商品卡片。
          {
            '@context': 'https://schema.org',
            '@type': 'ItemPage',
            name: `${name} — ${catName}`,
            description: `${name} — ${grp ? grp + ' · ' : ''}${catName}, curated by Oriental Essence.`,
            url: `${SITE_ORIGIN}${pagePath(path)}`,
            primaryImageOfPage: (currentProduct.images || []).length
              ? { '@type': 'ImageObject', url: (currentProduct.images || [])[0] }
              : undefined,
            about: {
              '@type': 'Thing',
              name,
              category: catName,
            },
          },
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            ...(currentProductCat ? [{ name: catName, path: `/c/${currentProductCat.slug}` }] : []),
            { name, path },
          ]),
        ],
      })
      return
    }

    if (route.name === 'category' && currentCategory) {
      const title = primaryName(currentCategory.name_en, currentCategory.name_zh)
      const grp = groupLabel(currentCategory.group_key)
      const count = visibleProducts.filter((p) => p.category_id === currentCategory.id).length
      const path = `/c/${currentCategory.slug}`
      applySeo({
        title: `${title} — ${grp} | Oriental Essence`,
        description: `${count} curated ${title} pieces at Oriental Essence, selected for craftsmanship and silhouette. Buy through ${channels}.`,
        path,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `${title} — ${grp}`,
            url: `${SITE_ORIGIN}${pagePath(path)}`,
            description: `Oriental Essence ${title} collection — ${count} pieces.`,
          },
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: title, path },
          ]),
        ],
      })
      return
    }

    if (route.name === 'home') {
      applySeo({
        title: 'Oriental Essence — Sneakers, Timepieces & Apparel',
        description: settings.intro || DEFAULT_SETTINGS.intro,
        path: '/',
        jsonLd: [organizationJsonLd(settings.tagline), websiteJsonLd()],
      })
    }
  }, [loading, route, currentProduct, currentProductCat, currentCategory, visibleProducts, settings])

  function jumpGroup(key: string) {
    go('/')
    setTimeout(() => document.getElementById('g-' + key)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  return (
    <>
      <header className="hdr">
        <div className="hdr-in">
          <a
            className="brand"
            {...goProps('/', () => setQ(''))}
            style={{ cursor: 'pointer' }}
            aria-label={settings.brand}
          >
            <LogoLockup name={settings.brand} sub={t('Timeless Beauty from the East')} size={42} tone="gold" />
          </a>

          <nav className="nav">
            {GROUPS.map((g) => (
              <a
                key={g.key}
                href={'/#g-' + g.key}
                onClick={(e) => {
                  e.preventDefault()
                  jumpGroup(g.key)
                }}
                style={{ cursor: 'pointer' }}
              >
                {t(g.label)}
              </a>
            ))}
            <a {...goProps('/admin')} style={{ cursor: 'pointer', color: 'var(--muted)' }}>
              {t('Admin')}
            </a>
          </nav>

          <div className="hdr-right">
            <div className="search">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('Search the catalogue')}
                aria-label={t('Search the catalogue')}
              />
              {q && (
                <button className="mini" onClick={() => setQ('')} aria-label={t('Clear')}>
                  ×
                </button>
              )}
            </div>
            <LangSwitch />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="loading">{t('Loading collection…')}</div>
      ) : error ? (
        <div className="wrap">
          <div className="empty">
            {t('Could not load the catalogue.')}
            <div className="err" style={{ marginTop: 10 }}>
              {error}
            </div>
          </div>
        </div>
      ) : q.trim() ? (
        <div className="wrap">
          <div className="crumbs">{t('Search results · {n}', { n: searchResults.length })}</div>
          <h1 className="page-title">“{q}”</h1>
          <div style={{ paddingBottom: 60 }}>
            {searchResults.length ? (
              <ProductGrid
                products={searchResults}
                categories={categories}
                onOpen={openProduct}
                onDetails={openDetails}
              />
            ) : (
              <div className="empty">
                {t('Nothing matched.')} {t(settings.footer_note)}
              </div>
            )}
          </div>
        </div>
      ) : route.name === 'product' ? (
        <ProductPage
          product={currentProduct}
          category={currentProductCat}
          categories={categories}
          products={visibleProducts}
          onOpen={openProduct}
          onDetails={openDetails}
        />
      ) : route.name === 'category' ? (
        <CategoryPage
          category={currentCategory}
          categories={categories}
          products={visibleProducts}
          onOpen={openProduct}
          onDetails={openDetails}
        />
      ) : (
        <Home
          settings={settings}
          categories={categories}
          products={visibleProducts}
          onOpen={openProduct}
          onDetails={openDetails}
          featured={featured}
        />
      )}

      <footer className="ftr">
        <div className="wrap">
          <div className="ftr-grid">
            <div>
              <div style={{ marginBottom: 16 }}>
                <LogoLockup name={settings.brand} sub={t(settings.tagline)} size={34} tone="gold" />
              </div>
              <p style={{ maxWidth: 380 }}>{t(settings.intro)}</p>
            </div>
            <div>
              <h4>{t('Collections')}</h4>
              {GROUPS.map((g) => (
                <p key={g.key}>
                  <a
                    href={'/#g-' + g.key}
                    onClick={(e) => {
                      e.preventDefault()
                      jumpGroup(g.key)
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {t(g.label)}
                  </a>
                </p>
              ))}
              <p>
                <a {...goProps('/admin')} style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>
                  {t('Admin')}
                </a>
              </p>
            </div>
            <div>
              <h4>{t('Contact')}</h4>
              {settings.contact?.email && (
                <p>
                  <a href={`mailto:${settings.contact.email}`}>{settings.contact.email}</a>
                </p>
              )}
              {settings.contact?.wechat && <p>WeChat: {settings.contact.wechat}</p>}
              {/* 顺序、标签、品牌色统一由 config.SOCIALS 定义；同一平台多条时带 tag 区分 */}
              {activeSocials(settings.contact).map((s) => (
                <p key={s.key}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label}
                    {s.tag && <i className="soc-tag">{t(s.tag)}</i>}
                  </a>
                </p>
              ))}
            </div>
          </div>
          <div className="ftr-bottom">
            <span>
              © {new Date().getFullYear()} {settings.brand}. {t('All rights reserved.')}
            </span>
            <span>{t(settings.footer_note)}</span>
          </div>
        </div>
      </footer>

      {active && <BuySheet product={active} settings={settings} onClose={() => setActive(null)} />}
    </>
  )
}
