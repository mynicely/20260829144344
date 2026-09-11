// 国风空状态组件：简约插画 + 说明文字，不只纯文字
Component({
  properties: {
    // 场景：none(默认)/order/friend/income/homework/post/comment
    type: { type: String, value: 'none' },
    tip: { type: String, value: '暂无内容' },
  },
  data: {
    art: '',
  },
  observers: {
    type: function () {
      const map = {
        none: '暂无内容',
        order: '暂无订单',
        friend: '暂无好友',
        income: '暂无收益',
        homework: '暂无作业',
        post: '暂无动态',
        comment: '暂无评论',
      }
      this.setData({ art: map[this.properties.type] || map.none })
    },
  },
})
