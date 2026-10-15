import { PLATFORMS } from '../config'

export interface ParsedRow {
  name: string
  links: Record<string, string>
}

export interface ParseResult {
  rows: ParsedRow[]
  skipped: number
  platformColumns: string[]
  hasHtmlLinks: boolean
}

const PLATFORM_KEYS = PLATFORMS.map((p) => p.key) as readonly string[]

function platformFromHeader(text: string): string | null {
  const t = (text || '').toLowerCase().replace(/[^a-z]/g, '')
  for (const key of PLATFORM_KEYS) {
    if (t.includes(key)) return key
  }
  return null
}

function isGroupRow(cells: string[]): boolean {
  const filled = cells.filter((c) => (c || '').trim().length)
  if (filled.length === 0) return true
  if (filled.length === 1) {
    const only = filled[0].trim().toLowerCase()
    if (only.includes('picture') && only.includes('display')) return true
    return true
  }
  if (cells.some((c) => (c || '').toLowerCase().includes('picture display'))) return true
  return false
}

/** 把粘贴内容（HTML 优先，其次 TSV 文本）解析成待导入的商品行。 */
export function parsePasted(html: string, text: string): ParseResult {
  const result: ParseResult = { rows: [], skipped: 0, platformColumns: [], hasHtmlLinks: false }

  if (html && html.includes('<table')) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    if (table) {
      const trs = Array.from(table.querySelectorAll('tr'))
      const matrix: { text: string; href: string }[][] = trs.map((tr) =>
        Array.from(tr.querySelectorAll('td,th')).map((td) => {
          const a = td.querySelector('a[href]')
          return { text: (td.textContent || '').replace(/\s+/g, ' ').trim(), href: a ? a.getAttribute('href') || '' : '' }
        }),
      )
      if (matrix.length) {
        // 找表头：第一行里出现平台名的行
        let headerIdx = -1
        const colMap: Record<number, string> = {}
        for (let i = 0; i < Math.min(matrix.length, 3); i++) {
          const map: Record<number, string> = {}
          matrix[i].forEach((c, j) => {
            const k = platformFromHeader(c.text)
            if (k && map[j] === undefined && !Object.values(map).includes(k)) map[j] = k
          })
          if (Object.keys(map).length >= 2) {
            headerIdx = i
            Object.assign(colMap, map)
            break
          }
        }
        const linkCols: { idx: number; key: string }[] = []
        if (headerIdx >= 0) {
          for (const [idx, key] of Object.entries(colMap)) linkCols.push({ idx: Number(idx), key })
          result.platformColumns = linkCols.map((c) => c.key)
        }

        matrix.forEach((row, i) => {
          if (i <= headerIdx) return
          const cells = row.map((c) => c.text)
          if (isGroupRow(cells)) {
            result.skipped++
            return
          }
          const name = (row[0]?.text || '').trim()
          if (!name) {
            result.skipped++
            return
          }
          const links: Record<string, string> = {}
          if (linkCols.length) {
            for (const col of linkCols) {
              const href = row[col.idx]?.href
              if (href && /^https?:\/\//i.test(href)) links[col.key] = href
            }
          } else {
            // 无表头：按 2..N 列顺序对齐到平台
            const hrefs: string[] = []
            for (let j = 1; j < row.length; j++) {
              const h = row[j]?.href
              if (h && /^https?:\/\//i.test(h)) hrefs.push(h)
            }
            hrefs.forEach((h, k) => {
              if (PLATFORM_KEYS[k]) links[PLATFORM_KEYS[k]] = h
            })
          }
          if (!Object.keys(links).length) {
            result.skipped++
            return
          }
          result.hasHtmlLinks = true
          result.rows.push({ name, links })
        })
        return result
      }
    }
  }

  // 纯文本（TSV / 多空格）兜底：只能拿到商品名，链接需要手填
  const lines = (text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const cells = line.split('\t').map((c) => c.trim())
    if (cells.length < 2) {
      result.skipped++
      continue
    }
    const name = cells[0]
    const links: Record<string, string> = {}
    const urls = cells.slice(1).filter((c) => /^https?:\/\//i.test(c))
    urls.forEach((u, k) => {
      if (PLATFORM_KEYS[k]) links[PLATFORM_KEYS[k]] = u
    })
    if (!name || !Object.keys(links).length) {
      result.skipped++
      continue
    }
    result.rows.push({ name, links })
  }
  return result
}

export function slugify(input: string): string {
  const base = (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'item-' + Math.random().toString(36).slice(2, 7)
}
