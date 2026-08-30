const { spots } = require('../../utils/data')
const ai = require('../../services/ai')
const api = require('../../services/api')
const { getLocation } = require('../../utils/location')

function citySpots(cityId) {
  return spots.filter(item => (item.cityId || 'yantai') === cityId)
}

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
    cityOptions: api.cities,
    cityIndex: 0,
    cityId: 'yantai',
    cityName: '烟台',
    spotId: spots[0].id,
    spotName: spots[0].name,
    spotOptions: citySpots('yantai'),
    spotIndex: 0,
    species: ['蛤蜊', '海螺', '海蛎子', '螃蟹', '海肠', '其他'],
    selectedSpecies: '蛤蜊',
    amount: '少量',
    amounts: ['少量', '一般', '较多', '满载'],
    note: '',
    imageCount: 0,
    submitting: false,
    aiGenerating: false,
    onsiteReady: false,
    onsiteLocation: null,
    locationText: '点击获取位置，发布时只核验距离'
  },

  onLoad(options) {
    const app = getApp()
    const requested = options.spotId ? spots.find(item => item.id === options.spotId) : null
    const cityId = requested && (requested.cityId || 'yantai') || app.globalData.selectedCityId || 'yantai'
    const cityIndex = Math.max(0, api.cities.findIndex(item => item.id === cityId))
    const city = api.cities[cityIndex]
    const optionsForCity = citySpots(city.id)
    const index = requested ? optionsForCity.findIndex(item => item.id === requested.id) : 0
    const selected = optionsForCity[Math.max(0, index)]
    this.setData({
      cityId: city.id,
      cityName: city.name,
      cityIndex,
      spotOptions: optionsForCity,
      spotId: selected.id,
      spotName: selected.name,
      spotIndex: Math.max(0, index)
    })
    if (requested && index >= 0) {
      this.setData({
        mode: 'publish',
        spotId: selected.id,
        spotName: selected.name,
        spotIndex: Math.max(0, index)
      })
    }
  },

  onShow() {
    const selectedCityId = getApp().globalData.selectedCityId || this.data.cityId
    if (selectedCityId !== this.data.cityId) {
      const cityIndex = api.cities.findIndex(item => item.id === selectedCityId)
      const city = api.cities[cityIndex]
      const options = city && citySpots(city.id)
      if (city && options.length) {
        this.setData({ cityIndex, cityId: city.id, cityName: city.name, spotOptions: options, spotIndex: 0, spotId: options[0].id, spotName: options[0].name, onsiteReady: false, onsiteLocation: null })
      }
    }
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
    wx.cloud.callFunction({ name: 'report', data: { action: 'feed', cityId: this.data.cityId } }).then(response => {
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
    const spot = this.data.spotOptions[index]
    this.setData({ spotId: spot.id, spotName: spot.name, spotIndex: index, onsiteReady: false, onsiteLocation: null, locationText: '地点已改变，请重新核验位置' })
  },

  chooseCity(e) {
    const cityIndex = Number(e.detail.value)
    const city = api.cities[cityIndex]
    const options = citySpots(city.id)
    const first = options[0]
    if (!first) return
    getApp().globalData.selectedCityId = city.id
    this.setData({
      cityIndex,
      cityId: city.id,
      cityName: city.name,
      spotOptions: options,
      spotIndex: 0,
      spotId: first.id,
      spotName: first.name,
      onsiteReady: false,
      onsiteLocation: null,
      locationText: '点击获取位置，发布时只核验距离'
    })
    if (this.data.mode === 'feed') this.loadFeed(true)
  },

  chooseSpecies(e) { this.setData({ selectedSpecies: e.currentTarget.dataset.value }) },
  chooseAmount(e) { this.setData({ amount: e.currentTarget.dataset.value }) },
  onNote(e) { this.setData({ note: e.detail.value }) },

  verifyLocation() {
    if (this.data.submitting) return
    this.setData({ locationText: '正在获取高精度位置…' })
    getLocation((error, location) => {
      if (error || !location) {
        this.setData({ onsiteReady: false, onsiteLocation: null, locationText: '定位失败，点击重试' })
        wx.showModal({ title: '无法核验位置', content: '请在系统和微信中开启精确位置权限后重试。', showCancel: false })
        return
      }
      this.setData({
        onsiteReady: true,
        onsiteLocation: { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy },
        locationText: '已获取 · 精度约' + Math.round(location.accuracy || 0) + '米，精确坐标不会保存'
      })
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
    if (!this.data.onsiteReady || !this.data.onsiteLocation) {
      wx.showToast({ title: '请先完成现场定位核验', icon: 'none' })
      this.verifyLocation()
      return
    }
    this.setData({ submitting: true })
    wx.cloud.callFunction({ name: 'report', data: {
      action: 'submit',
      spotId: this.data.spotId,
      cityId: this.data.cityId,
      species: this.data.selectedSpecies,
      amount: this.data.amount,
      note: this.data.note,
      location: this.data.onsiteLocation
    } }).then(response => {
      const result = response && response.result
      if (!result || !result.ok) throw new Error(result && result.error || '保存失败')
      this.setData({
        mode: 'feed',
        submitting: false,
        note: '',
        imageCount: 0,
        onsiteReady: false,
        onsiteLocation: null,
        locationText: '点击获取位置，发布时只核验距离'
      })
      wx.showToast({ title: '已发布到赶海圈', icon: 'success' })
      this.loadFeed(true)
    }).catch(error => {
      this.setData({ submitting: false })
      wx.showModal({ title: '暂未保存', content: error.message || '请检查云函数和数据库集合', showCancel: false })
    })
  }
})
