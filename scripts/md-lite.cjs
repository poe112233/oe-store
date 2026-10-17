/**
 * 极简 Markdown 子集解析器（零依赖）。
 *
 * 为什么不用 marked / markdown-it：博客内容由我们自己产出，只需要一个可控的
 * 子集；引入 npm 包会让 CF Pages 的构建多一层依赖与供应链风险。
 *
 * 支持：# 标题(1-4) / 段落 / 无序·有序列表 / 引用 / 代码块 / 分隔线 /
 *      **粗体** / *斜体* / [文字](链接) / ![alt](图片) / `行内代码`
 * 不支持：表格、脚注、嵌套列表（写文章时避免即可）。
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 行内元素：先转义，再还原 Markdown 语法，避免 HTML 注入。 */
function inline(text) {
  let s = escapeHtml(text)
  s = s.replace(/`([^`]+)`/g, (_, c) => '<code>' + c + '</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const loading = ' loading="lazy" decoding="async"'
    return '<img src="' + src + '" alt="' + alt + '"' + loading + '>'
  })
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return s
}

/**
 * 解析 front-matter（--- 包裹的 key: value）。
 * 只支持单行标量 + 方括号数组（如 tags: [a, b]）。
 */
function parseFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!kv) continue
    const key = kv[1]
    let val = kv[2].trim()
    if (/^\[.*\]$/.test(val)) {
      val = val
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    } else {
      val = val.replace(/^["']|["']$/g, '')
    }
    meta[key] = val
  }
  return { meta, body: raw.slice(m[0].length) }
}

/** 生成正文 HTML。 */
function renderMarkdown(body) {
  const lines = body.split(/\r?\n/)
  const out = []
  let i = 0
  let listType = null

  const closeList = () => {
    if (listType) {
      out.push('</' + listType + '>')
      listType = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // 代码块
    if (/^```/.test(line)) {
      closeList()
      const lang = line.slice(3).trim()
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // 跳过结束 ```
      out.push('<pre><code' + (lang ? ' class="lang-' + lang + '"' : '') + '>' + escapeHtml(buf.join('\n')) + '</code></pre>')
      continue
    }

    // 分隔线
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      closeList()
      out.push('<hr>')
      i++
      continue
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      closeList()
      const lvl = h[1].length
      out.push('<h' + lvl + '>' + inline(h[2]) + '</h' + lvl + '>')
      i++
      continue
    }

    // 引用
    if (/^>\s?/.test(line)) {
      closeList()
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push('<blockquote><p>' + inline(buf.join(' ')) + '</p></blockquote>')
      continue
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push('<li>' + inline(line.replace(/^\s*[-*+]\s+/, '')) + '</li>')
      i++
      continue
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push('<li>' + inline(line.replace(/^\s*\d+\.\s+/, '')) + '</li>')
      i++
      continue
    }

    // 空行
    if (!line.trim()) {
      closeList()
      i++
      continue
    }

    // 段落（合并连续非空行）
    closeList()
    const buf = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*[-*+]\s|\s*\d+\.\s|```|---)/.test(lines[i])) {
      buf.push(lines[i].trim())
      i++
    }
    if (buf.length) out.push('<p>' + inline(buf.join(' ')) + '</p>')
  }

  closeList()
  return out.join('\n')
}

module.exports = { parseFrontMatter, renderMarkdown, escapeHtml, inline }
