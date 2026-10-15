import type { PrivateConfig } from '../types'

const EXT_OK = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']

function ext(name: string): string {
  const e = (name.split('.').pop() || '').toLowerCase()
  return EXT_OK.includes(e) ? e : 'jpg'
}

function rid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '')
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.onload = () => {
      const s = String(fr.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    fr.readAsDataURL(file)
  })
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  const size = Math.max(15, Math.round(w * 0.026))
  ctx.save()
  ctx.font = `500 ${size}px "Cormorant Garamond", Georgia, serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.globalAlpha = 0.62
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.shadowColor = 'rgba(0,0,0,0.42)'
  ctx.shadowBlur = size * 0.6
  ctx.shadowOffsetY = 1
  ctx.fillText(text, w - size * 0.8, h - size * 0.7)
  ctx.restore()
}

/** 上传前处理：限制最长边、可选加水印、统一转 webp。返回可直接提交的二进制与扩展名。 */
async function processImage(file: File, cfg: PrivateConfig): Promise<{ blob: Blob; ext: string }> {
  const needWatermark = !!cfg.watermark
  if (!cfg.compress_images && !needWatermark) {
    return { blob: file, ext: ext(file.name) }
  }
  try {
    const bitmap = await createImageBitmap(file)
    const maxW = Math.max(320, Number(cfg.max_width) || 1600)
    const scale = Math.min(1, maxW / bitmap.width)
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob: file, ext: ext(file.name) }
    ctx.drawImage(bitmap, 0, 0, w, h)
    if (needWatermark) drawWatermark(ctx, w, h, cfg.watermark_text || 'Oriental Essence')
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.87))
    if (!blob) return { blob: file, ext: ext(file.name) }
    // 压缩后反而更大时保留原图（例如原本就是小尺寸 webp）
    if (blob.size >= file.size && !needWatermark) return { blob: file, ext: ext(file.name) }
    return { blob, ext: 'webp' }
  } catch {
    return { blob: file, ext: ext(file.name) }
  }
}

export function publicUrl(cfg: PrivateConfig, path: string): string {
  const repo = cfg.github_repo.trim()
  const branch = (cfg.github_branch || 'main').trim()
  if (cfg.cdn_mode === 'raw') return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`
  return `https://cdn.jsdelivr.net/gh/${repo}@${branch}/${path}`
}

export interface UploadResult {
  path: string
  url: string
}

/** 把一张图片提交到 GitHub 图库仓库，返回 CDN 直链。路径只由服务端生成的 id + 安全扩展名组成。 */
export async function uploadImage(file: File, cfg: PrivateConfig): Promise<UploadResult> {
  if (!cfg.github_token) throw new Error('尚未配置 GitHub 上传令牌，请先到「图床设置」填写')
  if (!cfg.github_repo || !cfg.github_repo.includes('/')) throw new Error('图库仓库格式应为 owner/repo')
  if (file.size > 12 * 1024 * 1024) throw new Error('单张图片请控制在 12MB 以内')

  const now = new Date()
  const processed = await processImage(file, cfg)
  const path = `products/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}/${rid()}.${processed.ext}`
  const content = await fileToBase64(processed.blob)

  const res = await fetch(`https://api.github.com/repos/${cfg.github_repo.trim()}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.github_token.trim()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `upload ${path}`,
      content,
      branch: (cfg.github_branch || 'main').trim(),
    }),
  })

  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.message || ''
    } catch {
      /* ignore */
    }
    if (res.status === 401) throw new Error('上传失败：令牌无效或已过期（401）')
    if (res.status === 403) throw new Error(`上传失败：令牌权限不足（403）${detail}`)
    if (res.status === 404) throw new Error('上传失败：仓库不存在或令牌无权访问该仓库（404）')
    if (res.status === 422) throw new Error(`上传失败：目标分支不存在（422）${detail}`)
    throw new Error(`上传失败 ${res.status} ${detail}`)
  }

  return { path, url: publicUrl(cfg, path) }
}
