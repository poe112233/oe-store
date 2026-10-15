import { useEffect, useRef, useState } from 'react'
import { LANGS, setLang, t, useLang, type Lang } from '../i18n'

/**
 * 右上角语言切换入口。
 * - 收起态：地球线描图 + 当前语言短码 + 下拉箭头
 * - 展开态：四种语言列表，当前项高亮并带对勾
 * - 变体：plain（前台浅色底）/ inverse（后台深色顶栏）
 */
export default function LangSwitch({ variant = 'plain' }: { variant?: 'plain' | 'inverse' }) {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = LANGS.find((l) => l.key === lang) ?? LANGS[0]

  function pick(k: Lang) {
    setLang(k)
    setOpen(false)
  }

  return (
    <div className={'langswitch' + (variant === 'inverse' ? ' inverse' : '')} ref={boxRef}>
      <button
        type="button"
        className="langswitch-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('Language')}
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="globe" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3.6 9h16.8M3.6 15h16.8" />
        </svg>
        <span className="code">{current.short}</span>
        <svg className="caret" width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M1.5 3.5 5 7l3.5-3.5" />
        </svg>
      </button>

      {open && (
        <div className="lang-menu" role="listbox" aria-label={t('Language')}>
          <div className="lang-menu-head">{t('Language')}</div>
          {LANGS.map((l) => (
            <button
              type="button"
              key={l.key}
              role="option"
              aria-selected={l.key === lang}
              className={'lang-item' + (l.key === lang ? ' on' : '')}
              onClick={() => pick(l.key)}
            >
              <span className="lang-full">{l.label}</span>
              <span className="lang-short">{l.short}</span>
              {l.key === lang && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M1.5 6.4 4.4 9.3 10.5 3" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
