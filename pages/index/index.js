const api = require('../../services/api')
const { getLocation } = require('../../utils/location')

Page({
  data: {
    summary: {},
    spots: [],
    visibleSpots: [],
    cityOptions: api.cities,
    cityIndex: 0,
    cityId: 'yantai',
    cityName: '烟台',
    locationLabel: '全国沿海 · 正在定位',
    locationStatus: '将按实际距离排序',
    loading: true
  },

  onLoad() {
    const saved = wx.getStorageSync('manual_coastal_city')
    const index = api.cities.findIndex(item => item.id === saved)
    if (index >= 0) {
      const city = api.cities[index]
      this.setData({
        cityIndex: index,
        cityId: city.id,
        cityName: city.name,
        locationLabel: city.name + ' · 手动选择',
        locationStatus: '定位后按实际距离排序'
      })
      getApp().globalData.selectedCityId = city.id
      this.loadData()
      this.requestLocation(true, false, true)
    } else {
      this.loadData()
      this.requestLocation(true)
    }
  },

  onShow() {
    const selected = getApp().globalData.selectedCityId
    if (selected && selected !== this.data.cityId) {
      const index = api.cities.findIndex(item => item.id === selected)
      if (index >= 0) {
        const city = api.cities[index]
        this.setData({
          cityIndex: index,
          cityId: city.id,
          cityName: city.name,
          locationLabel: city.name + (wx.getStorageSync('manual_coastal_city') === city.id ? ' · 手动选择' : ' · 已定位')
        })
        this.loadData()
      }
    }
  },

  onPullDownRefresh() {
    this.requestLocation(true, true, Boolean(wx.getStorageSync('manual_coastal_city')))
  },

  chooseCity(e) {
    const index = Number(e.detail.value)
    const city = api.cities[index]
    if (!city) return
    wx.setStorageSync('manual_coastal_city', city.id)
    getApp().globalData.selectedCityId = city.id
    this.setData({
      cityIndex: index,
      cityId: city.id,
      cityName: city.name,
      locationLabel: city.name + ' · 手动选择',
      locationStatus: getApp().globalData.location ? '按当前位置计算本市距离' : '等待定位后计算距离'
    })
    this.loadData()
  },

  requestLocation(silent, stopRefresh, preserveCity) {
    this.setData({ locationStatus: '正在获取高精度位置…' })
    getLocation((error, location) => {
      if (error) {
        this.setData({ locationStatus: '定位失败，仍可浏览所选城市' })
        this.loadData(null, stopRefresh)
        if (!silent) wx.showToast({ title: '定位失败，请检查微信位置权限', icon: 'none' })
        return
      }
      const city = preserveCity
        ? api.cities.find(item => item.id === this.data.cityId) || api.nearestCity(location)
        : api.nearestCity(location)
      const index = Math.max(0, api.cities.findIndex(item => item.id === city.id))
      getApp().globalData.selectedCityId = city.id
      this.setData({
        cityIndex: index,
        cityId: city.id,
        cityName: city.name,
        locationLabel: city.name + (preserveCity ? ' · 手动选择' : ' · 已定位'),
        locationStatus: '按当前位置排序 · 精度约' + Math.round(location.accuracy || 0) + 'm'
      })
      this.loadData(location, stopRefresh)
      if (!silent) wx.showToast({ title: preserveCity ? '已更新距离' : '已自动识别' + city.name, icon: 'success' })
    })
  },

  loadData(location, stopRefresh) {
    const requestId = this._dataRequestId = (this._dataRequestId || 0) + 1
    this.setData({ loading: true })
    const app = getApp()
    const point = location || app.globalData.location
    api.getHomeData(point, this.data.cityId).then(data => {
      if (requestId !== this._dataRequestId) return
      this.setData({
        summary: data.summary,
        spots: data.spots,
        visibleSpots: data.spots.slice(0, 5),
        loading: false
      })
    }).catch(error => {
      if (requestId !== this._dataRequestId) return
      console.error('home data failed', error)
      this.setData({
        loading: false,
        spots: [],
        visibleSpots: [],
        summary: {
          label: '实时数据待更新',
          bestTime: '时段待更新',
          showSafetyWarning: true,
          warningTitle: '暂无法判断下滩条件',
          warningText: '请下拉刷新，并以现场风浪和管理提示为准。'
        }
      })
      wx.showToast({ title: '实时数据加载失败', icon: 'none' })
    }).finally(() => {
      if (stopRefresh && requestId === this._dataRequestId) wx.stopPullDownRefresh()
    })
  },

  locate() {
    wx.removeStorageSync('manual_coastal_city')
    this.requestLocation(false)
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  goGuide() {
    wx.setStorageSync('guide_prefill', '按当前实时数据筛选' + this.data.cityName + '赶海点。')
    wx.switchTab({ url: '/pages/guide/guide' })
  },

  showMoreSpots() {
    this.setData({ visibleSpots: this.data.spots.slice(0, this.data.visibleSpots.length + 5) })
  },

  showDataInfo() {
    const summary = this.data.summary
    wx.showModal({
      title: '数据来源与更新',
      content: '更新时间：' + (summary.updatedAt || '待更新') + '\n气象与海况模型：Open-Meteo（CC BY 4.0）。潮汐来源见地点详情。\n' + (summary.subtitle || '') + '\n' + this.data.locationLabel + ' · ' + this.data.locationStatus + '\n导航坐标为附近参考点，岸段是否开放以现场管理为准。',
      showCancel: false
    })
  },

  viewSpot(e) {
    wx.navigateTo({ url: `/pages/spot/spot?id=${e.currentTarget.dataset.id}` })
  }
})
