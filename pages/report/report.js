const { spots, shoreZones } = require('../../utils/data')
const ai = require('../../services/ai')
const api = require('../../services/api')
const { getLocation } = require('../../utils/location')

function citySpots(cityId) {
  return spots.filter(item => (item.cityId || 'yantai') === cityId && String(item.harvest || '').indexOf('仅观察') < 0)
}

function relativeTime(value) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return '刚刚'
  const diff = Math.max(0, Date.now() - time)
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + '天前'
  const date = new Date(time)
  return (date.getMonth() + 1) + '月' + date.getDate() + '日'
}

Page({
  data: {
    mode: 'feed',
    feed: [],
    feedLoading: false,
    feedLoaded: false,
    cityOptions: api.cities,
    cityIndex: 0,
    cityId: 'yantai',
    cityName: '烟台',
    spotId: spots[0].id,
    spotName: spots[0].name,
    spotOptions: citySpots('yantai'),
    spotIndex: 0,
    species: ['蛤蜊', '海螺', '海蛎子', '螃蟹', '海肠', '其他'],
    selectedSpecies: '蛤蜊',
    found: true,
    amount: '少量',
    amounts: ['少量', '一般', '较多', '满载'],
    zoneOptions: shoreZones,
    zoneId: 'middle',
    photos: [],
    uploadingPhotos: false,
    uploadProgress: '',
    note: '',
    submitting: false,
    aiGenerating: false,
    onsiteReady: false,
    onsiteLocation: null,
    locationText: '可选；不定位或距离较远也可以发布'
  },

  onLoad(options) {
    const app = getApp()
    const requested = options.spotId ? spots.find(item => item.id === options.spotId) : null
    const cityId = requested && (requested.cityId || 'yantai') || app.globalData.selectedCityId || 'yantai'
    const cityIndex = Math.max(0, api.cities.findIndex(item => item.id === cityId))
    const city = api.cities[cityIndex]
    const optionsForCity = citySpots(city.id)
    const index = requested ? optionsForCity.findIndex(item => item.id === requested.id) : 0
    const selected = optionsForCity[Math.max(0, index)]
    this.setData({
      cityId: city.id,
      cityName: city.name,
      cityIndex,
      spotOptions: optionsForCity,
      spotId: selected ? selected.id : '',
      spotName: selected ? selected.name : '当前城市暂无可上报采集点',
      spotIndex: Math.max(0, index)
    })
    if (requested && index >= 0) {
      this.setData({
        mode: 'publish',
        spotId: selected.id,
        spotName: selected.name,
        spotIndex: Math.max(0, index)
      })
    }
  },

  onShow() {
    const selectedCityId = getApp().globalData.selectedCityId || this.data.cityId
    if (selectedCityId !== this.data.cityId) {
      const cityIndex = api.cities.findIndex(item => item.id === selectedCityId)
      const city = api.cities[cityIndex]
      const options = city && citySpots(city.id)
      if (city) {
        this._feedRequestId = (this._feedRequestId || 0) + 1
        this.setData({ cityIndex, cityId: city.id, cityName: city.name, spotOptions: options, spotIndex: 0, spotId: options.length ? options[0].id : '', spotName: options.length ? options[0].name : '当前城市暂无可上报采集点', zoneId: 'middle', onsiteReady: false, onsiteLocation: null, locationText: '可选；不定位或距离较远也可以发布', feedLoading: false, feedLoaded: false, feed: [] })
      }
    }
    if (this.data.mode === 'feed') this.loadFeed()
  },

  onPullDownRefresh() {
    if (this.data.mode === 'feed') this.loadFeed(true)
    else wx.stopPullDownRefresh()
  },

  loadFeed(silent) {
    if (this.data.feedLoading) return
    const requestId = (this._feedRequestId || 0) + 1
    this._feedRequestId = requestId
    const cityId = this.data.cityId
    const app = getApp()
    if (!app.globalData.cloudEnabled || !wx.cloud) {
      this.setData({ feedLoading: false, feedLoaded: true, feed: [] })
      wx.stopPullDownRefresh()
      if (!silent) wx.showToast({ title: '云环境尚未启用', icon: 'none' })
      return
    }
    this.setData({ feedLoading: true })
    wx.cloud.callFunction({ name: 'report', data: { action: 'feed', cityId } }).then(response => {
      if (requestId !== this._feedRequestId || cityId !== this.data.cityId) return
      const result = response && response.result
      if (!result || !result.ok) throw new Error(result && result.error || '读取失败')
      const feed = (result.items || []).map(item => Object.assign({}, item, {
        timeLabel: relativeTime(item.createdAt),
        zoneDisplay: item.zoneId && item.zoneId !== 'unknown' ? item.zoneLabel : '',
        noteDisplay: item.note || (item.found ? '分享了一次现场收获' : '记录了一次未发现样本')
      }))
      return this.hydrateFeedPhotos(feed).then(items => {
        if (requestId !== this._feedRequestId || cityId !== this.data.cityId) return
        this.setData({ feed: items, feedLoading: false, feedLoaded: true })
      })
    }).catch(error => {
      if (requestId !== this._feedRequestId) return
      this.setData({ feedLoading: false, feedLoaded: true })
      if (!silent) wx.showToast({ title: error.message || '动态加载失败', icon: 'none' })
    }).finally(() => {
      if (requestId === this._feedRequestId) wx.stopPullDownRefresh()
    })
  },

  hydrateFeedPhotos(items) {
    const fileIds = []
    items.forEach(item => (item.photoFileIds || []).forEach(fileId => {
      if (fileIds.indexOf(fileId) < 0) fileIds.push(fileId)
    }))
    if (!fileIds.length || !wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve(items)
    const requests = []
    for (let index = 0; index < fileIds.length; index += 50) requests.push(wx.cloud.getTempFileURL({ fileList: fileIds.slice(index, index + 50) }))
    return Promise.all(requests).then(responses => {
      const urls = {}
      responses.forEach(response => (response.fileList || []).forEach(item => { if (item.fileID && item.tempFileURL) urls[item.fileID] = item.tempFileURL }))
      return items.map(item => Object.assign({}, item, { photos: (item.photoFileIds || []).map(fileId => urls[fileId] || fileId) }))
    }).catch(() => items.map(item => Object.assign({}, item, { photos: item.photoFileIds || [] })))
  },

  previewFeedPhoto(e) {
    const index = Number(e.currentTarget.dataset.feedIndex)
    const current = e.currentTarget.dataset.url
    const item = this.data.feed[index]
    if (item && item.photos && current) wx.previewImage({ current, urls: item.photos })
  },

  openPublish() {
    if (!this.data.spotOptions.length) {
      wx.showModal({ title: '当前城市暂不可发布', content: '当前收录地点均为生态观察或禁止采集岸段，因此不开放战果上报。', showCancel: false })
      return
    }
    this.setData({ mode: 'publish' })
  },

  backToFeed() {
    this.setData({ mode: 'feed' })
    this.loadFeed(true)
  },

  chooseSpot(e) {
    const index = Number(e.detail.value)
    const spot = this.data.spotOptions[index]
    if (!spot) return
    this.setData({ spotId: spot.id, spotName: spot.name, spotIndex: index, zoneId: 'middle', onsiteReady: false, onsiteLocation: null, locationText: '地点已改变；定位仍为可选' })
  },

  chooseCity(e) {
    const cityIndex = Number(e.detail.value)
    const city = api.cities[cityIndex]
    const options = citySpots(city.id)
    const first = options[0]
    getApp().globalData.selectedCityId = city.id
    this._feedRequestId = (this._feedRequestId || 0) + 1
    this.setData({
      cityIndex,
      cityId: city.id,
      cityName: city.name,
      spotOptions: options,
      spotIndex: 0,
      spotId: first ? first.id : '',
      spotName: first ? first.name : '当前城市暂无可上报采集点',
      zoneId: 'middle',
      onsiteReady: false,
      onsiteLocation: null,
      locationText: '可选；不定位或距离较远也可以发布',
      feedLoading: false,
      feedLoaded: false,
      feed: []
    }, () => {
      if (this.data.mode === 'feed') this.loadFeed(true)
    })
  },

  chooseSpecies(e) { this.setData({ selectedSpecies: e.currentTarget.dataset.value }) },
  chooseFound(e) { this.setData({ found: e.currentTarget.dataset.value === 'true' }) },
  chooseAmount(e) { this.setData({ amount: e.currentTarget.dataset.value }) },
  chooseZone(e) { this.setData({ zoneId: e.currentTarget.dataset.value }) },
  onNote(e) { this.setData({ note: e.detail.value }) },

  choosePhotos() {
    if (this.data.photos.length >= 3 || this.data.submitting) return
    const remaining = 3 - this.data.photos.length
    const onSuccess = result => {
      const files = result.tempFiles || (result.tempFilePaths || []).map((tempFilePath, index) => ({ tempFilePath, size: result.tempFiles && result.tempFiles[index] && result.tempFiles[index].size }))
      const accepted = files.filter(item => !item.size || item.size <= 10 * 1024 * 1024).slice(0, remaining)
      if (accepted.length < files.length) wx.showToast({ title: '已忽略超过10MB的照片', icon: 'none' })
      this.setData({ photos: this.data.photos.concat(accepted.map(item => ({ tempFilePath: item.tempFilePath, size: item.size || 0 }))) })
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({ count: remaining, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'], success: onSuccess })
    } else {
      wx.chooseImage({ count: remaining, sourceType: ['album', 'camera'], sizeType: ['compressed'], success: onSuccess })
    }
  },

  previewPhoto(e) {
    const current = e.currentTarget.dataset.url
    wx.previewImage({ current, urls: this.data.photos.map(item => item.tempFilePath) })
  },

  removePhoto(e) {
    if (this.data.submitting) return
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ photos: this.data.photos.filter((item, itemIndex) => itemIndex !== index) })
  },

  verifyLocation() {
    if (this.data.submitting) return
    this.setData({ locationText: '正在获取高精度位置…' })
    getLocation((error, location) => {
      if (error || !location) {
        this.setData({ onsiteReady: false, onsiteLocation: null, locationText: '定位失败，点击重试' })
        wx.showModal({ title: '定位未成功', content: '仍可继续发布，动态会标记为“未到场核验”，且不会计入海货预测样本。', showCancel: false })
        return
      }
      this.setData({
        onsiteReady: true,
        onsiteLocation: { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy },
        locationText: '已获取 · 精度约' + Math.round(location.accuracy || 0) + '米，精确坐标不会保存'
      })
    })
  },

  generateDraft() {
    if (this.data.aiGenerating) return
    this.setData({ aiGenerating: true })
    const zone = this.data.zoneOptions.find(item => item.id === this.data.zoneId)
    ai.summarizeReport({ spotName: this.data.spotName, zoneLabel: zone && zone.label, species: this.data.selectedSpecies, amount: this.data.found ? this.data.amount : '未发现', note: this.data.note }).then(result => {
      this.setData({ note: result.answer, aiGenerating: false })
    }).catch(() => this.setData({ aiGenerating: false }))
  },

  uploadPhotos() {
    const photos = this.data.photos || []
    if (!photos.length) return Promise.resolve([])
    let completed = 0
    const uploaded = []
    this.setData({ uploadingPhotos: true, uploadProgress: '上传照片 0/' + photos.length })
    return Promise.all(photos.map((photo, index) => new Promise((resolve, reject) => {
      const match = String(photo.tempFilePath || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
      const rawExtension = match ? match[1].toLowerCase() : 'jpg'
      const extension = ['jpg', 'jpeg', 'png', 'webp', 'heic'].indexOf(rawExtension) >= 0 ? rawExtension : 'jpg'
      const safeCity = String(this.data.cityId || 'unknown').replace(/[^\w-]/g, '')
      const safeSpot = String(this.data.spotId || 'unknown').replace(/[^\w-]/g, '')
      const cloudPath = 'field-reports/' + safeCity + '/' + safeSpot + '/' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 9) + '.' + extension
      wx.cloud.uploadFile({
        cloudPath,
        filePath: photo.tempFilePath,
        success: result => {
          completed += 1
          uploaded.push(result.fileID)
          this.setData({ uploadProgress: '上传照片 ' + completed + '/' + photos.length })
          resolve(result.fileID)
        },
        fail: reject
      })
    }))).catch(error => {
      error.uploadedFileIds = uploaded
      throw error
    })
  },

  cleanupPhotos(fileIds) {
    if (!fileIds || !fileIds.length || !wx.cloud || !wx.cloud.deleteFile) return
    wx.cloud.deleteFile({ fileList: fileIds }).catch(() => {})
  },

  submit() {
    if (this.data.submitting) return
    if (!this.data.spotId) {
      wx.showToast({ title: '当前城市没有可上报采集点', icon: 'none' })
      return
    }
    const app = getApp()
    if (!app.globalData.cloudEnabled || !wx.cloud) {
      wx.showToast({ title: '云环境尚未启用', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    let uploadedFileIds = []
    this.uploadPhotos().then(fileIds => {
      uploadedFileIds = fileIds
      return wx.cloud.callFunction({ name: 'report', data: {
        action: 'submit',
        spotId: this.data.spotId,
        cityId: this.data.cityId,
        species: this.data.selectedSpecies,
        zoneId: this.data.zoneId,
        found: this.data.found,
        amount: this.data.amount,
        note: this.data.note,
        photoFileIds: fileIds,
        location: this.data.onsiteLocation
      } })
    }).then(response => {
      const result = response && response.result
      if (!result || !result.ok) throw new Error(result && result.error || '保存失败')
      this.setData({
        mode: 'feed',
        submitting: false,
        uploadingPhotos: false,
        uploadProgress: '',
        photos: [],
        note: '',
        onsiteReady: false,
        onsiteLocation: null,
        locationText: '可选；不定位或距离较远也可以发布'
      })
      wx.showToast({ title: result.verified ? '已发布并现场核验' : '已作为普通分享发布', icon: 'success' })
      this.loadFeed(true)
    }).catch(error => {
      this.cleanupPhotos(error.uploadedFileIds || uploadedFileIds)
      this.setData({ submitting: false, uploadingPhotos: false, uploadProgress: '' })
      wx.showModal({ title: '暂未保存', content: error.message || '请检查云函数和数据库集合', showCancel: false })
    })
  }
})
