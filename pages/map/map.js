const api = require('../../services/api')
const { getLocation } = require('../../utils/location')

Page({
  data: {
    latitude: 37.5528,
    longitude: 121.1747,
    scale: 10,
    markers: [],
    spots: [],
    selected: {},
    located: false,
    locating: false,
    locationAccuracy: null
  },

  onLoad() {
    this.setData({ locating: true })
    getLocation((err, location) => {
      if (err) {
        this.setData({ locating: false })
        this.loadMapData()
        return
      }
      this.setData({ latitude: location.latitude, longitude: location.longitude, scale: 14, located: true, locating: false, locationAccuracy: Math.round(location.accuracy || 0) })
      this.loadMapData(location)
    })
  },

  loadMapData(location) {
    api.getHomeData(location).then(data => {
      this.setData({ spots: data.spots, markers: this.buildMarkers(data.spots), selected: data.spots[0] })
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
    if (this.data.locating) return
    this.setData({ locating: true })
    getLocation((err, location) => {
      if (err) {
        this.setData({ locating: false })
        wx.showToast({ title: '未授权定位，继续浏览烟台', icon: 'none' })
        return
      }
      this.setData({ latitude: location.latitude, longitude: location.longitude, scale: 14, located: true, locating: false, locationAccuracy: Math.round(location.accuracy || 0) })
      this.loadMapData(location)
      wx.showToast({ title: '定位精度约' + Math.round(location.accuracy || 0) + '米', icon: 'none' })
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
    wx.openLocation({ latitude: spot.latitude, longitude: spot.longitude, name: spot.name, address: `${spot.area} · 推荐区域：${spot.zone.side}` })
  }
})
