// 全局对话框系统：alert / confirm / prompt 的 Promise 化替代方案
// 用法：
//   import { dialog } from '../utils/dialog'
//   await dialog.alert('操作成功')
//   const ok = await dialog.confirm('确定要删除吗？')
//   const val = await dialog.prompt('请输入昵称', '默认值')
import { reactive } from 'vue'

export const dialogState = reactive({
  visible: false,
  type: 'alert', // alert | confirm | prompt
  title: '提示',
  message: '',
  value: '',
  placeholder: '',
  resolve: null,
})

function open({ type, title, message, defaultValue, placeholder }) {
  dialogState.type = type
  dialogState.title = title || (type === 'confirm' ? '请确认' : type === 'prompt' ? '请输入' : '提示')
  dialogState.message = String(message ?? '')
  dialogState.value = defaultValue ?? ''
  dialogState.placeholder = placeholder ?? ''
  dialogState.visible = true
  return new Promise(resolve => { dialogState.resolve = resolve })
}

export const dialog = {
  alert(message, title) {
    return open({ type: 'alert', title, message })
  },
  confirm(message, title) {
    return open({ type: 'confirm', title, message })
  },
  prompt(message, defaultValue, title, placeholder) {
    return open({ type: 'prompt', title, message, defaultValue, placeholder })
  },
  close(result) {
    dialogState.visible = false
    if (dialogState.resolve) {
      const r = dialogState.resolve
      dialogState.resolve = null
      r(result)
    }
  },
}

// 全局替换原生 alert（返回值从未被使用，安全拦截为自定义弹窗）
export function installGlobalDialog() {
  if (window.__dialogInstalled__) return
  window.__dialogInstalled__ = true
  const nativeAlert = window.alert.bind(window)
  window.alert = (message) => {
    if (typeof message === 'object' && message !== null) {
      // axios 错误对象等
      message = message.message || JSON.stringify(message)
    }
    dialog.alert(String(message ?? ''))
  }
  // 保留原生能力引用，供必要处直接调用（如 beforeunload）
  window.__nativeAlert = nativeAlert
}
