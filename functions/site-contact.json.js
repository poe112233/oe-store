/**
 * `GET /site-contact.json` —— 公开的联系渠道（404 页用）。
 *
 * 为什么不直接让浏览器读数据面：`site_settings` 的 REST 读需要前端 SDK 的 apikey，
 * 裸 fetch 会 401。这里由服务端带应用 key 取，浏览器只拿整理好的几个字段。
 */
const REST = 'https://oe-brand.app.workbuddy.host/.cloud/database/rest'
const KEY = 'wbpk_LBkK4tO5FUutWDujrDXhyb_jYM6R3tvM50Zst8HehG43terKRDr3fET'

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300',
}

export async function onRequestHead(context) {
  const res = await onRequestGet(context)
  return new Response(null, { status: res.status, headers: res.headers })
}

export async function onRequestGet() {
  try {
    const res = await fetch(`${REST}/site_settings?select=data&limit=1`, {
      headers: { 'x-wb-webapp-access-key': KEY },
    })
    if (!res.ok) throw new Error(`site_settings ${res.status}`)
    const rows = await res.json()
    const data = (Array.isArray(rows) && rows[0] && rows[0].data) || {}
    const c = data.contact || {}
    return new Response(
      JSON.stringify({
        brand: data.brand || 'Oriental Essence',
        email: c.email || '',
        telegram: c.telegram || '',
        whatsapp: c.whatsapp || '',
        discord: c.discord || c.discord_profile || '',
        tiktok: c.tiktok || '',
        youtube: c.youtube || '',
        instagram: c.instagram || '',
        wechat: c.wechat || '',
      }),
      { headers: HEADERS },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err && err.message) || err) }), {
      status: 502,
      headers: { ...HEADERS, 'cache-control': 'no-store' },
    })
  }
}
