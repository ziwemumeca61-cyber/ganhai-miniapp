const api = require('../../services/api')

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
    this.loadMapData()
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
    wx.showModal({
      title: '精准定位暂未启用',
      content: '当前按烟台沿海默认范围展示。你仍可拖动地图、选择地点并使用微信导航。',
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
    wx.openLocation({ latitude: spot.latitude, longitude: spot.longitude, name: spot.name, address: `${spot.area} · 推荐区域：${spot.zone.side}` })
  }
})
