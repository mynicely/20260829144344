// 国风自定义弹窗/确认框：替代小程序原生弹窗（业务逻辑不变，仅 UI 美化）
Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    // 正文支持 \n 换行
    content: { type: String, value: '' },
    showCancel: { type: Boolean, value: true },
    confirmText: { type: String, value: '确认' },
    cancelText: { type: String, value: '取消' },
    // 危险操作（确认按钮空心警示样式）
    danger: { type: Boolean, value: false },
  },
  methods: {
    onConfirm() {
      this.triggerEvent('confirm')
    },
    onCancel() {
      this.triggerEvent('cancel')
    },
    // 阻止冒泡
    noop() {},
  },
})
