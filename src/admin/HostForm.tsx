import { t, useLang } from '../i18n'

/**
 * 图床现状说明（只读）。
 *
 * 历史：图片曾托管在 GitHub 仓库 + jsDelivr CDN，后台还带一套「上传令牌 + CDN 方式」。
 * 现状：图片随站点一起走 Cloudflare Pages，放在 `oe-site/public/oe/`，对外就是
 *       `https://ores.cc/oe/<itemId>-<hash>.webp`，同域直出，不经任何第三方 CDN。
 *       新增图片由本地导入脚本写入 public/oe/ 后再随部署上线，后台不再经手上传。
 */
export default function HostForm() {
  useLang()
  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        {t(
          'Images live inside this site: they are stored in oe-site/public/oe/ and published together with the pages on Cloudflare Pages. Visitors load them from https://ores.cc/oe/ — same origin, no third-party CDN.',
        )}
      </p>

      <div className="tbl-wrap" style={{ marginTop: 18 }}>
        <table className="tbl">
          <tbody>
            <tr>
              <td style={{ width: 190 }} className="note">
                {t('Public URL')}
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>https://ores.cc/oe/&lt;itemId&gt;-&lt;hash&gt;.webp</td>
            </tr>
            <tr>
              <td className="note">{t('Storage')}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>oe-site/public/oe/</td>
            </tr>
            <tr>
              <td className="note">{t('Format')}</td>
              <td className="note" style={{ margin: 0 }}>
                {t('WebP, 600px on the longest edge, converted from the Weidian source image')}
              </td>
            </tr>
            <tr>
              <td className="note">{t('Delivery')}</td>
              <td className="note" style={{ margin: 0 }}>
                {t('Cloudflare Pages global edge, same origin as the site')}
              </td>
            </tr>
            <tr>
              <td className="note">{t('How new images arrive')}</td>
              <td className="note" style={{ margin: 0 }}>
                {t('The local import pipeline downloads and converts them, then the site is redeployed')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="note" style={{ marginTop: 18 }}>
        {t(
          'The old GitHub + jsDelivr route is retired: jsDelivr fails for a large share of requests from mainland China, so images are never served from it.',
        )}
      </p>
      <p className="note" style={{ marginTop: 8, fontSize: 11.5 }}>
        {t('Product images are edited on the Products tab — paste the full image URLs, one per line.')}
      </p>
    </>
  )
}
