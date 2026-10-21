export type GroupKey = 'shoes' | 'watches' | 'apparel'

export interface Category {
  id: number
  group_key: GroupKey
  name_en: string
  name_zh: string | null
  slug: string
  sort_order: number
  is_visible: boolean
}

export interface Product {
  id: number
  category_id: number | null
  name_en: string
  name_zh: string | null
  images: string[]
  links: Record<string, string>
  sort_order: number
  is_visible: boolean
  clicks: number
  /** 展示用的"已售"数量，前台按 `已售 {n}+` 呈现 */
  sold_count: number
}

export interface Contact {
  email: string
  /** Telegram 频道 */
  telegram: string
  whatsapp: string
  /** Discord 社区（服务器邀请） */
  discord: string
  /** Discord 个人主页（discord.com/users/…）—— 与上面并存，展示时用 tag 区分 */
  discord_profile: string
  tiktok: string
  youtube: string
  wechat: string
}

export interface SiteSettings {
  brand: string
  tagline: string
  intro: string
  hero_image: string
  footer_note: string
  contact: Contact
  /** 精选推荐：auto = 每天确定性随机；manual = 后台手工指定（按选择顺序） */
  featured_mode: 'auto' | 'manual'
  /** 精选数量（1–24，默认 12） */
  featured_count: number
  /** 手工精选的商品 id，按展示顺序 */
  featured_ids: number[]
}

export interface PrivateConfig {
  github_token: string
  github_repo: string
  github_branch: string
  cdn_mode: 'jsdelivr' | 'raw'
  /** 上传时压缩：限制最长边并转 webp，降低图片被整张复用的价值 */
  compress_images: boolean
  max_width: number
  /** 上传时叠加品牌水印 */
  watermark: boolean
  watermark_text: string
}

export const DEFAULT_SETTINGS: SiteSettings = {
  brand: 'Oriental Essence',
  tagline: 'Timeless Beauty from the East',
  intro:
    'A curated house of sneakers, timepieces and apparel — selected for craftsmanship, silhouette and quiet luxury. Every piece is sourced and quality-checked before it reaches you.',
  hero_image: '',
  footer_note: 'If you cannot find the product you are looking for, please contact us.',
  contact: {
    email: '',
    telegram: '',
    whatsapp: '',
    discord: '',
    discord_profile: '',
    tiktok: '',
    youtube: '',
    wechat: '',
  },
  featured_mode: 'auto',
  featured_count: 12,
  featured_ids: [],
}

export const DEFAULT_PRIVATE: PrivateConfig = {
  github_token: '',
  github_repo: 'poe112233/oe-gallery',
  github_branch: 'main',
  cdn_mode: 'jsdelivr',
  compress_images: true,
  max_width: 1600,
  watermark: false,
  watermark_text: 'Oriental Essence',
}
