// 国风通用按钮（主按钮 / 次要按钮 / 禁用置灰）
Component({
  properties: {
    // primary / outline / ghost
    type: { type: String, value: 'primary' },
    text: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    size: { type: String, value: 'normal' }, // normal / small / large
  },
  methods: {
    onTap() {
      if (this.properties.disabled || this.properties.loading) return
      this.triggerEvent('tap')
    },
  },
})
