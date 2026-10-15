import { GROUPS } from '../config'
import { SocialRow, activeSocials } from '../components/Social'
import { primaryName, secondaryName, t, useLang } from '../i18n'
import { go, goProps } from '../lib/router'
import type { Category, Product, SiteSettings } from '../types'
import { ProductGrid } from './ProductGrid'

const ROMAN = ['I', 'II', 'III', 'IV']

export default function Home({
  settings,
  categories,
  products,
  onOpen,
  onDetails,
  featured,
}: {
  settings: SiteSettings
  categories: Category[]
  products: Product[]
  onOpen: (p: Product) => void
  onDetails: (p: Product) => void
  featured: Product[]
}) {
  useLang()
  const visibleCats = categories.filter((c) => c.is_visible)
  const visibleProds = products.filter((p) => p.is_visible)

  return (
    <>
      <section className="hero">
        {settings.hero_image && <img className="hero-bg" src={settings.hero_image} alt="" />}
        <div className="hero-in">
          <div className="eyebrow">EST. {settings.brand.toUpperCase()}</div>
          <h1>
            {t('Timeless Beauty')} <em>{t('from the East')}</em>
          </h1>
          <p>{t(settings.intro)}</p>
          <div className="hero-cta">
            <button className="btn" onClick={() => go('/c/' + (visibleCats[0]?.slug || ''))}>
              {t('Explore the collection')}
            </button>
            <button
              className="btn ghost"
              onClick={() => document.getElementById('g-shoes')?.scrollIntoView({ behavior: 'smooth' })}
            >
              {t('Browse categories')}
            </button>
          </div>
        </div>
      </section>

      {/* 精选推荐置顶：顾客进站第一眼就看到热门款 */}
      {featured.length > 0 && (
        <section
          className="section"
          id="featured"
          style={{ background: '#fff', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}
        >
          <div className="wrap">
            <div className="section-head">
              <h2>{t('Signature picks')}</h2>
              <div className="eyebrow">{t('Trending now')}</div>
            </div>
            <ProductGrid products={featured} categories={categories} onOpen={onOpen} onDetails={onDetails} />
          </div>
        </section>
      )}

      {GROUPS.map((g, gi) => {
        const groupCats = visibleCats.filter((c) => c.group_key === g.key)
        if (!groupCats.length) return null
        return (
          <section className="section" id={'g-' + g.key} key={g.key}>
            <div className="wrap">
              <div className="section-head">
                <h2>{t(g.label)}</h2>
                <div className="eyebrow">{ROMAN[gi] ?? g.key.toUpperCase()}</div>
              </div>
              <div className="tiles">
                {groupCats.map((c) => {
                  const count = visibleProds.filter((p) => p.category_id === c.id).length
                  const sub = secondaryName(c.name_en, c.name_zh)
                  return (
                    <a className="tile" key={c.id} {...goProps('/c/' + c.slug)}>
                      <b>{primaryName(c.name_en, c.name_zh)}</b>
                      <div>
                        {sub && <small>{sub}</small>}
                        <div className="cnt">
                          {count ? t('{n} pieces', { n: count }) : t('Coming soon')}
                        </div>
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
          </section>
        )
      })}

      <section className="section">
        <div className="wrap">
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            {t('How it works')}
          </div>
          <div className="tiles">
            <div className="tile">
              <b>01</b>
              <small>{t('Browse the collection and pick a piece')}</small>
            </div>
            <div className="tile">
              <b>02</b>
              <small>{t('Choose your preferred purchase channel')}</small>
            </div>
            <div className="tile">
              <b>03</b>
              <small>{t('Complete the order on the platform')}</small>
            </div>
            <div className="tile">
              <b>04</b>
              <small>{t('We inspect, pack and ship worldwide')}</small>
            </div>
          </div>
        </div>
      </section>

      {/* 关注我们：官方渠道与社群（渠道由后台 contact 字段驱动，空的自动隐藏） */}
      {activeSocials(settings.contact).length > 0 && (
        <section
          className="section"
          id="follow"
          style={{ background: '#fff', borderTop: '1px solid var(--line)' }}
        >
          <div className="wrap follow">
            <div className="section-head">
              <h2>{t('Follow us')}</h2>
              <div className="eyebrow">{t('Contact')}</div>
            </div>
            <p className="follow-note">{t('Official channels and community — reach us anywhere.')}</p>
            <SocialRow contact={settings.contact} large />
          </div>
        </section>
      )}
    </>
  )
}
