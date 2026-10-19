const { spots, shoreZones } = require('../../utils/data')
const api = require('../../services/api')
const { getLocation } = require('../../utils/location')

function citySpots(cityId) {
  return spots.filter(item => (item.cityId || 'yantai') === cityId && String(item.harvest || '').indexOf('仅观察') < 0)
}

Page({
  data: {
    mode: 'circle',
    cityOptions: api.cities,
    cityIndex: 0,
    cityId: 'yantai',
    cityName: '烟台',
    circleTopic: '烟台赶海现场',
    officialPublishEnabled: false,
    officialFeedMounted: true,
    spotOptions: citySpots('yantai'),
    spotIndex: 0,
    spotId: '',
    spotName: '',
    zoneOptions: shoreZones,
    zoneId: 'middle',
    species: ['蛤蜊', '海螺', '海蛎子', '螃蟹', '海肠', '其他'],
    selectedSpecies: '蛤蜊',
    found: true,
    amount: '少量',
    amounts: ['少量', '一般', '较多', '满载'],
    submitting: false,
    onsiteReady: false,
    onsiteLocation: null,
    locationText: '现场样本需到场核验'
  },

  onLoad(options) {
    const requested = options.spotId ? spots.find(item => item.id === options.spotId) : null
    const cityId = requested && (requested.cityId || 'yantai') || getApp().globalData.selectedCityId || 'yantai'
    if (requested) getApp().globalData.selectedCityId = cityId
    this.applyCity(cityId, requested)
    if (requested) this.setData({ mode: 'sample' })
    this.updateOfficialPublishAvailability()
  },

  onShow() {
    const cityId = getApp().globalData.selectedCityId || this.data.cityId
    if (cityId !== this.data.cityId) this.applyCity(cityId)
    this.updateOfficialPublishAvailability()
  },

  onUnload() { clearTimeout(this._officialFeedRefreshTimer) },
  onPullDownRefresh() {
    if (this.data.mode === 'circle') this.refreshOfficialFeed()
    else wx.stopPullDownRefresh()
  },

  applyCity(cityId, requested) {
    const cityIndex = Math.max(0, api.cities.findIndex(item => item.id === cityId))
    const city = api.cities[cityIndex]
    const options = citySpots(city.id)
    const requestedIndex = requested ? options.findIndex(item => item.id === requested.id) : -1
    const spotIndex = Math.max(0, requestedIndex)
    const selected = options[spotIndex]
    this.setData({
      cityIndex, cityId: city.id, cityName: city.name, circleTopic: city.name + '赶海现场',
      spotOptions: options, spotIndex, spotId: selected ? selected.id : '',
      spotName: selected ? selected.name : '暂无可贡献样本地点',
      zoneId: 'middle', onsiteReady: false, onsiteLocation: null, locationText: '现场样本需到场核验'
    }, () => this.refreshOfficialFeed())
  },

  updateOfficialPublishAvailability() {
    let platform = ''
    try {
      const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
      platform = String(info && info.platform || '').toLowerCase()
    } catch (error) { console.warn('platform detection unavailable', error) }
    this.setData({ officialPublishEnabled: /android|ios/.test(platform) })
  },

  chooseCity(e) {
    const city = api.cities[Number(e.detail.value)]
    if (!city) return
    getApp().globalData.selectedCityId = city.id
    this.applyCity(city.id)
  },

  openOfficialPublisher() {
    if (!this.data.officialPublishEnabled) {
      wx.showModal({ title: '请用手机微信发布', content: '请使用 Android 或 iPhone 微信查看和发布官方贴图。', showCancel: false })
      return
    }
    if (typeof wx.shareToOfficialAccount !== 'function') {
      wx.showToast({ title: '当前微信版本不支持“发一条”', icon: 'none' })
      return
    }
    wx.shareToOfficialAccount({
      title: this.data.cityName + '赶海现场',
      content: '分享今天的海边见闻和赶海收获\n\n#赶海现场 #' + this.data.cityName + '赶海',
      tags: ['赶海现场', this.data.cityName + '赶海'],
      recommendPath: '/pages/report/report',
      recommendTitle: '查看' + this.data.cityName + '赶海现场',
      success: result => {
        if (result && result.postUrl) this.refreshOfficialFeed()
      },
      fail: error => {
        if (!/cancel|abort|deny/i.test(String(error && error.errMsg || ''))) wx.showToast({ title: '官方发表页打开失败', icon: 'none' })
      }
    })
  },

  refreshOfficialFeed() {
    clearTimeout(this._officialFeedRefreshTimer)
    this.setData({ officialFeedMounted: false }, () => {
      this._officialFeedRefreshTimer = setTimeout(() => {
        this.setData({ officialFeedMounted: true })
        wx.stopPullDownRefresh()
      }, 800)
    })
  },
  onOfficialPublishSuccess() { this.refreshOfficialFeed() },
  onOfficialPublishFail(e) { console.warn('official publish failed', e && e.detail) },
  onOfficialComponentError(e) { console.warn('official component error', e && e.detail) },

  openSample() {
    if (!this.data.spotOptions.length) {
      wx.showToast({ title: '当前城市暂无可贡献样本地点', icon: 'none' })
      return
    }
    this.setData({ mode: 'sample' })
  },
  backToCircle() { this.setData({ mode: 'circle' }, () => this.refreshOfficialFeed()) },
  chooseSpot(e) {
    const spotIndex = Number(e.detail.value)
    const spot = this.data.spotOptions[spotIndex]
    if (spot) this.setData({ spotIndex, spotId: spot.id, spotName: spot.name, zoneId: 'middle', onsiteReady: false, onsiteLocation: null, locationText: '地点已改变，请重新定位' })
  },
  chooseSpecies(e) { this.setData({ selectedSpecies: e.currentTarget.dataset.value }) },
  chooseFound(e) { this.setData({ found: e.currentTarget.dataset.value === 'true' }) },
  chooseAmount(e) { this.setData({ amount: e.currentTarget.dataset.value }) },
  chooseZone(e) { this.setData({ zoneId: e.currentTarget.dataset.value }) },

  verifyLocation() {
    if (this.data.submitting || this._locating) return
    this._locating = true
    this.setData({ locationText: '正在获取位置…' })
    getLocation((error, location) => {
      this._locating = false
      if (error || !location) {
        this.setData({ onsiteReady: false, onsiteLocation: null, locationText: '定位失败，点此重试' })
        return
      }
      this.setData({
        onsiteReady: true,
        onsiteLocation: { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy },
        locationText: '精度约' + Math.round(location.accuracy || 0) + '米 · 提交时核验距离'
      })
    })
  },

  submit() {
    if (this.data.submitting) return
    if (!this.data.spotId) return wx.showToast({ title: '请先选择地点', icon: 'none' })
    if (!this.data.onsiteReady || !this.data.onsiteLocation) return this.verifyLocation()
    if (!getApp().globalData.cloudEnabled || !wx.cloud) return wx.showToast({ title: '云环境尚未启用', icon: 'none' })
    this.setData({ submitting: true })
    wx.cloud.callFunction({ name: 'report', data: {
      action: 'submit', spotId: this.data.spotId, cityId: this.data.cityId,
      species: this.data.selectedSpecies, zoneId: this.data.zoneId, found: this.data.found,
      amount: this.data.amount, location: this.data.onsiteLocation
    } }).then(response => {
      const result = response && response.result
      if (!result || !result.ok) throw new Error(result && result.error || '保存失败')
      this.setData({ mode: 'circle', submitting: false, onsiteReady: false, onsiteLocation: null, locationText: '现场样本需到场核验' })
      api.invalidateReportCache()
      wx.showToast({ title: '匿名样本已贡献', icon: 'success' })
      this.refreshOfficialFeed()
    }).catch(error => {
      this.setData({ submitting: false })
      wx.showModal({ title: '暂未保存', content: error.message || '请稍后重试', showCancel: false })
    })
  }
})
