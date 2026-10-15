import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { syncLangAttr } from './i18n'
import { loadBoot, type BootData } from './lib/boot'
import './styles.css'

syncLangAttr()

const container = document.getElementById('root')!

function mount(boot: BootData | null) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <App boot={boot} />
    </React.StrictMode>,
  )
}

/* 后台不依赖前台数据，直接挂载；前台等数据就绪再接管，
   让预渲染的静态内容一直可见到数据到手，避免中间空白闪烁。 */
if (window.location.pathname.startsWith('/admin')) {
  mount(null)
} else {
  loadBoot()
    .then(mount)
    .catch(() => mount(null))
}
