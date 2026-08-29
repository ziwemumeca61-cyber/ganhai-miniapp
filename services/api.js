const { cities, spots, getSpots, getSpot, getTodaySummary } = require('../utils/data')
const { safetyLevel } = require('../utils/predict')

function callCloud(name, data) {
  const app = getApp()
  if (!app || !app.globalData || !app.globalData.cloudEnabled || !wx.cloud) return Promise.resolve(null)
  return wx.cloud.callFunction({ name, data }).then(response => response && response.result || null).catch(error => {
    console.warn(name + ' unavailable', error)
    const message = String(error && (error.errMsg || error.message) || '未知错误')
      .replace(/requestID:[^\s,]+/gi, '')
      .slice(0, 100)
    return {
      source: 'cloud-call-failed',
      reason: name + '调用失败：' + message,
      conditions: { dataReady: false, blocked: false }
    }
  })
}

function callLiveForecast(city) {
  // 用户精确坐标只在设备端用于距离排序；云端只接收公开赶海点和城市中心坐标。
  const citySpots = spots.filter(item => (item.cityId || 'yantai') === city.id)
  return callCloud('forecast', {
    cityId: city.id,
    cityName: city.name,
    location: { latitude: city.latitude, longitude: city.longitude },
    locations: citySpots.map(item => ({ id: item.id, latitude: item.latitude, longitude: item.longitude }))
  })
}

function getReportSummaries() {
  return callCloud('report', { action: 'summary' }).then(result => result && result.ok ? result.summaries || [] : [])
}

function getHomeData(location, cityId) {
  const selectedCityId = cityId || 'yantai'
  const selectedCity = cities.find(item => item.id === selectedCityId) || cities[0]
  const fallback = getTodaySummary()
  const livePromise = callLiveForecast(selectedCity)
  return Promise.all([livePromise, getReportSummaries()]).then(([live, reports]) => {
    if (!live || !live.conditions || !live.conditions.dataReady) {
      const subtitle = !live
        ? '云端海况服务未连接，请检查 forecast 云函数'
        : live.reason || '当天官方海况尚未通过校验'
      const summary = Object.assign({}, fallback, { subtitle })
      return { source: live && live.source || 'waiting-live-data', summary, spots: getSpots(location, summary.conditions, reports, selectedCityId) }
    }
    const conditions = live.conditions
    const summary = Object.assign({}, fallback, live.summary || {}, {
      score: live.summary && live.summary.safetyScore,
      safetyScore: live.summary && live.summary.safetyScore,
      label: safetyLevel(conditions),
      safetyLevel: safetyLevel(conditions),
      subtitle: conditions.blocked ? (conditions.reasons || []).join('、') : (conditions.regionLabel || selectedCity.name + '近岸') + '潮位、浪高与实时天气已通过校验',
      dataReady: true,
      conditions,
      updatedAt: new Date().toLocaleString()
    })
    return { source: live.source, summary, spots: getSpots(location, conditions, reports, selectedCityId) }
  })
}

function getSpotDetail(id) {
  const app = getApp()
  const target = getSpot(id)
  return getHomeData(app && app.globalData && app.globalData.location, target.cityId || 'yantai').then(data => ({
    source: data.source,
    spot: data.spots.find(item => item.id === id) || data.spots[0],
    summary: data.summary
  }))
}

function getForecastCalendar(summary) {
  const date = new Date()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return [{
    date: '今天',
    weekday: weekdays[date.getDay()],
    score: summary && summary.safetyScore,
    label: summary && summary.dataReady ? '安全分' : '待更新',
    tide: summary && summary.lowTide || '--:--',
    best: summary && summary.bestTime || '暂不可计算',
    color: summary && summary.safetyScore >= 85 ? 'great' : summary && summary.safetyScore < 60 ? 'low' : 'normal'
  }]
}

function nearestCity(location) {
  const latitude = Number(location && location.latitude)
  const longitude = Number(location && location.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return cities[0]
  return cities.reduce((best, city) => {
    const lat = latitude - city.latitude
    const lng = (longitude - city.longitude) * Math.cos(latitude * Math.PI / 180)
    const score = lat * lat + lng * lng
    return !best || score < best.score ? { city, score } : best
  }, null).city
}

module.exports = { cities, nearestCity, getHomeData, getSpotDetail, getForecastCalendar }
