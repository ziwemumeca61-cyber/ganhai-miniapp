const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const INDEX = 'https://hyj.yantai.gov.cn/col/col1638/index.html'
const get = url => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'GanhaiRadar/1.0' } }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return get(new URL(res.headers.location, url).toString()).then(resolve, reject)
    let body = ''
    res.setEncoding('utf8')
    res.on('data', chunk => { body += chunk })
    res.on('end', () => res.statusCode < 300 ? resolve(body) : reject(new Error('HTTP ' + res.statusCode)))
  }).on('error', reject)
})
const clean = html => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ')
const chinaDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const chinaMinutes = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number)
  return p[0] * 60 + p[1]
}
const tideRow = (text, name) => {
  const m = text.match(new RegExp(name + '\\s*(\\d{2}:\\d{2}|缺潮)\\s*(\\d{2}:\\d{2}|缺潮)\\s*(\\d{2}:\\d{2}|缺潮)\\s*(\\d{2}:\\d{2}|缺潮)'))
  return m ? { label: name, high: [m[1], m[2]].filter(x => x !== '缺潮'), low: [m[3], m[4]].filter(x => x !== '缺潮') } : null
}
const parseArticle = (html, url) => {
  const text = clean(html)
  const c = text.match(/(\d+)月(\d+)日0时\s*[-—至]+\s*(\d+)月(\d+)日0时/)
  const w = text.match(/东部海域（开发区至牟平区）.*?将有\s*([^；;]+).*?风浪向\s*([^；;，,\s]+)/)
  if (!c || !w) return null
  const nums = Array.from(w[1].matchAll(/([0-9.]+)\s*米/g)).map(x => Number(x[1]))
  const year = Number((url.match(/\/art\/(\d{4})\//) || [])[1] || new Date().getUTCFullYear())
  const tides = { zhifu: tideRow(text, '芝罘近岸海域'), muping: tideRow(text, '牟平近岸海域'), development: tideRow(text, '开发区近岸海域') }
  if (!nums.length || !tides.zhifu || !tides.muping || !tides.development) return null
  return { date: year + '-' + String(c[1]).padStart(2, '0') + '-' + String(c[2]).padStart(2, '0'), label: c[1] + '月' + c[2] + '日0时—' + c[3] + '月' + c[4] + '日0时', url, wave: { min: Math.min(...nums), max: Math.max(...nums), direction: w[2] }, tides }
}
async function official() {
  const index = await get(INDEX)
  const links = Array.from(index.matchAll(/href=["']([^"']*\/col\/col1638\/art\/\d{4}\/art_[^"']+\.html)["']/gi)).map(x => new URL(x[1], INDEX).toString())
  for (const url of Array.from(new Set(links)).slice(0, 10)) {
    try {
      const parsed = parseArticle(await get(url), url)
      if (parsed && parsed.date === chinaDate()) return parsed
    } catch (e) { console.warn('official article skipped', e.message) }
  }
  return null
}
async function weather() {
  const query = 'latitude=37.536&longitude=121.450&timezone=Asia%2FShanghai&forecast_days=1&current=temperature_2m%2Cprecipitation%2Cweather_code%2Cwind_speed_10m%2Cwind_gusts_10m&hourly=visibility'
  const d = JSON.parse(await get('https://api.open-meteo.com/v1/forecast?' + query))
  const c = d.current || {}
  const i = c.time && d.hourly ? d.hourly.time.indexOf(c.time.slice(0, 13) + ':00') : -1
  return { temp: Number(c.temperature_2m), rain: Number(c.precipitation), code: Number(c.weather_code), wind: Number(c.wind_speed_10m), gust: Number(c.wind_gusts_10m), visibility: i >= 0 ? Number(d.hourly.visibility[i]) : null }
}
const zone = location => Number(location.longitude || 121.45) >= 121.58 ? 'muping' : Number(location.longitude || 121.45) <= 121.30 ? 'development' : 'zhifu'
const plan = (row, wave, met) => {
  const now = chinaMinutes()
  const lows = row.low.map(time => { const p = time.split(':').map(Number); return { time, minutes: p[0] * 60 + p[1] } })
  const next = lows.find(x => x.minutes + 30 >= now)
  const sea = (wave <= .5 ? 18 : wave <= .8 ? 16 : wave <= 1 ? 12 : wave < 1.5 ? 6 : 0) + (met.wind <= 18 ? 14 : met.wind <= 28 ? 10 : met.wind < 39 ? 5 : 0) + (met.rain < .5 ? 8 : met.rain < 2 ? 5 : 0)
  if (!next) return { nextLow: null, window: null, tideScore: 0, seaWeatherScore: sea }
  const delta = next.minutes - now
  const tideScore = delta >= -30 && delta <= 120 ? 40 : delta <= 240 ? 30 : delta <= 360 ? 18 : 8
  const f = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')
  return { nextLow: next.time, window: f(Math.max(0, next.minutes - 120)) + '—' + f(Math.min(1439, next.minutes + 30)), tideScore, seaWeatherScore: sea }
}
exports.main = async event => {
  const checkedAt = new Date().toISOString()
  const location = event && event.location || { longitude: 121.45 }
  try {
    const values = await Promise.all([official(), weather()])
    const ocean = values[0]
    const met = values[1]
    if (!ocean) return { source: 'official-unavailable', checkedAt, conditions: { dataReady: false, blocked: false } }
    const row = ocean.tides[zone(location)]
    const p = plan(row, ocean.wave.max, met)
    const reasons = []
    if (ocean.wave.max >= 1.5) reasons.push('浪高达到' + ocean.wave.max + '米')
    if (met.wind >= 39 || met.gust >= 50) reasons.push('风力或阵风过大')
    if (met.code >= 95) reasons.push('存在雷暴天气')
    if (met.visibility !== null && met.visibility < 1000) reasons.push('能见度低于1公里')
    const blocked = reasons.length > 0
    const conditions = { dataReady: true, blocked, reasons, nextLow: p.nextLow, window: p.window, tideScore: p.tideScore, seaWeatherScore: p.seaWeatherScore, weatherLabel: met.temp + '℃ · 风速' + met.wind + 'km/h', waveLabel: '浪高' + ocean.wave.min + '—' + ocean.wave.max + 'm · ' + ocean.wave.direction + '浪' }
    return { source: '烟台官方海洋预报 + Open-Meteo烟台代表点天气', checkedAt, summary: { safetyScore: blocked ? null : Math.min(100, p.tideScore + p.seaWeatherScore + 18), lowTide: row.low.join(' / '), bestTime: p.window || '当前无可计算窗口', weather: met.temp + '℃', wind: '风速' + met.wind + 'km/h', tideRange: conditions.waveLabel, safety: blocked ? reasons.join('、') : '涨潮前至少30分钟开始回撤', officialSourceUrl: ocean.url, coverageLabel: ocean.label }, conditions }
  } catch (error) {
    console.error('forecast failed', error)
    return { source: 'forecast-failed', checkedAt, reason: error.message, conditions: { dataReady: false, blocked: false } }
  }
}
