const api = require('../../services/api')

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
    const saved = wx.getStorageSync('selected_coastal_city') || 'yantai'
    const index = Math.max(0, api.cities.findIndex(item => item.id === saved))
    this.applyCity(index)
  },

  onShow() {
    const saved = wx.getStorageSync('selected_coastal_city')
    if (saved && saved !== this.data.cityId) {
      const index = api.cities.findIndex(item => item.id === saved)
      if (index >= 0) this.applyCity(index)
    }
  },

  chooseCity(e) {
    this.applyCity(Number(e.detail.value))
  },

  applyCity(index) {
    const city = api.cities[index]
    if (!city) return
    wx.setStorageSync('selected_coastal_city', city.id)
    getApp().globalData.selectedCityId = city.id
    this.setData({
      cityIndex: index,
      cityId: city.id,
      cityName: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
      scale: city.scale,
      selected: {}
    })
    this.loadMapData(null, city.id)
  },

  loadMapData(location, cityId) {
    api.getHomeData(location, cityId || this.data.cityId).then(data => {
      this.setData({ spots: data.spots, markers: this.buildMarkers(data.spots), selected: data.spots[0] || {} })
    })
  },

  buildMarkers(spots) {
    return spots.map((spot, index) => ({
      id: index + 1,
      latitude: spot.latitude,
      longitude: spot.longitude,
      width: 30,
      height: 30,
      callout: {
        content: `${spot.safetyScore === null ? '待海况' : spot.safetyScore + '安全分'} · ${spot.name}`,
        color: '#15525b',
        fontSize: 11,
        borderRadius: 12,
        bgColor: '#ffffff',
        padding: 8,
        display: 'ALWAYS'
      }
    }))
  },

  locate() {
    wx.showModal({
      title: '精准定位暂未启用',
      content: '现在可手动切换山东沿海城市。定位权限通过后将自动显示附近城市和实际距离。',
      showCancel: false
    })
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
