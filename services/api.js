const { cities, spots, getSpots, getSpot, getTodaySummary } = require('../utils/data')

const FORECAST_REUSE_MS = 2 * 60 * 1000
const MAX_FORECAST_AGE_MS = 10 * 60 * 1000
const REPORT_REUSE_MS = 60 * 1000
const CLOUD_TIMEOUT_MS = 15000
const forecastCache = new Map()
const forecastRequests = new Map()
const storageReads = new Set()
let reportCache = { time: 0, value: [] }
let reportRequest = null
let reportGeneration = 0

const chinaDay = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10)
function forecastTime(value) {
  const time = Date.parse(value && value.checkedAt)
  const age = Date.now() - time
  return Number.isFinite(time) && age >= -60000 && age < MAX_FORECAST_AGE_MS && chinaDay(time) === chinaDay(Date.now()) ? time : null
}
function usableForecast(value) {
  return Boolean(value && value.conditions && value.conditions.dataReady && forecastTime(value) !== null)
}
function readForecast(cityId) {
  if (!storageReads.has(cityId)) {
    storageReads.add(cityId)
    try {
      const stored = wx.getStorageSync('coastal_forecast_v1_' + cityId)
      if (stored && stored.cityId === cityId && usableForecast(stored.value)) forecastCache.set(cityId, stored.value)
    } catch (error) { console.warn('forecast cache read skipped', error) }
  }
  const value = forecastCache.get(cityId)
  return usableForecast(value) ? value : null
}
function saveForecast(cityId, value) {
  if (!usableForecast(value)) return
  const existing = forecastCache.get(cityId)
  if (existing && Date.parse(existing.checkedAt) > Date.parse(value.checkedAt)) return
  forecastCache.delete(cityId)
  forecastCache.set(cityId, value)
  if (forecastCache.size > 5) forecastCache.delete(forecastCache.keys().next().value)
  if (typeof wx.setStorage === 'function') {
    wx.setStorage({ key: 'coastal_forecast_v1_' + cityId, data: { cityId, value }, fail() {} })
  }
}
function cachedForecast(value, failure) {
  return Object.assign({}, value, { localCached: true, refreshFailure: failure || '' })
}

function callCloud(name, data) {
  const unavailable = reason => ({ source: 'cloud-call-failed', reason, conditions: { dataReady: false, blocked: false } })
  const app = getApp()
  if (!app || !app.globalData || !app.globalData.cloudEnabled || !wx.cloud) return Promise.resolve(unavailable(name + '服务未连接，请检查云开发环境'))
  return new Promise(resolve => {
    let finished = false
    const finish = value => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(unavailable(name + '调用超时（15秒），请检查云函数执行超时与运行日志')), CLOUD_TIMEOUT_MS)
    Promise.resolve().then(() => wx.cloud.callFunction({ name, data })).then(response => {
      finish(response && response.result || unavailable(name + '未返回有效结果'))
    }).catch(error => {
      console.warn(name + ' unavailable', error)
      const message = String(error && (error.errMsg || error.message) || '未知错误').replace(/requestID:[^\s,]+/gi, '').slice(0, 140)
      finish(unavailable(name + '调用失败：' + message))
    })
  })
}

function fetchForecast(city, force) {
  // 用户精确坐标只在设备端用于距离排序；云端只接收公开赶海点和城市中心坐标。
  const citySpots = spots.filter(item => (item.cityId || 'yantai') === city.id)
  return callCloud('forecast', {
    cityId: city.id,
    cityName: city.name,
    forceRefresh: Boolean(force),
    location: { latitude: city.latitude, longitude: city.longitude },
    locations: citySpots.map(item => ({ id: item.id, latitude: item.latitude, longitude: item.longitude }))
  })
}

function callLiveForecast(city, force) {
  const pending = forecastRequests.get(city.id)
  if (pending && Date.now() - pending.time < CLOUD_TIMEOUT_MS) return pending.promise
  const cached = readForecast(city.id)
  if (!force && cached && Date.now() - forecastTime(cached) < FORECAST_REUSE_MS) return Promise.resolve(cachedForecast(cached))
  const entry = { time: Date.now(), promise: null }
  const request = fetchForecast(city, force).then(value => {
    if (usableForecast(value)) {
      saveForecast(city.id, value)
      return value
    }
    const recent = readForecast(city.id)
    return recent ? cachedForecast(recent, value && value.reason) : value
  }).finally(() => {
    if (forecastRequests.get(city.id) === entry) forecastRequests.delete(city.id)
  })
  entry.promise = request
  forecastRequests.set(city.id, entry)
  return request
}

