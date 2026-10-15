/**
 * 首屏数据预取。
 *
 * 为什么要有这一层：预渲染让静态 HTML 秒出，但如果 React 一加载就挂载，
 * 它会立刻清空 #root 并用「Loading…」重渲染，等数据回来才显示内容 ——
 * 用户看到的是「内容 → 空白 3 秒 → 内容」的闪烁，CLS 极差。
 *
 * 改为：先取数据，取到后再挂载 React。这期间页面停留在预渲染的静态 HTML 上，
 * 而里面的卡片是真实 `<a href>`，点击照样能跳转（原生导航），
 * 所以「等」的这段时间用户完全可以正常浏览。
 */
import { fetchCategories, fetchProducts, fetchSettings } from './api'
import type { Category, Product, SiteSettings } from '../types'

export interface BootData {
  categories: Category[]
  products: Product[]
  settings: SiteSettings
}

let cache: BootData | null = null

export async function loadBoot(): Promise<BootData> {
  if (cache) return cache
  const [categories, products, settings] = await Promise.all([
    fetchCategories(),
    fetchProducts(),
    fetchSettings(),
  ])
  cache = { categories, products, settings }
  return cache
}
