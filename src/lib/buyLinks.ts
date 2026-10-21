/**
 * 购买渠道转链：微店 itemID → 各平台直达链接。
 *
 * 来源：用户 2026-10-03 给出的转链规则（原 wdzl.ores.cc 工具）；
 * boonbuy 于 2026-10-13 按 wdzl.ores.cc 线上源码补齐（`/product/weidian/<itemID>`，无邀请码参数）。
 * 六个平台各有各的 URL 形态，这里集中一处，后台表单与批量回填共用。
 *
 * 注意：品牌对外**不使用"代购"字样**，页面文案一律用"购买"表述，
 * 代码里也统一叫 buy / channel，避免措辞回流到界面上。
 */

/** oopbuy 邀请码（属于用户账号，改这里即可全局生效） */
export const OOPBUY_INVITE = 'TYZZSCDV0'

/** 六大购买渠道，与 config.ts 的 PLATFORMS 一一对应 */
export const BUY_CHANNELS = ['oopbuy', 'kakobuy', 'uidbuy', 'hipobuy', 'litbuy', 'boonbuy'] as const
export type ChannelKey = (typeof BUY_CHANNELS)[number]
/** links 里除六个购买渠道外，还多存一条卖家微店原链接（前台单独展示，不参与渠道统计） */
export type LinkKey = ChannelKey | 'weidian'

/** 从微店商品页 URL 里取出 itemID；也接受纯数字。 */
export function weidianItemId(input: string): string | null {
  const s = (input || '').trim()
  if (!s) return null
  const m =
    s.match(/[?&]item[iI][dD]=(\d+)/) ||
    s.match(/[?&]vItemId=(\d+)/i) ||
    s.match(/item[./]html\?itemID=(\d+)/i) ||
    s.match(/^(\d{6,})$/) ||
    s.match(/\/(\d{8,})(?:[-.]|$)/)
  return m ? m[1] : null
}

/** 从图床文件名（`<itemId>-<md5>.jpg`）里反推 itemID。 */
export function itemIdFromImage(url: string): string | null {
  const m = (url || '').match(/\/(\d{6,})-[0-9a-f]{6,}\.[a-z]+$/i)
  return m ? m[1] : null
}

/** 微店原链接（无 spider_token，公开可访问）。 */
export function weidianUrl(itemId: string): string {
  return `https://weidian.com/item.html?itemID=${itemId}`
}

/** 生成六个渠道的购买链接 + 微店原链接。 */
export function buyLinks(itemId: string, invite = OOPBUY_INVITE): Record<LinkKey, string> {
  const id = String(itemId).trim()
  const encoded = encodeURIComponent(weidianUrl(id))
  return {
    oopbuy: `https://oopbuy.com/product/weidian/${id}?inviteCode=${invite}`,
    kakobuy: `https://kakobuy.com/item/details?url=${encoded}`,
    uidbuy: `https://www.uidbuy.com/product/3/${id}`,
    hipobuy: `https://hipobuy.com/product/weidian/${id}`,
    litbuy: `https://litbuy.com/product/weidian/${id}?linkSearch=true`,
    boonbuy: `https://boonbuy.com/product/weidian/${id}`,
    // 卖家源页：详情页与购买面板里以「原链接」单独展示
    weidian: weidianUrl(id),
  }
}

/** 从任意输入（微店链接 / 纯 itemID / 图床 URL）直接得到六渠道购买链接。 */
export function buyLinksFrom(input: string, invite = OOPBUY_INVITE): Record<LinkKey, string> | null {
  const id = weidianItemId(input) || itemIdFromImage(input)
  return id ? buyLinks(id, invite) : null
}
