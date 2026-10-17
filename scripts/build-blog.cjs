/**
 * 博客构建：把 content/blog/<lang>/*.md 编译成静态 HTML，写入 dist/blog/。
 *
 * 为什么做成纯静态页（而不是接 React 路由）：
 *   1) 爬虫直接读到正文，不依赖 JS 渲染；
 *   2) 不碰数据面，不需要 API 代理；
 *   3) 与站点其余部分解耦，改文章只影响 blog/ 目录。
 *
 * 产物：
 *   dist/blog/blog.css                       统一样式
 *   dist/blog/index.html                     英文列表页
 *   dist/blog/<lang>/index.html              其它语言列表页
 *   dist/blog/<slug>/index.html              英文文章
 *   dist/blog/<lang>/<slug>/index.html       其它语言文章
 *
 * 用法：node scripts/build-blog.cjs   （必须在 vite build 之后执行）
 */
const fs = require('fs')
const path = require('path')
const { parseFrontMatter, renderMarkdown, escapeHtml } = require('./md-lite.cjs')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'content', 'blog')
const DIST = path.join(ROOT, 'dist')
const OUT = path.join(DIST, 'blog')
const ORIGIN = process.env.BLOG_ORIGIN || 'https://ores.cc'

/** 语言元数据：顺序即切换器顺序 */
const LANGS = [
  { code: 'en', htmlLang: 'en', label: 'English', home: '' },
  { code: 'de', htmlLang: 'de', label: 'Deutsch', home: '/de' },
  { code: 'fr', htmlLang: 'fr', label: 'Français', home: '/fr' },
  { code: 'es', htmlLang: 'es', label: 'Español', home: '/es' },
  { code: 'it', htmlLang: 'it', label: 'Italiano', home: '/it' },
  { code: 'pt', htmlLang: 'pt', label: 'Português', home: '/pt' },
  { code: 'nl', htmlLang: 'nl', label: 'Nederlands', home: '/nl' },
  { code: 'pl', htmlLang: 'pl', label: 'Polski', home: '/pl' },
  { code: 'ja', htmlLang: 'ja', label: '日本語', home: '/ja' },
  { code: 'zh', htmlLang: 'zh-CN', label: '中文', home: '/zh' },
]
const LANG_BY_CODE = Object.fromEntries(LANGS.map((l) => [l.code, l]))

/** 列表页/详情页上的 UI 文案 */
const UI = {
  en: { home: 'Home', blog: 'Journal', store: 'Store', readMore: 'Read', minRead: 'min read', allPosts: 'All articles', latest: 'Latest', back: 'All articles', updated: 'Updated' },
  de: { home: 'Start', blog: 'Journal', store: 'Shop', readMore: 'Lesen', minRead: 'Min. Lesezeit', allPosts: 'Alle Artikel', latest: 'Neueste', back: 'Alle Artikel', updated: 'Aktualisiert' },
  fr: { home: 'Accueil', blog: 'Journal', store: 'Boutique', readMore: 'Lire', minRead: 'min de lecture', allPosts: 'Tous les articles', latest: 'Récents', back: 'Tous les articles', updated: 'Mis à jour' },
  es: { home: 'Inicio', blog: 'Journal', store: 'Tienda', readMore: 'Leer', minRead: 'min de lectura', allPosts: 'Todos los artículos', latest: 'Recientes', back: 'Todos los artículos', updated: 'Actualizado' },
  it: { home: 'Home', blog: 'Journal', store: 'Negozio', readMore: 'Leggi', minRead: 'min di lettura', allPosts: 'Tutti gli articoli', latest: 'Recenti', back: 'Tutti gli articoli', updated: 'Aggiornato' },
  pt: { home: 'Início', blog: 'Journal', store: 'Loja', readMore: 'Ler', minRead: 'min de leitura', allPosts: 'Todos os artigos', latest: 'Recentes', back: 'Todos os artigos', updated: 'Atualizado' },
  nl: { home: 'Home', blog: 'Journal', store: 'Winkel', readMore: 'Lezen', minRead: 'min leestijd', allPosts: 'Alle artikelen', latest: 'Nieuwste', back: 'Alle artikelen', updated: 'Bijgewerkt' },
  pl: { home: 'Start', blog: 'Journal', store: 'Sklep', readMore: 'Czytaj', minRead: 'min czytania', allPosts: 'Wszystkie artykuły', latest: 'Najnowsze', back: 'Wszystkie artykuły', updated: 'Zaktualizowano' },
  ja: { home: 'ホーム', blog: 'ジャーナル', store: 'ストア', readMore: '読む', minRead: '分で読めます', allPosts: 'すべての記事', latest: '最新', back: 'すべての記事', updated: '更新日' },
  zh: { home: '首页', blog: '专栏', store: '主站', readMore: '阅读', minRead: '分钟阅读', allPosts: '全部文章', latest: '最新', back: '全部文章', updated: '更新于' },
}

