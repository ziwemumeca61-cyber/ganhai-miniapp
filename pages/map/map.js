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
    located: false
  },

  onLoad() {
    api.getHomeData().then(data => {
      const markers = data.spots.map((spot, index) => ({
        id: index + 1,
        latitude: spot.latitude,
        longitude: spot.longitude,
        width: 30,
        height: 30,
        callout: {
          content: `${spot.score}分 · ${spot.name}`,
          color: '#15525b',
          fontSize: 11,
          borderRadius: 12,
          bgColor: '#ffffff',
          padding: 8,
          display: 'ALWAYS'
        }
      }))
      this.setData({ spots: data.spots, markers, selected: data.spots[0] })
    })
  },

  locate() {
    getLocation((err, location) => {
      if (err) {
        wx.showToast({ title: '未授权定位，继续浏览烟台', icon: 'none' })
        return
      }
      this.setData({ latitude: location.latitude, longitude: location.longitude, scale: 12, located: true })
      wx.showToast({ title: '已定位到你附近', icon: 'success' })
    })
  },

  markerTap(e) {
    const spot = this.data.spots[e.markerId - 1]
    if (spot) this.setData({ selected: spot })
  },

  selectSpot(e) {
    const spot = this.data.spots.find(item => item.id === e.currentTarget.dataset.id)
    this.setData({ selected: spot, latitude: spot.latitude, longitude: spot.longitude, scale: 13 })
  },

  goDetail() {
    if (!this.data.selected) return
    wx.navigateTo({ url: `/pages/spot/spot?id=${this.data.selected.id}` })
  },

  navigateToSpot() {
    const spot = this.data.selected
    if (!spot) return
    wx.openLocation({ latitude: spot.latitude, longitude: spot.longitude, name: spot.name, address: `${spot.area} · 推荐区域：${spot.zone.side}` })
  }
})