function getReportSummaries(force) {
  if (reportRequest && reportRequest.generation === reportGeneration && Date.now() - reportRequest.time < CLOUD_TIMEOUT_MS) return reportRequest.promise
  if (!force && reportCache.time && Date.now() - reportCache.time < REPORT_REUSE_MS) return Promise.resolve(reportCache.value)
  const entry = { time: Date.now(), generation: reportGeneration, promise: null }
  const request = callCloud('report', { action: 'summary' }).then(result => {
    if (entry.generation === reportGeneration && result && result.ok) reportCache = { time: Date.now(), value: result.summaries || [] }
    return reportCache.value
  }).finally(() => { if (reportRequest === entry) reportRequest = null })
  entry.promise = request
  reportRequest = entry
  return request
}

function invalidateReportCache() { reportCache.time = 0; reportGeneration += 1 }

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

function buildHomeData(location, selectedCityId, live, reports) {
  const selectedCity = cities.find(item => item.id === selectedCityId) || cities[0]
  const fallback = getTodaySummary()
  if (live && live.conditions && live.conditions.dataReady && !usableForecast(live)) {
    live = { source: 'expired-forecast', reason: '海况时间缺失、跨日或超过10分钟，已停止使用旧评分和潮汐', conditions: { dataReady: false, blocked: false } }
  }
  if (!live || !live.conditions || !live.conditions.dataReady) {
    const subtitle = !live
      ? '云端海况服务未连接，请检查 forecast 云函数'
      : live.reason || '当天官方海况尚未通过校验'
    const summary = Object.assign({}, fallback, {
      subtitle,
      updatedAt: live && live.lastValid && live.lastValid.checkedAt ? displayTime(live.lastValid.checkedAt) + '（已过期）' : '暂无有效海况'
    })
    summary.showSafetyWarning = true
    summary.warningTitle = '暂时无法判断是否适合下滩'
    summary.warningText = '海况未就绪前请勿据此下滩；地点和导航仍可查看。'
    summary.failureReason = subtitle
    summary.bestTime = '潮汐暂不可用'
    summary.backendVersion = live && live.version || '未返回版本号'
    summary.failureHint = !live ? '正在连接海况服务' : /超时|timeout/i.test(subtitle) ? '海况服务响应超时' : /调用失败|未连接/.test(subtitle) ? '海况服务连接失败' : '海况数据未通过校验'
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
    dataReady: leadReady,
    validUntil: Date.parse(live.checkedAt) + MAX_FORECAST_AGE_MS,
    cacheNotice: live.localCached || live.cached ? (live.refreshFailure ? '更新暂未成功 · ' : '') + '参考' + Math.max(1, Math.floor((Date.now() - Date.parse(live.checkedAt)) / 60000)) + '分钟前海况' : '',
    failureReason: live.refreshFailure || '',
    backendVersion: live.version || '未返回版本号',
    conditions,
    updatedAt: displayTime(live.checkedAt)
  })
  return { source: live.source, summary, spots: rankedSpots }
}

function getHomeSnapshot(location, cityId) {
  const id = (cities.find(item => item.id === cityId) || cities[0]).id
  const cached = readForecast(id)
  const live = cached ? cachedForecast(cached) : null
  const result = buildHomeData(location, id, live, reportCache.value)
  if (!cached) {
    result.summary.failureReason = ''
    result.summary.bestTime = '潮汐加载中'
    result.summary.failureHint = '海况正在更新，地点可先浏览'
    result.summary.warningText = '实时海况就绪前，暂不能判断是否适合下滩。'
  }
  return result
}

function getHomeData(location, cityId, options) {
  const selectedCity = cities.find(item => item.id === cityId) || cities[0]
  const settings = options || {}
  let liveResult = null
  // 样本查询在旁路更新，不再拖住海况和地点显示。
  getReportSummaries(settings.force).then(reports => {
    if (liveResult && settings.onUpdate) settings.onUpdate(buildHomeData(location, selectedCity.id, liveResult, reports))
  }).catch(error => console.warn('report refresh skipped', error))
  return callLiveForecast(selectedCity, settings.force).then(live => {
    liveResult = live
    return buildHomeData(location, selectedCity.id, live, reportCache.value)
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

module.exports = { cities, nearestCity, getHomeSnapshot, getHomeData, getSpotDetail, getForecastCalendar, invalidateReportCache }
