const api = require('../../services/api')
const { getLocation } = require('../../utils/location')

Page({
  data: {
    latitude: 37.536,
    longitude: 121.45,
    scale: 8,
    markers: [],
    spots: [],
    selected: {},
    cityOptions: api.cities,
    cityIndex: 0,
    cityId: 'yantai',
    cityName: '烟台',
    located: false,
    locating: false,
    locationAccuracy: null
  },

  onLoad() {
    const selected = wx.getStorageSync('manual_coastal_city') || getApp().globalData.selectedCityId || 'yantai'
    const index = Math.max(0, api.cities.findIndex(item => item.id === selected))
    const city = api.cities[index]
    this.setData({ cityIndex: index, cityId: city.id, cityName: city.name })
    this.loadMapData()
    this.locate(true, Boolean(wx.getStorageSync('manual_coastal_city')))
  },

  onShow() {
    const selected = wx.getStorageSync('manual_coastal_city') || getApp().globalData.selectedCityId
    if (selected && selected !== this.data.cityId) {
      const index = api.cities.findIndex(item => item.id === selected)
      if (index >= 0) this.applyCity(index, false)
    }
  },

  chooseCity(e) {
    this.applyCity(Number(e.detail.value), true)
  },

  applyCity(index, manual) {
    const city = api.cities[index]
    if (!city) return
    if (manual) wx.setStorageSync('manual_coastal_city', city.id)
    getApp().globalData.selectedCityId = city.id
    this.setData({
      cityIndex: index,
      cityId: city.id,
      cityName: city.name,
      latitude: this.data.located ? this.data.latitude : city.latitude,
      longitude: this.data.located ? this.data.longitude : city.longitude,
      scale: this.data.located ? this.data.scale : city.scale,
      selected: {}
    })
    this.loadMapData()
  },

  loadMapData(location) {
    const app = getApp()
    const point = location || app.globalData.location
    api.getHomeData(point, this.data.cityId).then(data => {
      this.setData({ spots: data.spots, markers: this.buildMarkers(data.spots), selected: data.spots[0] || {} })
    })
  },

  buildMarkers(spots) {
    return spots.map((spot, index) => ({
      id: index + 1,
      latitude: spot.latitude,
      longitude: spot.longitude,
      width: 26,
      height: 26,
      callout: {
        content: `${spot.safetyScore === null ? '待海况' : spot.safetyScore + '安全分'} · ${spot.name}`,
        color: '#15525b',
        fontSize: 11,
        borderRadius: 12,
        bgColor: '#ffffff',
        padding: 8,
        display: 'BYCLICK'
      }
    }))
  },

  locate(silent, preserveCity) {
    if (this.data.locating) return
    this.setData({ locating: true })
    getLocation((error, location) => {
      if (error) {
        this.setData({ locating: false })
        if (!silent) wx.showToast({ title: '定位失败，请检查位置权限', icon: 'none' })
        return
      }
      const city = preserveCity
        ? api.cities.find(item => item.id === this.data.cityId) || api.nearestCity(location)
        : api.nearestCity(location)
      const index = Math.max(0, api.cities.findIndex(item => item.id === city.id))
      getApp().globalData.selectedCityId = city.id
      this.setData({
        latitude: location.latitude,
        longitude: location.longitude,
        scale: 10,
        cityIndex: index,
        cityId: city.id,
        cityName: city.name,
        located: true,
        locating: false,
        locationAccuracy: Math.round(location.accuracy || 0)
      })
      this.loadMapData(location)
      if (!silent) wx.showToast({ title: preserveCity ? '已更新距离' : '已自动识别' + city.name, icon: 'success' })
    })
  },

  refreshLocation() {
    wx.removeStorageSync('manual_coastal_city')
    this.locate(false, false)
  },

  markerTap(e) {
    const spot = this.data.spots[e.markerId - 1]
    if (spot) this.setData({ selected: spot })
  },

  selectSpot(e) {
    const spot = this.data.spots.find(item => item.id === e.currentTarget.dataset.id)
    if (!spot) return
    this.setData({ selected: spot, latitude: spot.latitude, longitude: spot.longitude, scale: 13 })
  },

  goDetail() {
    if (!this.data.selected || !this.data.selected.id) return
    wx.navigateTo({ url: `/pages/spot/spot?id=${this.data.selected.id}` })
  },

  navigateToSpot() {
    const spot = this.data.selected
    if (!spot || !spot.id) return
    wx.openLocation({ latitude: spot.latitude, longitude: spot.longitude, name: spot.name, address: `${spot.cityName} · ${spot.area} · ${spot.zone.side}` })
  }
})
