/**
 * 云服务公共配置 —— 唯一允许出现在前端代码里的凭据。
 * endpoint / publishableKey 均取自 workbuddy_cloud_service 返回的 publicConfig。
 * publishableKey 仅标识应用、本身不带权限，服务端按来源域名精确校验。
 *
 * `VITE_API_BASE`：数据接口前缀，构建期注入。
 * · 未设置 → 直连托管域（WorkBuddy 自托管时行为与以前完全一致）。
 * · 设为 `/api`（相对路径）→ 运行时按当前访问域名拼成绝对地址，走同域反向代理
 *   （Cloudflare Pages Functions 转发到数据面），用于站点部署在自有域名（如 ores.cc）时
 *   绕开数据面的跨域白名单限制。SDK 只接受 http(s) 绝对地址，故必须在此转换。
 */
const FALLBACK_ENDPOINT = 'https://oe-brand.app.workbuddy.host'

const RAW_API_BASE = import.meta.env.VITE_API_BASE as string | undefined

function resolveEndpoint(): string {
  if (!RAW_API_BASE) return FALLBACK_ENDPOINT
  try {
    const base = typeof location !== 'undefined' && location.origin ? location.origin : FALLBACK_ENDPOINT
    return new URL(RAW_API_BASE, base).href.replace(/\/+$/, '')
  } catch {
    return FALLBACK_ENDPOINT
  }
}

export const publicConfig = {
  endpoint: resolveEndpoint(),
  publishableKey: 'wbpk_LBkK4tO5FUutWDujrDXhyb_jYM6R3tvM50Zst8HehG43terKRDr3fET',
}

/**
 * 站点规范域 —— canonical / sitemap / og:url 都用它。
 *
 * ⚠️ 必须是**实际托管站点的域名**：canonical 指向别处会与 301 落点互相矛盾，白丢收录信号。
 * 站点迁到自有域名后，构建期注入 `VITE_SITE_ORIGIN=https://ores.cc` 即可切换，
 * 无需改代码；切换后需重跑预渲染与 sitemap 生成。
 */
export const SITE_ORIGIN =
  (import.meta.env.VITE_SITE_ORIGIN as string | undefined) || 'https://oe-brand.app.workbuddy.host'

/** 采购平台顺序与展示名 */
export const PLATFORMS = [
  { key: 'oopbuy', name: 'Oopbuy' },
  { key: 'kakobuy', name: 'Kakobuy' },
  { key: 'uidbuy', name: 'Uidbuy' },
  { key: 'hipobuy', name: 'Hipobuy' },
  { key: 'litbuy', name: 'Litbuy' },
  { key: 'boonbuy', name: 'Boonbuy' },
] as const

/** 三大类 */
export const GROUPS = [
  { key: 'shoes', label: 'Shoes', zh: '鞋履' },
  { key: 'watches', label: 'Watches', zh: '腕表' },
  { key: 'apparel', label: 'Apparel', zh: '服饰' },
] as const

/**
 * 社交渠道 —— 页脚「Contact」与首页「关注我们」共用同一份定义。
 *
 * · `key`   → 对应 `site_settings.contact` 里的字段（URL 存在数据库，后台可改）
 * · `label` → 品牌专有名词，不翻译
 * · `tag`   → **同一平台有多条时必须填**，用来区分（如 Discord 的社区群 / 个人主页）
 * · `color` → 悬停时的品牌色（默认状态下图标是单色，保持站点克制的观感）
 *
 * 顺序即展示顺序；`contact` 里为空的渠道自动跳过。
 */
export const SOCIALS = [
  { key: 'telegram', label: 'Telegram', tag: 'Channel', color: '#229ED9' },
  { key: 'whatsapp', label: 'WhatsApp', tag: '', color: '#25D366' },
  { key: 'discord', label: 'Discord', tag: 'Community', color: '#5865F2' },
  { key: 'discord_profile', label: 'Discord', tag: 'Profile', color: '#5865F2' },
  { key: 'tiktok', label: 'TikTok', tag: '', color: '#010101' },
  { key: 'youtube', label: 'YouTube', tag: '', color: '#FF0033' },
] as const

