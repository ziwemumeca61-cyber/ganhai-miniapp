const api = require('../../services/api')
const { getLocation } = require('../../utils/location')

Page({
  data: {
    summary: {},
    spots: [],
    calendar: [],
    cityOptions: api.cities,
    cityIndex: 0,
    cityId: 'yantai',
    cityName: '烟台',
    locationLabel: '山东沿海 · 正在定位',
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
    this.setData({ loading: true })
    const app = getApp()
    const point = location || app.globalData.location
    api.getHomeData(point, this.data.cityId).then(data => {
      this.setData({
        summary: data.summary,
        spots: data.spots,
        calendar: api.getForecastCalendar(data.summary),
        loading: false
      })
    }).catch(error => {
      console.error('home data failed', error)
      this.setData({ loading: false })
      wx.showToast({ title: '实时数据加载失败', icon: 'none' })
    }).finally(() => {
      if (stopRefresh) wx.stopPullDownRefresh()
    })
  },

  locate() {
    wx.removeStorageSync('manual_coastal_city')
    this.requestLocation(false)
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  goAi() {
    wx.setStorageSync('ai_prefill', '请根据今天的天气、潮汐、当前位置距离和地点信息，帮我安排一条' + this.data.cityName + '赶海路线。数据未接入时请明确说明。')
    wx.switchTab({ url: '/pages/ai/ai' })
  },

  viewSpot(e) {
    wx.navigateTo({ url: `/pages/spot/spot?id=${e.currentTarget.dataset.id}` })
  }
})
