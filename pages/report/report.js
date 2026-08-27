const { spots } = require('../../utils/data')
const ai = require('../../services/ai')

const verifiedSpots = spots.filter(item => item.verification === 'POI坐标已核验' || item.verification === '附近导航点已核验')

function relativeTime(value) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return '刚刚'
  const diff = Math.max(0, Date.now() - time)
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + '天前'
  const date = new Date(time)
  return (date.getMonth() + 1) + '月' + date.getDate() + '日'
}

Page({
  data: {
    mode: 'feed',
    feed: [],
    feedLoading: false,
    feedLoaded: false,
    spotId: verifiedSpots[0].id,
    spotName: verifiedSpots[0].name,
    spotOptions: verifiedSpots,
    spotIndex: 0,
    species: ['蛤蜊', '海螺', '海蛎子', '螃蟹', '海肠', '其他'],
    selectedSpecies: '蛤蜊',
    amount: '少量',
    amounts: ['少量', '一般', '较多', '满载'],
    note: '',
    imageCount: 0,
    submitting: false,
    aiGenerating: false,
    onsiteReady: true,
    locationText: '当前版本不获取精确位置'
  },

  onLoad(options) {
    const index = options.spotId ? verifiedSpots.findIndex(item => item.id === options.spotId) : -1
    if (index >= 0) {
      this.setData({
        mode: 'publish',
        spotId: verifiedSpots[index].id,
        spotName: verifiedSpots[index].name,
        spotIndex: index
      })
    }
  },

  onShow() {
    if (this.data.mode === 'feed') this.loadFeed()
  },

  onPullDownRefresh() {
    if (this.data.mode === 'feed') this.loadFeed(true)
    else wx.stopPullDownRefresh()
  },

  loadFeed(silent) {
    if (this.data.feedLoading) return
    const app = getApp()
    if (!app.globalData.cloudEnabled || !wx.cloud) {
      this.setData({ feedLoading: false, feedLoaded: true, feed: [] })
      wx.stopPullDownRefresh()
      if (!silent) wx.showToast({ title: '云环境尚未启用', icon: 'none' })
      return
    }
    this.setData({ feedLoading: true })
    wx.cloud.callFunction({ name: 'report', data: { action: 'feed' } }).then(response => {
      const result = response && response.result
      if (!result || !result.ok) throw new Error(result && result.error || '读取失败')
      const feed = (result.items || []).map(item => Object.assign({}, item, {
        timeLabel: relativeTime(item.createdAt),
        noteDisplay: item.note || '分享了一次现场收获'
      }))
      this.setData({ feed, feedLoading: false, feedLoaded: true })
    }).catch(error => {
      this.setData({ feedLoading: false, feedLoaded: true })
      if (!silent) wx.showToast({ title: error.message || '动态加载失败', icon: 'none' })
    }).finally(() => wx.stopPullDownRefresh())
  },

  openPublish() {
    this.setData({ mode: 'publish' })
  },

  backToFeed() {
    this.setData({ mode: 'feed' })
    this.loadFeed(true)
  },

  chooseSpot(e) {
    const index = Number(e.detail.value)
    const spot = verifiedSpots[index]
    this.setData({ spotId: spot.id, spotName: spot.name, spotIndex: index })
  },

  chooseSpecies(e) { this.setData({ selectedSpecies: e.currentTarget.dataset.value }) },
  chooseAmount(e) { this.setData({ amount: e.currentTarget.dataset.value }) },
  onNote(e) { this.setData({ note: e.detail.value }) },

  verifyLocation() {
    wx.showModal({
      title: '不获取精确位置',
      content: '当前版本未启用微信精准定位接口。你选择的地点会标注为“用户自选地点”，不会计入定位核验样本。',
      showCancel: false
    })
  },

  generateDraft() {
    if (this.data.aiGenerating) return
    this.setData({ aiGenerating: true })
    ai.summarizeReport({ spotName: this.data.spotName, species: this.data.selectedSpecies, amount: this.data.amount, note: this.data.note }).then(result => {
      this.setData({ note: result.answer, aiGenerating: false })
    }).catch(() => this.setData({ aiGenerating: false }))
  },

  addPhoto() {
    wx.chooseMedia({ count: 3, mediaType: ['image'], sourceType: ['album', 'camera'], success: res => this.setData({ imageCount: res.tempFiles.length }) })
  },

  submit() {
    if (this.data.submitting) return
    const app = getApp()
    if (!app.globalData.cloudEnabled || !wx.cloud) {
      wx.showToast({ title: '云环境尚未启用', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.cloud.callFunction({ name: 'report', data: {
      action: 'submit',
      spotId: this.data.spotId,
      species: this.data.selectedSpecies,
      amount: this.data.amount,
      note: this.data.note
    } }).then(response => {
      const result = response && response.result
      if (!result || !result.ok) throw new Error(result && result.error || '保存失败')
      this.setData({
        mode: 'feed',
        submitting: false,
        note: '',
        imageCount: 0,
        onsiteReady: true,
        locationText: '当前版本不获取精确位置'
      })
      wx.showToast({ title: '已发布到赶海圈', icon: 'success' })
      this.loadFeed(true)
    }).catch(error => {
      this.setData({ submitting: false })
      wx.showModal({ title: '暂未保存', content: error.message || '请检查云函数和数据库集合', showCancel: false })
    })
  }
})
