# OE Storefront (oe-store)

Oriental Essence 品牌电商前台。Vite 6 + React 19 + TypeScript。

## 结构

- `src/` 前台与后台源码
- `public/` robots / sitemap（图片资源托管于 R2，不在此仓库）
- `functions/` Cloudflare Pages Functions（数据接口代理）

## 本地开发

```bash
npm install
npm run dev      # 开发
npm run build    # 构建到 dist/
npm start        # 本地静态服务（读 PORT）
```

## 部署

Cloudflare Pages 构建：`npm run build`，输出目录 `dist`。

数据接口经 `/api/*` 由 Pages Functions 代理至上游数据面，避免跨域限制。
