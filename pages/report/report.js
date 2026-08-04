const { getSpot } = require('../../utils/data')

Page({
  data: {
    spotName: '烟台沿海',
    species: ['蛤蜊', '海螺', '海蛎子', '螃蟹', '海肠', '其他'],
    selectedSpecies: '蛤蜊',
    amount: '少量',
    amounts: ['少量', '一般', '较多', '满载'],
    note: '',
    imageCount: 0,
    submitted: false
  },

  onLoad(options) {
    if (options.spotId) this.setData({ spotName: getSpot(options.spotId).name })
  },

  chooseSpecies(e) {
    this.setData({ selectedSpecies: e.currentTarget.dataset.value })
  },

  chooseAmount(e) {
    this.setData({ amount: e.currentTarget.dataset.value })
  },

  onNote(e) {
    this.setData({ note: e.detail.value })
  },

  addPhoto() {
    wx.chooseMedia({ count: 3, mediaType: ['image'], sourceType: ['album', 'camera'], success: res => {
      this.setData({ imageCount: res.tempFiles.length })
    } })
  },

  submit() {
    this.setData({ submitted: true })
    wx.showToast({ title: '已记录，感谢反馈', icon: 'success' })
  }
})
