import { useRoute } from './lib/router'
import type { BootData } from './lib/boot'
import SiteApp from './site/SiteApp'
import AdminApp from './admin/AdminApp'

export default function App({ boot }: { boot: BootData | null }) {
  const route = useRoute()
  if (route.name === 'admin') return <AdminApp />
  return <SiteApp route={route} boot={boot} />
}