const CSS = `
:root{--paper:#faf8f5;--paper2:#f2ede6;--ink:#0b0b0c;--ink2:#2a2a2d;--muted:#7a7570;--gold:#c8a96a;--gold-soft:#e3d3ae;--line:#e3ddd4}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink2);font-family:"Jost",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.72;font-size:16px;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--gold-soft)}
a:hover{border-bottom-color:var(--gold)}
.wrap{max-width:780px;margin:0 auto;padding:0 24px}
header.site{border-bottom:1px solid var(--line);background:rgba(250,248,245,.92);backdrop-filter:blur(8px);position:sticky;top:0;z-index:10}
header.site .bar{max-width:1080px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{font-family:"Cormorant Garamond",Georgia,serif;font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink);border:0}
nav.top{display:flex;gap:18px;font-size:13.5px;letter-spacing:.06em;text-transform:uppercase}
nav.top a{border:0;color:var(--muted)}
nav.top a:hover,nav.top a[aria-current]{color:var(--ink)}
article{padding:56px 0 40px}
.eyebrow{font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);font-weight:600;margin-bottom:14px}
h1{font-family:"Cormorant Garamond",Georgia,serif;font-size:clamp(30px,4.6vw,44px);line-height:1.18;margin:0 0 14px;color:var(--ink);font-weight:600;letter-spacing:-.01em}
.meta{color:var(--muted);font-size:13px;margin-bottom:34px;display:flex;gap:14px;flex-wrap:wrap}
.meta span{white-space:nowrap}
h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:26px;line-height:1.3;margin:44px 0 12px;color:var(--ink);font-weight:600}
h3{font-size:18px;margin:30px 0 8px;color:var(--ink);font-weight:650}
p{margin:14px 0}
ul,ol{margin:14px 0;padding-left:22px}
li{margin:7px 0}
blockquote{margin:26px 0;padding:16px 20px;background:var(--paper2);border-left:3px solid var(--gold);border-radius:0 4px 4px 0;color:var(--ink2)}
blockquote p{margin:0}
img{max-width:100%;height:auto;border-radius:6px;margin:22px 0;display:block}
hr{border:0;border-top:1px solid var(--line);margin:36px 0}
code{background:var(--paper2);padding:2px 6px;border-radius:3px;font-size:13.5px;font-family:Consolas,monospace}
pre{background:var(--ink);color:#e8e6e3;padding:16px 18px;border-radius:6px;overflow:auto;font-size:13.5px}
pre code{background:none;color:inherit;padding:0}
.postlist{list-style:none;padding:0;margin:8px 0 0}
.postlist li{border-bottom:1px solid var(--line);padding:22px 0;margin:0}
.postlist h2{font-size:23px;margin:0 0 6px}
.postlist .excerpt{color:var(--muted);font-size:14.5px;margin:0 0 8px}
.postlist .d{color:var(--muted);font-size:12.5px;letter-spacing:.04em}
.langbar{display:flex;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin:32px 0 0;padding-top:18px;border-top:1px solid var(--line)}
.langbar a{border:0}
footer.site{border-top:1px solid var(--line);margin-top:60px;padding:28px 0 46px;color:var(--muted);font-size:13px}
footer.site .inner{max-width:1080px;margin:0 auto;padding:0 24px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer.site a{border:0;color:var(--muted)}
.cta{display:inline-block;margin:8px 0 0;padding:10px 18px;border:1px solid var(--ink);border-radius:999px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink);border-bottom-width:1px}
.cta:hover{background:var(--ink);color:#fff}
@media(max-width:640px){article{padding:36px 0 28px}.wrap,header.site .bar,footer.site .inner{padding-left:18px;padding-right:18px}}
`

