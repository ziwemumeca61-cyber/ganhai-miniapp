const { getSpots, getTodaySummary } = require('../utils/data')
const { safetyLevel } = require('../utils/predict')

function callCloud(name, data) {
  const app = getApp()
  if (!app || !app.globalData || !app.globalData.cloudEnabled || !wx.cloud) return Promise.resolve(null)
  return wx.cloud.callFunction({ name, data }).then(response => response && response.result || null).catch(error => {
    console.warn(name + ' unavailable', error)
    return null
  })
}

function callLiveForecast(location) {
  if (!location) return Promise.resolve(null)
  return callCloud('forecast', { location: { latitude: location.latitude, longitude: location.longitude } })
}

function getReportSummaries() {
  return callCloud('report', { action: 'summary' }).then(result => result && result.ok ? result.summaries || [] : [])
}

function getHomeData(location) {
  const fallback = getTodaySummary()
  return Promise.all([callLiveForecast(location), getReportSummaries()]).then(([live, reports]) => {
    if (!live || !live.conditions || !live.conditions.dataReady) {
      return { source: live && live.source || 'waiting-live-data', summary: fallback, spots: getSpots(location, fallback.conditions, reports) }
    }
    const conditions = live.conditions
    const summary = Object.assign({}, fallback, live.summary || {}, {
      score: live.summary && live.summary.safetyScore,
      safetyScore: live.summary && live.summary.safetyScore,
      label: safetyLevel(conditions),
      safetyLevel: safetyLevel(conditions),
      subtitle: conditions.blocked ? (conditions.reasons || []).join('、') : '官方潮汐与实时天气已通过时效校验',
      dataReady: true,
      conditions,
      updatedAt: new Date().toLocaleString()
    })
    return { source: live.source, summary, spots: getSpots(location, conditions, reports) }
  })
}

function getSpotDetail(id) {
  const app = getApp()
  return getHomeData(app && app.globalData && app.globalData.location).then(data => ({
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

module.exports = { getHomeData, getSpotDetail, getForecastCalendar }
