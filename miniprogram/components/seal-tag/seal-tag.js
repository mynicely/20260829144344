// 印章风格状态标签组件
Component({
  properties: {
    // 状态 key（qualified/probation/invalid/frozen/void/pending/approved/opening/active/success/expired 等）
    status: { type: String, value: '' },
    // 自定义文案（优先级高于 status 映射）
    text: { type: String, value: '' },
    // 自定义样式类（seal-qualified 等）
    cls: { type: String, value: '' },
  },
  data: {
    showText: '',
    showCls: 'seal-default',
  },
  observers: {
    'status, text, cls': function () {
      const { SEAL_STATUS } = require('../../utils/constants')
      const map = SEAL_STATUS[this.properties.status] || {}
      this.setData({
        showText: this.properties.text || map.text || this.properties.status || '',
        showCls: this.properties.cls || map.cls || 'seal-default',
      })
    },
  },
})
