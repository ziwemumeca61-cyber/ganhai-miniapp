const { getSpots, getSpot, getTodaySummary } = require('../utils/data')

// 真实版在这里替换为云函数：天气、潮汐和腾讯位置服务密钥均不放在小程序前端。
function getHomeData() {
  return Promise.resolve({
    source: 'demo',
    summary: getTodaySummary(),
    spots: getSpots()
  })
}

function getSpotDetail(id) {
  return Promise.resolve({ source: 'demo', spot: getSpot(id) })
}

function getForecastCalendar() {
  const days = [
    { date: '今天', weekday: '周一', score: 84, label: '适合', tide: '05:35 / 17:26', best: '04:50—07:10', color: 'good' },
    { date: '08/04', weekday: '周二', score: 91, label: '很适合', tide: '06:12 / 18:04', best: '05:20—07:40', color: 'great' },
    { date: '08/05', weekday: '周三', score: 76, label: '可以去', tide: '06:52 / 18:46', best: '06:00—08:10', color: 'normal' },
    { date: '08/06', weekday: '周四', score: 52, label: '不太推荐', tide: '07:35 / 19:31', best: '—', color: 'low' },
    { date: '08/07', weekday: '周五', score: 67, label: '看风况', tide: '08:20 / 20:15', best: '07:30—09:00', color: 'normal' }
  ]
  return Promise.resolve(days)
}

module.exports = { getHomeData, getSpotDetail, getForecastCalendar }
