const { getSpots, getTodaySummary } = require('../utils/data')
const { scoreWithConditions, scoreLabel, safetyLevel } = require('../utils/predict')

// 真实版在这里替换为云函数：天气、潮汐和腾讯位置服务密钥均不放在小程序前端。
function callLiveForecast(location) {
  if (!location || typeof getApp !== 'function') return Promise.resolve(null)
  const app = getApp()
  if (!app || !app.globalData || !app.globalData.cloudEnabled || !wx.cloud) return Promise.resolve(null)
  return wx.cloud.callFunction({
    name: 'forecast',
    data: { location: `${location.longitude},${location.latitude}` }
  }).then(response => {
    const result = response && response.result
    return result && result.source && result.source !== 'demo' ? result : null
  }).catch(error => {
    console.warn('live forecast unavailable, use demo rules', error)
    return null
  })
}

function getHomeData(location) {
  const summary = getTodaySummary()
  const demoConditions = summary.conditions
  const demoData = {
    source: 'demo-rule-engine',
    summary: Object.assign({}, summary, {
      score: scoreWithConditions(summary.score, demoConditions),
      label: scoreLabel(scoreWithConditions(summary.score, demoConditions)),
      safetyLevel: safetyLevel(demoConditions),
      updatedAt: new Date().toLocaleString()
    }),
    spots: getSpots(location, demoConditions)
  }
  return callLiveForecast(location).then(live => {
    if (!live) return demoData
    const conditions = Object.assign({}, summary.conditions, live.conditions || {})
    const score = scoreWithConditions(summary.score, conditions)
    const liveSummary = Object.assign({}, summary, live.summary || {}, {
      score,
      label: scoreLabel(score),
      conditions,
      safetyLevel: safetyLevel(conditions),
      updatedAt: new Date().toLocaleString()
    })
    return { source: live.source, summary: liveSummary, spots: getSpots(location, conditions) }
  })
}

function getSpotDetail(id) {
  const summary = getTodaySummary()
  const spot = getSpots(null, summary.conditions).find(item => item.id === id) || getSpots(null, summary.conditions)[0]
  return Promise.resolve({ source: 'demo-rule-engine', spot, summary })
}

function getForecastCalendar() {
  const days = [
    { date: '今天', weekday: '周一', baseScore: 84, tide: '05:35 / 17:26', best: '04:50—07:10', conditions: { windLevel: 2, precipitation: 0, tideRange: 2.8 } },
    { date: '08/04', weekday: '周二', baseScore: 86, tide: '06:12 / 18:04', best: '05:20—07:40', conditions: { windLevel: 1, precipitation: 0, tideRange: 3.1 } },
    { date: '08/05', weekday: '周三', baseScore: 81, tide: '06:52 / 18:46', best: '06:00—08:10', conditions: { windLevel: 3, precipitation: 10, tideRange: 2.6 } },
    { date: '08/06', weekday: '周四', baseScore: 78, tide: '07:35 / 19:31', best: '—', conditions: { windLevel: 5, precipitation: 20, tideRange: 2.1 } },
    { date: '08/07', weekday: '周五', baseScore: 80, tide: '08:20 / 20:15', best: '07:30—09:00', conditions: { windLevel: 3, precipitation: 0, tideRange: 2.8 } }
  ]
  return Promise.resolve(days.map(day => {
    const score = scoreWithConditions(day.baseScore, day.conditions)
    return Object.assign({}, day, { score, label: scoreLabel(score), color: score >= 85 ? 'great' : score < 60 ? 'low' : 'normal' })
  }))
}

module.exports = { getHomeData, getSpotDetail, getForecastCalendar }
