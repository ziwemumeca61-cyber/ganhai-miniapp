const api = require('../../services/api')
const { exploreSpot, homeMood, dayLabel } = require('../../utils/presentation')
const { getLocation } = require('../../utils/location')

function cardFor(spot) {
  const value = exploreSpot(spot)
  const card = {}
  ;['id', 'name', 'area', 'distanceLabel', 'conditionsBlocked', 'bestWindow', 'bestZoneAvailable', 'bestZone', 'canReport', 'exploreTone', 'exploreLabel', 'coastTone', 'coastLabel'].forEach(key => { card[key] = value[key] })
  return card
}

Page({
  data: {
    summary: {}, spotCount: 0, leadSpot: null, visibleSpots: [],
    cityOptions: api.cities, cityIndex: 0, cityId: 'yantai', cityName: '烟台',
    locationLabel: '正在定位', locationStatus: '将按实际距离排序',
    dayLabel: dayLabel(), mood: homeMood({}, null), leadStatus: '海况待更新',
    leadBlocked: false, loading: false, refreshing: true
  },

  onLoad() {
    this._active = true
    const saved = wx.getStorageSync('manual_coastal_city')
    const last = wx.getStorageSync('last_coastal_city')
    const selected = saved || last || getApp().globalData.selectedCityId
    const index = Math.max(0, api.cities.findIndex(item => item.id === selected))
    const city = api.cities[index]
    getApp().globalData.selectedCityId = city.id
    this.setData({ cityIndex: index, cityId: city.id, cityName: city.name, locationLabel: city.name + (saved ? ' · 手动选择' : ' · 等待定位') })
    // 首屏只读本地地点和有效缓存；云端请求与定位在首帧之后启动。
    this.renderData(api.getHomeSnapshot(getApp().globalData.location, city.id), true)
    const start = () => {
      if (!this._active) return
      this.loadData()
      this.requestLocation(true, false, Boolean(saved))
    }
    if (typeof wx.nextTick === 'function') wx.nextTick(start)
    else this._bootTimer = setTimeout(start, 0)
  },

  onShow() {
    this._active = true
    this.setData({ dayLabel: dayLabel() })
    if (!this._hasShown) { this._hasShown = true; return }
    const selected = getApp().globalData.selectedCityId || this.data.cityId
    const index = api.cities.findIndex(item => item.id === selected)
    if (index >= 0 && selected !== this.data.cityId) {
      const city = api.cities[index]
      this.setData({ cityIndex: index, cityId: city.id, cityName: city.name, locationLabel: city.name })
    }
    this.loadData()
    if (!this._locationStarted) this.requestLocation(true, false, Boolean(wx.getStorageSync('manual_coastal_city')))
  },

  onHide() {
    this._active = false
    this._dataRequestId = (this._dataRequestId || 0) + 1
    this._locationRequestId = (this._locationRequestId || 0) + 1
    clearTimeout(this._expiryTimer)
  },
  onUnload() { this.onHide(); clearTimeout(this._bootTimer) },

  onPullDownRefresh() {
    this.loadData(null, true, { force: true })
    this.requestLocation(true, false, Boolean(wx.getStorageSync('manual_coastal_city')))
  },

  chooseCity(e) {
    const index = Number(e.detail.value), city = api.cities[index]
    if (!city) return
    this._locationRequestId = (this._locationRequestId || 0) + 1
    wx.setStorageSync('manual_coastal_city', city.id)
    getApp().globalData.selectedCityId = city.id
    this.setData({ cityIndex: index, cityId: city.id, cityName: city.name, locationLabel: city.name + ' · 手动选择', locationStatus: '本市地点按当前位置计算距离' })
    this.loadData()
  },

  requestLocation(silent, stopRefresh, preserveCity) {
    this._locationStarted = true
    const id = this._locationRequestId = (this._locationRequestId || 0) + 1
    this.setData({ locationStatus: '正在获取高精度位置…' })
    let lastPoint = ''
    const apply = (location, final) => {
      if (!this._active || id !== this._locationRequestId) return
      const key = [location.latitude, location.longitude, location.accuracy].join(',')
      const city = preserveCity ? api.cities.find(item => item.id === this.data.cityId) : api.nearestCity(location)
      if (!city) return
      getApp().globalData.selectedCityId = city.id
      if (typeof wx.setStorage === 'function') wx.setStorage({ key: 'last_coastal_city', data: city.id, fail() {} })
      this.setData({
        cityIndex: Math.max(0, api.cities.findIndex(item => item.id === city.id)),
        cityId: city.id, cityName: city.name,
        locationLabel: city.name + (preserveCity ? ' · 手动选择' : ' · 已定位'),
        locationStatus: (final ? '已定位' : '正在优化定位') + ' · 精度约' + Math.round(location.accuracy || 0) + 'm'
      })
      if (key !== lastPoint) { lastPoint = key; this.loadData(location, stopRefresh) }
      else if (stopRefresh) wx.stopPullDownRefresh()
      if (final && !silent) wx.showToast({ title: preserveCity ? '已更新距离' : '已自动识别' + city.name, icon: 'success' })
    }
    getLocation((error, location) => {
      if (!this._active || id !== this._locationRequestId) return
      if (error || !location) {
        this.setData({ locationStatus: '定位失败，仍可浏览所选城市' })
        if (stopRefresh) wx.stopPullDownRefresh()
        if (!silent) wx.showToast({ title: '定位失败，请检查微信位置权限', icon: 'none' })
        return
      }
      apply(location, true)
    }, { onProgress: location => apply(location, false) })
  },

  renderData(data, refreshing) {
    const sameCity = this._renderCity === this.data.cityId
    const count = sameCity ? Math.max(5, this.data.visibleSpots.length) : 5
    this._renderCity = this.data.cityId
    this._spotCards = data.spots.map(cardFor)
    const summary = Object.assign({}, data.summary)
    delete summary.conditions
    this.setData({
      summary, mood: homeMood(data.summary, data.spots[0]),
      leadStatus: this._spotCards[0] ? this._spotCards[0].coastLabel : '海况待更新',
      leadBlocked: Boolean(data.spots[0] && data.spots[0].conditionsBlocked),
      spotCount: this._spotCards.length, leadSpot: this._spotCards[0] || null,
      visibleSpots: this._spotCards.slice(0, count), loading: false, refreshing
    })
    clearTimeout(this._expiryTimer)
    if (data.summary.dataReady && data.summary.validUntil > Date.now()) {
      this._expiryTimer = setTimeout(() => {
        if (this._active) this.loadData(null, false, { force: true })
      }, data.summary.validUntil - Date.now() + 20)
    }
  },

  loadData(location, stopRefresh, options) {
    const requestId = this._dataRequestId = (this._dataRequestId || 0) + 1
    const point = location || getApp().globalData.location
    this.renderData(api.getHomeSnapshot(point, this.data.cityId), true)
    const apply = data => {
      if (this._active && requestId === this._dataRequestId) this.renderData(data, false)
    }
    return api.getHomeData(point, this.data.cityId, Object.assign({}, options, { onUpdate: apply })).then(apply).catch(error => {
      if (!this._active || requestId !== this._dataRequestId) return
      const local = api.getHomeSnapshot(point, this.data.cityId)
      local.summary.failureReason = String(error && error.message || '数据刷新失败')
      local.summary.failureHint = '海况更新暂未完成'
      this.renderData(local, false)
    }).finally(() => { if (stopRefresh) wx.stopPullDownRefresh() })
  },

  retryForecast() { this.loadData(null, false, { force: true }) },
  locate() { wx.removeStorageSync('manual_coastal_city'); this.requestLocation(false) },
  goMap() { wx.switchTab({ url: '/pages/map/map' }) },
  goGuide() {
    wx.setStorageSync('guide_prefill', '按当前实时数据筛选' + this.data.cityName + '赶海点。')
    wx.switchTab({ url: '/pages/guide/guide' })
  },
  showMoreSpots() { this.setData({ visibleSpots: this._spotCards.slice(0, this.data.visibleSpots.length + 5) }) },
  showDataInfo() {
    const summary = this.data.summary
    wx.showModal({
      title: '数据来源与更新',
      content: '更新时间：' + (summary.updatedAt || '待更新') + '\n' + (summary.failureReason || summary.subtitle || '') + '\n云端版本：' + (summary.backendVersion || '等待返回') + '\n' + this.data.locationLabel + ' · ' + this.data.locationStatus + '\n气象与海况：Open-Meteo（CC BY 4.0）。潮汐来源见详情；以现场风浪与管理提示为准。',
      showCancel: false
    })
  },
  viewSpot(e) { wx.navigateTo({ url: '/pages/spot/spot?id=' + e.currentTarget.dataset.id }) }
})
