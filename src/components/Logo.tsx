/**
 * Oriental Essence 品牌标识。
 *
 * 设计逻辑：
 * - 徽标（LogoMark）= 固定的品牌记号：外细线方框 + 内发丝线方框（装裱感），
 *   框内是几何化的 OE 字母组合 —— O 为细椭圆环，E 为竖杆加三条横臂，两字共用一个视觉重心。
 * - 字标（wordmark）= 全称 "Oriental Essence"，衬线大写、宽字距。
 * - 锁合（LogoLockup）= 徽标 + 竖分隔线 + 双行文字（全称 + 副标语）。移动端自动收起副标语。
 *
 * 全部用 currentColor / 显式色值描边，不依赖字体加载，可用在页头、页脚、后台、favicon。
 */

const STROKE = 1.5
const O_CX = 18.6
const O_CY = 24
const O_RX = 8.4
const O_RY = 12.5
const E_X = 29.8
const E_LEFT = 29.05
const E_RIGHT = 38.2
const E_MID_RIGHT = 36.2
const E_TOP = 12.25
const E_BOTTOM = 35.75

function toneColor(tone: 'gold' | 'ink' | 'paper' | string): string {
  if (tone === 'gold') return 'var(--gold)'
  if (tone === 'ink') return 'var(--ink)'
  if (tone === 'paper') return '#fff'
  return tone
}

export function LogoMark({
  size = 40,
  tone = 'gold',
  framed = true,
}: {
  size?: number
  tone?: 'gold' | 'ink' | 'paper' | string
  /** 关闭双框，只留 OE 记号（用于极小尺寸或深色底） */
  framed?: boolean
}) {
  const color = toneColor(tone)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      {framed && (
        <>
          <rect x="0.9" y="0.9" width="46.2" height="46.2" fill="none" stroke={color} strokeWidth="1.1" />
          <rect x="5" y="5" width="38" height="38" fill="none" stroke={color} strokeWidth="0.5" opacity="0.4" />
        </>
      )}
      {/* O */}
      <ellipse cx={O_CX} cy={O_CY} rx={O_RX} ry={O_RY} fill="none" stroke={color} strokeWidth={STROKE} />
      {/* E */}
      <path
        d={
          `M${E_X} ${E_TOP} V${E_BOTTOM} ` +
          `M${E_LEFT} ${E_TOP} H${E_RIGHT} ` +
          `M${E_LEFT} ${O_CY} H${E_MID_RIGHT} ` +
          `M${E_LEFT} ${E_BOTTOM} H${E_RIGHT}`
        }
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
      />
    </svg>
  )
}

/**
 * 徽标 + 品牌全称 + 副标语的横向锁合。
 * @param name 品牌全称（取站点设置里的 brand）
 * @param sub  副标语（应传入已本地化的文本）
 */
export function LogoLockup({
  name = 'Oriental Essence',
  sub,
  size = 42,
  tone = 'gold',
  textColor,
  subColor,
  compact = false,
  framed = true,
}: {
  name?: string
  sub?: string
  size?: number
  tone?: 'gold' | 'ink' | 'paper' | string
  textColor?: string
  subColor?: string
  /** 隐藏副标语，只留全称 */
  compact?: boolean
  framed?: boolean
}) {
  return (
    <span className="logo-lockup">
      <LogoMark size={size} tone={tone} framed={framed} />
      <span className="logo-words">
        <b style={textColor ? { color: textColor } : undefined}>{name}</b>
        {!compact && sub && <i style={subColor ? { color: subColor } : undefined}>{sub}</i>}
      </span>
    </span>
  )
}

/** 深色底（后台顶栏、登录页）用的反白锁合 */
export function LogoLockupInverse({
  name = 'Oriental Essence',
  sub,
  size = 34,
}: {
  name?: string
  sub?: string
  size?: number
}) {
  return (
    <span className="logo-lockup">
      <LogoMark size={size} tone="paper" />
      <span className="logo-words">
        <b style={{ color: '#fff' }}>{name}</b>
        {sub && <i style={{ color: 'rgba(255,255,255,0.55)' }}>{sub}</i>}
      </span>
    </span>
  )
}
