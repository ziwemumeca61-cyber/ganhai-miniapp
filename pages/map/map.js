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
    cityId: 'yantai',
    cityName: '烟台',
    located: false,
    locating: false,
    locationAccuracy: null
  },

  onLoad() {
    this.loadMapData()
    this.locate(true)
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

  locate(silent) {
    if (this.data.locating) return
    this.setData({ locating: true })
    getLocation((error, location) => {
      if (error) {
        this.setData({ locating: false })
        if (!silent) wx.showToast({ title: '定位失败，请检查位置权限', icon: 'none' })
        return
      }
      const city = api.nearestCity(location)
      getApp().globalData.selectedCityId = city.id
      this.setData({
        latitude: location.latitude,
        longitude: location.longitude,
        scale: 10,
        cityId: city.id,
        cityName: city.name,
        located: true,
        locating: false,
        locationAccuracy: Math.round(location.accuracy || 0)
      })
      this.loadMapData(location)
      if (!silent) wx.showToast({ title: '已按实际距离排序', icon: 'success' })
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
