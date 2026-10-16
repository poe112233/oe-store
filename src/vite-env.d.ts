/// <reference types="vite/client" />

/**
 * 构建期注入的环境变量。来源说明见 `src/config.ts`；
 * 未设置时回落到 WorkBuddy 托管域，行为与迁移前完全一致。
 */
interface ImportMetaEnv {
  /** 数据接口前缀。设为 `/api` 时走同域反向代理（Cloudflare Pages Functions）。 */
  readonly VITE_API_BASE?: string
  /** 站点规范域，用于 canonical / sitemap / og:url，例如 `https://ores.cc`。 */
  readonly VITE_SITE_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