function readPosts() {
  const posts = []
  if (!fs.existsSync(SRC)) return posts
  for (const lang of LANGS) {
    const dir = path.join(SRC, lang.code)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue
      const raw = fs.readFileSync(path.join(dir, f), 'utf8')
      const { meta, body } = parseFrontMatter(raw)
      const slug = (meta.slug || f.replace(/\.md$/, '')).trim()
      const words = body.split(/\s+/).filter(Boolean).length
      posts.push({
        lang: lang.code,
        slug,
        title: meta.title || slug,
        description: meta.description || '',
        date: meta.date || '',
        updated: meta.updated || meta.date || '',
        cover: meta.cover || '',
        tags: meta.tags || [],
        body,
        html: renderMarkdown(body),
        minutes: Math.max(1, Math.round(words / 220)),
      })
    }
  }
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return posts
}

/** 某语言的路径前缀 */
function prefix(lang) {
  return lang === 'en' ? '/blog' : '/blog/' + lang
}

/** 某篇文章的绝对 URL */
function postUrl(post) {
  return ORIGIN + prefix(post.lang) + '/' + post.slug
}

/** 为该文章生成 hreflang（只标注真实存在的翻译） */
function hreflangLinks(post, posts) {
  const alts = posts.filter((p) => p.slug === post.slug)
  if (alts.length <= 1) return ''
  const rows = alts.map((p) => {
    const l = LANG_BY_CODE[p.lang]
    return '<link rel="alternate" hreflang="' + l.htmlLang + '" href="' + postUrl(p) + '">'
  })
  const en = alts.find((p) => p.lang === 'en')
  if (en) rows.push('<link rel="alternate" hreflang="x-default" href="' + postUrl(en) + '">')
  return rows.join('\n')
}

function header(lang, active) {
  const t = UI[lang] || UI.en
  const L = LANG_BY_CODE[lang]
  return `<header class="site"><div class="bar">
  <a class="brand" href="${ORIGIN}/">Oriental Essence</a>
  <nav class="top">
    <a href="${ORIGIN}/${L.home}">${t.home}</a>
    <a href="${ORIGIN}${prefix(lang)}/" ${active === 'blog' ? 'aria-current="page"' : ''}>${t.blog}</a>
    <a href="${ORIGIN}/">${t.store}</a>
  </nav>
</div></header>`
}

function footer(lang) {
  const t = UI[lang] || UI.en
  const L = LANG_BY_CODE[lang]
  return `<footer class="site"><div class="inner">
  <span>© ${new Date().getFullYear()} Oriental Essence · ores.cc</span>
  <span><a href="${ORIGIN}${prefix(lang)}/">${t.allPosts}</a> · <a href="${ORIGIN}/${L.home}">${t.store}</a></span>
</div></footer>`
}

function langSwitcher(post, posts) {
  const alts = posts.filter((p) => p.slug === post.slug)
  if (alts.length <= 1) return ''
  const items = alts
    .map((p) => {
      const l = LANG_BY_CODE[p.lang]
      const cur = p.lang === post.lang ? ' style="color:var(--ink);font-weight:600"' : ''
      return `<a href="${prefix(p.lang)}/${p.slug}/"${cur}>${l.label}</a>`
    })
    .join(' · ')
  return `<div class="langbar">${items}</div>`
}

function postPage(post, posts) {
  const L = LANG_BY_CODE[post.lang]
  const t = UI[post.lang] || UI.en
  const url = postUrl(post)
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    inLanguage: L.htmlLang,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: 'Oriental Essence', url: ORIGIN + '/' },
    publisher: { '@type': 'Organization', name: 'Oriental Essence', url: ORIGIN + '/' },
    ...(post.cover ? { image: post.cover.startsWith('http') ? post.cover : ORIGIN + post.cover } : {}),
  }
  return `<!DOCTYPE html>
<html lang="${L.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(post.title)} | Oriental Essence</title>
<meta name="description" content="${escapeHtml(post.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(post.title)}">
<meta property="og:description" content="${escapeHtml(post.description)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Oriental Essence">
${post.cover ? '<meta property="og:image" content="' + (post.cover.startsWith('http') ? post.cover : ORIGIN + post.cover) + '">' : ''}
<meta name="twitter:card" content="summary_large_image">
${hreflangLinks(post, posts)}
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
${header(post.lang, 'blog')}
<main class="wrap">
<article>
<div class="eyebrow">${escapeHtml((post.tags[0] || 'Journal'))}</div>
<h1>${escapeHtml(post.title)}</h1>
<div class="meta">
<span>${escapeHtml(post.date || '')}</span>
${post.updated && post.updated !== post.date ? '<span>' + t.updated + ' ' + escapeHtml(post.updated) + '</span>' : ''}
<span>${post.minutes} ${t.minRead}</span>
</div>
${post.html}
<div class="langbar">
<a href="${prefix(post.lang)}/">← ${t.back}</a>
</div>
</article>
</main>
${footer(post.lang)}
</body>
</html>`
}

