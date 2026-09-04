const { cities, spots, getSpots, getSpot, getTodaySummary } = require('../utils/data')

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

function displayTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toLocaleString() : date.toLocaleString()
}

function homeConclusion(score, ready, blocked) {
  if (!ready) return '实时数据待更新'
  if (blocked || score === null) return '当前不建议下滩'
  if (score >= 85) return '今日赶海条件较好'
  if (score >= 70) return '今日可谨慎赶海'
  return '今日条件一般'
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
      const summary = Object.assign({}, fallback, {
        subtitle,
        updatedAt: live && live.lastValid && live.lastValid.checkedAt ? displayTime(live.lastValid.checkedAt) + '（已过期）' : fallback.updatedAt
      })
      summary.showSafetyWarning = true
      summary.warningTitle = '暂时无法判断是否适合下滩'
      summary.warningText = '请稍后刷新，并以现场风浪、围挡和管理提示为准。'
      return { source: live && live.source || 'waiting-live-data', summary, spots: getSpots(location, summary.conditions, reports, selectedCityId) }
    }
    const conditions = live.conditions
    const rankedSpots = getSpots(location, conditions, reports, selectedCityId)
    const lead = rankedSpots[0]
    const leadScore = lead && lead.safetyScore !== undefined ? lead.safetyScore : null
    const leadReady = Boolean(lead && lead.conditionsReady)
    const leadBlocked = Boolean(lead && lead.conditionsBlocked)
    const lowMatch = String(lead && lead.tide || '').match(/\d{1,2}:\d{2}/)
    const weatherParts = String(lead && lead.weather || '').split(' · ')
    const showSafetyWarning = !leadReady || leadBlocked || leadScore === null || leadScore < 70
    const summary = Object.assign({}, fallback, live.summary || {}, {
      score: leadScore,
      safetyScore: leadScore,
      label: homeConclusion(leadScore, leadReady, leadBlocked),
      safetyLevel: homeConclusion(leadScore, leadReady, leadBlocked),
      referenceSpot: lead ? lead.name : selectedCity.name,
      subtitle: selectedCity.name + '已按' + rankedSpots.length + '个地点所属海域分别评估' + (lead ? ' · 当前优先参考' + lead.name : ''),
      lowTide: lowMatch ? lowMatch[0] : '--:--',
      weather: weatherParts[0] || live.summary && live.summary.weather || '待更新',
      wind: weatherParts[1] || live.summary && live.summary.wind || '待更新',
      bestTime: lead && lead.bestWindow || live.summary && live.summary.bestTime || '暂不可计算',
      safety: lead && lead.safety || live.summary && live.summary.safety || '以现场管理提示为准',
      showSafetyWarning,
      warningTitle: !leadReady ? '首选点数据待更新' : leadBlocked || leadScore === null ? '首选点当前不建议下滩' : '首选点条件一般',
      warningText: leadBlocked && lead.conditionsReasons && lead.conditionsReasons.length ? lead.conditionsReasons.join('、') : '请结合现场风浪、潮水回涨和管理提示决定是否下滩。',
      dataReady: true,
      conditions,
      updatedAt: displayTime(live.checkedAt)
    })
    return { source: live.source, summary, spots: rankedSpots }
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
