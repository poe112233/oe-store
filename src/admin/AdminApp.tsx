import { useCallback, useEffect, useMemo, useState } from 'react'
import LangSwitch from '../components/LangSwitch'
import { LogoLockupInverse } from '../components/Logo'
import { t, useLang } from '../i18n'
import {
  fetchCategories,
  fetchPrivateConfig,
  fetchProducts,
  fetchSettings,
} from '../lib/api'
import { adminLogout, adminMe } from '../lib/localAuth'
import { go } from '../lib/router'
import {
  DEFAULT_PRIVATE,
  DEFAULT_SETTINGS,
  type Category,
  type PrivateConfig,
  type Product,
  type SiteSettings,
} from '../types'
import AdminAccounts from './AdminAccounts'
import ApiTab from './ApiTab'
import CategoriesTab from './CategoriesTab'
import ChangePassword from './ChangePassword'
import FeaturedTab from './FeaturedTab'
import HostForm from './HostForm'
import ImportTab from './ImportTab'
import Login from './Login'
import ProductsTab from './ProductsTab'
import SettingsTab from './SettingsTab'

type Tab = 'overview' | 'categories' | 'products' | 'featured' | 'import' | 'api' | 'settings' | 'account'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'categories', label: 'Categories' },
  { key: 'products', label: 'Products' },
  { key: 'featured', label: 'Featured' },
  { key: 'import', label: 'Bulk import' },
  { key: 'api', label: 'API keys' },
  { key: 'settings', label: 'Site content' },
  { key: 'account', label: 'Account' },
]

export default function AdminApp() {
  useLang()
  const [phase, setPhase] = useState<'loading' | 'login' | 'denied' | 'ready'>('loading')
  const [tab, setTab] = useState<Tab>('overview')
  const [account, setAccount] = useState('')

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS)
  const [priv, setPriv] = useState<PrivateConfig>(DEFAULT_PRIVATE)

  const reloadAll = useCallback(async () => {
    const [c, p, s, pc] = await Promise.all([fetchCategories(), fetchProducts(), fetchSettings(), fetchPrivateConfig()])
    setCategories(c)
    setProducts(p)
    setSettings(s)
    setPriv(pc)
  }, [])

  const boot = useCallback(async () => {
    setPhase('loading')
    try {
      const me = await adminMe()
      if (!me) {
        setPhase('login')
        return
      }
      setAccount(me.display_name || me.username)
      await reloadAll()
      setPhase('ready')
    } catch {
      setPhase('login')
    }
  }, [reloadAll])

  const signOut = useCallback(async () => {
    await adminLogout()
    boot()
  }, [boot])

  useEffect(() => {
    boot()
  }, [boot])

  const reloadProducts = useCallback(async () => setProducts(await fetchProducts()), [])
  const reloadCategories = useCallback(async () => setCategories(await fetchCategories()), [])

  const stats = useMemo(() => {
    const clicks = products.reduce((n, p) => n + (p.clicks || 0), 0)
    const top = [...products].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 12)
    return { clicks, top }
  }, [products])

  if (phase === 'loading') return <div className="loading">{t('Checking session…')}</div>

  if (phase === 'login') return <Login onDone={boot} />

  if (phase === 'denied')
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>{t('Not the owner')}</h1>
          <p className="note">{t('This signed-in account is not the site administrator. Only the single administrator account can write data.')}</p>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn sm ghost" onClick={signOut}>
              {t('Sign in with another account')}
            </button>
            <button className="btn sm" onClick={() => go('/')}>
              {t('Back to site')}
            </button>
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <LangSwitch />
          </div>
        </div>
      </div>
    )

  return (
    <div className="adm">
      <div className="adm-top">
        <div className="wrap adm-top-in">
          <button className="adm-brand" onClick={() => go('/')} aria-label={settings.brand}>
            <LogoLockupInverse name={settings.brand} sub={t('Manager')} size={34} />
          </button>
          <nav>
            {TABS.map((tb) => (
              <button key={tb.key} className={'adm-tab' + (tab === tb.key ? ' on' : '')} onClick={() => setTab(tb.key)}>
                {t(tb.label)}
              </button>
            ))}
            <button className="adm-tab" onClick={() => go('/')}>
              {t('View site ↗')}
            </button>
          </nav>
          <LangSwitch variant="inverse" />
        </div>
      </div>

      <div className="adm-body">
        <div className="wrap">
          {tab === 'overview' && (
            <>
              <div className="panel">
                <h3>{t('Overview')}</h3>
                <div className="stat">
                  <div>
                    <b>{categories.length}</b>
                    <small>{t('Categories')}</small>
                  </div>
                  <div>
                    <b>{products.length}</b>
                    <small>{t('Products')}</small>
                  </div>
                  <div>
                    <b>{products.filter((p) => p.is_visible).length}</b>
                    <small>{t('Published')}</small>
                  </div>
                  <div>
                    <b>{stats.clicks}</b>
                    <small>{t('Buy clicks')}</small>
                  </div>
                </div>
                <p className="note" style={{ marginTop: 16 }}>
                  {t('Signed in as {account} · multiple devices supported', { account: account || '—' })}
                </p>
              </div>

              <div className="panel">
                <h3>{t('Most clicked products')}</h3>
                {stats.top.filter((p) => p.clicks > 0).length ? (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>{t('Product')}</th>
                        <th style={{ width: 120 }}>{t('Clicks')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.top
                        .filter((p) => p.clicks > 0)
                        .map((p) => (
                          <tr key={p.id}>
                            <td>{p.name_en}</td>
                            <td>
                              <span className="pill on">{p.clicks}</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="note">
                    {t('No click data yet — clicks start counting when visitors pick a purchase platform.')}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'categories' && <CategoriesTab categories={categories} reload={reloadCategories} />}

          {tab === 'products' && (
            <ProductsTab categories={categories} products={products} priv={priv} reload={reloadProducts} />
          )}

          {tab === 'import' && (
            <ImportTab categories={categories} reloadProducts={reloadProducts} reloadCategories={reloadCategories} />
          )}

          {tab === 'featured' && (
            <FeaturedTab settings={settings} products={products} categories={categories} onSaved={reloadAll} />
          )}

          {tab === 'api' && <ApiTab />}

          {tab === 'settings' && <SettingsTab settings={settings} onSaved={reloadAll} />}

          {tab === 'account' && (
            <>
              <div className="panel">
                <h3>{t('Admin accounts')}</h3>
                <AdminAccounts />
              </div>
              <div className="panel">
                <h3>{t('Change password')}</h3>
                <ChangePassword account={account} />
              </div>
              <div className="panel">
                <h3>{t('Image host')}</h3>
                <HostForm />
              </div>
              <div className="panel">
                <h3>{t('Account')}</h3>
                <p className="note">{t('Signed in as {account}', { account: account || '—' })}</p>
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn sm ghost" onClick={signOut}>
                    {t('Sign out')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
