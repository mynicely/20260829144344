// 全局轻提示（Toast）：替代 alert 的优雅提示，支持 success / error / warn / info
let host = null
function ensureHost() {
  if (!host) {
    host = document.createElement('div')
    host.className = 'toast-host'
    document.body.appendChild(host)
  }
  return host
}

const ICONS = { success: '✓', error: '✕', warn: '!', info: 'ℹ' }

export function toast(msg, type = 'success', duration = 2200) {
  const el = document.createElement('div')
  el.className = 'toast-item ' + type
  el.innerHTML = `<span style="flex-shrink:0;font-weight:800;">${ICONS[type] || ''}</span><span>${String(msg).replace(/</g, '&lt;')}</span>`
  ensureHost().appendChild(el)
  setTimeout(() => {
    el.classList.add('leave')
    setTimeout(() => el.remove(), 260)
  }, duration)
  return el
}

export const Toast = {
  success: (m) => toast(m, 'success'),
  error: (m) => toast(m, 'error', 3000),
  warn: (m) => toast(m, 'warn', 2800),
  info: (m) => toast(m, 'info'),
}
export default toast
