const ai = require('../../services/ai')

Page({
  data: {
    cityName: '当前城市',
    inputValue: '',
    scrollId: '',
    messages: [
      { id: 'welcome', role: 'assistant', content: '我是你的全国赶海向导。告诉我想去的时间、距离、海货或同行人群，我会结合当前城市的潮汐和天气给你建议。' }
    ],
    suggestions: ['今天哪里适合带孩子？', '想找蛤蜊多的地方', '现在还能下海吗？', '帮我安排今天行程'],
    sending: false
  },

  onShow() {
    const app = getApp()
    const cityId = app.globalData.selectedCityId || wx.getStorageSync('manual_coastal_city') || 'yantai'
    const api = require('../../services/api')
    const city = api.cities.find(item => item.id === cityId) || api.cities[0]
    this.setData({ cityName: city.name })
    const prefill = wx.getStorageSync('ai_prefill')
    if (prefill) {
      wx.removeStorageSync('ai_prefill')
      this.setData({ inputValue: prefill })
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value })
  },

  chooseSuggestion(e) {
    this.sendQuestion(e.currentTarget.dataset.text)
  },

  submit() {
    this.sendQuestion((this.data.inputValue || '').trim())
  },

  sendQuestion(question) {
    if (!question || this.data.sending) return
    const userMessage = { id: `u-${Date.now()}`, role: 'user', content: question }
    const messages = this.data.messages.concat(userMessage)
    this.setData({ messages, inputValue: '', sending: true, scrollId: userMessage.id })
    const app = getApp()
    const cityId = app.globalData.selectedCityId || 'yantai'
    ai.ask(question, { city: this.data.cityName, cityId }).then(result => {
      const assistantMessage = { id: `a-${Date.now()}`, role: 'assistant', content: result.answer, source: result.source }
      this.setData({ messages: this.data.messages.concat(assistantMessage), sending: false, scrollId: assistantMessage.id })
    }).catch(() => {
      this.setData({ messages: this.data.messages.concat({ id: `a-${Date.now()}`, role: 'assistant', content: '暂时没连上数据服务，请稍后再试。' }), sending: false })
    })
  },

  clearChat() {
    this.setData({ messages: [{ id: 'welcome', role: 'assistant', content: '重新开始。你想什么时候去、想找什么海货？' }] })
  }
})
