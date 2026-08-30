const api = require('../../services/api')

Page({
  data: { spot: null, forecast: [], feedbackSubmitting: false },

  onLoad(options) {
    api.getSpotDetail(options.id).then(data => {
      const spot = data.spot
      const summary = data.summary || {}
      const windowParts = String(spot && spot.bestWindow || summary.bestTime || '').split('—')
      const nextLow = spot && spot.tide && spot.tide.match(/\d{2}:\d{2}/)
      const forecast = []
      if (windowParts[0] && /^\d{2}:\d{2}$/.test(windowParts[0])) forecast.push({ time: windowParts[0], label: '观察开始', type: 'arrive', height: '' })
      if (nextLow) forecast.push({ time: nextLow[0], label: '低潮', type: 'low', height: '' })
      if (windowParts[1] && /^\d{2}:\d{2}$/.test(windowParts[1])) forecast.push({ time: windowParts[1], label: '最晚回撤', type: 'back', height: '' })
      this.setData({ spot, forecast })
    }).catch(() => wx.showToast({ title: '地点数据加载失败', icon: 'none' }))
  },

  onShareAppMessage() {
    return { title: (this.data.spot ? this.data.spot.name : '全国赶海点') + ' · 海况与现场核验', path: '/pages/spot/spot?id=' + (this.data.spot ? this.data.spot.id : 'first-bath') }
  },

  openLocation() {
    const spot = this.data.spot
    if (!spot) return
    wx.openLocation({ latitude: spot.latitude, longitude: spot.longitude, name: spot.name, address: spot.entry + '；以现场开放边界为准' })
  },

  goReport() { wx.navigateTo({ url: '/pages/report/report?spotId=' + this.data.spot.id }) },

  askAI() {
    const spot = this.data.spot
    if (!spot) return
    wx.setStorageSync('ai_prefill', '请分别说明' + spot.name + '的海况安全、收获置信度、公共入口和撤离提示。数据不足时不要推荐。')
    wx.switchTab({ url: '/pages/ai/ai' })
  },

  showDisclaimer() {
    wx.showModal({
      title: '置信度说明',
      content: '少于5条现场样本不判断收获；5—19条只显示低置信趋势；20—49条显示中置信试算；50条以上为高置信。POI核验不等于岸段开放许可。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  showFeedback() {
    if (!this.data.spot || this.data.feedbackSubmitting) return
    const types = ['位置不准', '入口封闭', '禁止采集', '入口建议', '其他']
    wx.showActionSheet({
      itemList: types,
      success: choice => {
        const issueType = types[choice.tapIndex]
        wx.showModal({
          title: issueType,
          content: '',
          editable: true,
          placeholderText: issueType === '入口建议' ? '请描述公开入口或附近标志物' : '请描述现场具体情况',
          confirmText: '提交反馈',
          success: modal => {
            const note = String(modal.content || '').trim()
            if (!modal.confirm) return
            if (!note) {
              wx.showToast({ title: '请填写具体情况', icon: 'none' })
              return
            }
            this.submitFeedback(issueType, note)
          }
        })
      }
    })
  },

  submitFeedback(issueType, note) {
    const app = getApp()
    if (!app.globalData.cloudEnabled || !wx.cloud) {
      wx.showToast({ title: '云环境尚未启用', icon: 'none' })
      return
    }
    this.setData({ feedbackSubmitting: true })
    wx.cloud.callFunction({ name: 'report', data: { action: 'feedback', spotId: this.data.spot.id, issueType, note } }).then(response => {
      const result = response && response.result
      if (!result || !result.ok) throw new Error(result && result.error || '提交失败')
      wx.showToast({ title: '感谢反馈', icon: 'success' })
    }).catch(error => {
      wx.showModal({ title: '暂未提交', content: error.message || '请稍后重试', showCancel: false })
    }).finally(() => this.setData({ feedbackSubmitting: false }))
  }
})