function listPage(lang, posts) {
  const L = LANG_BY_CODE[lang]
  const t = UI[lang] || UI.en
  const mine = posts.filter((p) => p.lang === lang)
  const items = mine
    .map(
      (p) => `<li>
  <h2><a href="${prefix(lang)}/${p.slug}/">${escapeHtml(p.title)}</a></h2>
  <p class="excerpt">${escapeHtml(p.description)}</p>
  <div class="d">${escapeHtml(p.date || '')} · ${p.minutes} ${t.minRead}</div>
</li>`
    )
    .join('\n')
  const url = ORIGIN + prefix(lang) + '/'
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Oriental Essence Journal',
    inLanguage: L.htmlLang,
    url,
    blogPost: mine.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: postUrl(p), datePublished: p.date })),
  }
  // 列表页之间也互标 hreflang
  const alts = LANGS.filter((l) => posts.some((p) => p.lang === l.code))
  const hl = alts.map((l) => `<link rel="alternate" hreflang="${l.htmlLang}" href="${ORIGIN}${prefix(l.code)}/">`).join('\n')
  return `<!DOCTYPE html>
<html lang="${L.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Journal — ${escapeHtml(t.allPosts)} | Oriental Essence</title>
<meta name="description" content="Buying guides, quality checks and care notes from the Oriental Essence store — sneakers, timepieces, apparel and accessories.">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="Journal | Oriental Essence">
<meta property="og:url" content="${url}">
${hl}
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
${header(lang, 'blog')}
<main class="wrap">
<article>
<div class="eyebrow">${t.latest}</div>
<h1>Journal</h1>
<p style="color:var(--muted);font-size:15px;margin-bottom:28px">${escapeHtml(t.allPosts)} · ${mine.length}</p>
<ul class="postlist">${items}</ul>
</article>
</main>
${footer(lang)}
</body>
</html>`
}

function main() {
  const posts = readPosts()
  if (!posts.length) {
    console.log('[blog] 没有找到任何文章，跳过')
    return
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'blog.css'), CSS)

  let pages = 0
  for (const post of posts) {
    const dir = post.lang === 'en' ? path.join(OUT, post.slug) : path.join(OUT, post.lang, post.slug)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), postPage(post, posts))
    pages++
  }
  const langsWithPosts = LANGS.filter((l) => posts.some((p) => p.lang === l.code))
  for (const l of langsWithPosts) {
    const dir = l.code === 'en' ? OUT : path.join(OUT, l.code)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), listPage(l.code, posts))
    pages++
  }
  const byLang = langsWithPosts.map((l) => l.code + ':' + posts.filter((p) => p.lang === l.code).length).join(' ')
  console.log(`[blog] 文章 ${posts.length} 篇 · 页面 ${pages} 个 · 语言 ${byLang}`)

  // 把博客 URL 并入 sitemap（站点原有 877 条在 public/sitemap.xml，vite build 已复制到 dist）
  const sitemapFile = path.join(DIST, 'sitemap.xml')
  if (fs.existsSync(sitemapFile)) {
    let xml = fs.readFileSync(sitemapFile, 'utf8')
    const urls = []
    for (const l of langsWithPosts) {
      urls.push({ loc: ORIGIN + prefix(l.code) + '/', lastmod: '' })
    }
    for (const p of posts) urls.push({ loc: postUrl(p), lastmod: p.updated || p.date || '' })
    const rows = urls
      .map((u) => '  <url><loc>' + u.loc + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>')
      .join('\n')
    if (xml.includes('</urlset>')) {
      xml = xml.replace('</urlset>', rows + '\n</urlset>')
      fs.writeFileSync(sitemapFile, xml)
      console.log(`[blog] sitemap 追加 ${urls.length} 条（总条数 ${(xml.match(/<url>/g) || []).length}）`)
    }
  }
}

main()
