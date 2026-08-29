const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const HOME = 'https://hyj.yantai.gov.cn/'
const INDEX = 'https://hyj.yantai.gov.cn/col/col1638/index.html'
const LIST_API = 'https://hyj.yantai.gov.cn/api-gateway/jpaas-publish-server/front/page/build/unit?parseType=bulidstatic&webId=52&tplSetId=MsPkwMwlYqOxItyOUpt7Y&pageType=column&tagId=%E5%88%97%E8%A1%A8%E6%96%B0%E9%97%BB&editType=null&pageId=1638'

const get = url => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'GanhaiRadar/1.1' } }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return get(new URL(res.headers.location, url).toString()).then(resolve, reject)
    }
    let body = ''
    res.setEncoding('utf8')
    res.on('data', chunk => { body += chunk })
    res.on('end', () => res.statusCode < 300 ? resolve(body) : reject(new Error('HTTP ' + res.statusCode)))
  }).on('error', reject)
})

const clean = html => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&ndash;|&mdash;/gi, '—')
  .replace(/\s+/g, ' ')

const chinaDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date())

const chinaMinutes = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date()).split(':').map(Number)
  return parts[0] * 60 + parts[1]
}

const tideRow = (text, name) => {
  const token = '(\\d{1,2}:\\d{2}|缺潮)'
  const match = text.match(new RegExp(name + '\\s*' + token + '\\s*' + token + '\\s*' + token + '\\s*' + token))
  return match ? {
    label: name,
    high: [match[1], match[2]].filter(value => value !== '缺潮'),
    low: [match[3], match[4]].filter(value => value !== '缺潮')
  } : null
}

const waveRow = (text, name) => {
  const match = text.match(new RegExp(name + '.*?将有\\s*([0-9.]+)(?:\\s*(?:到|至|-|—)\\s*([0-9.]+))?\\s*米.*?风浪向\\s*([^；;，,\\s]+)'))
  if (!match) return null
  const first = Number(match[1])
  const second = Number(match[2] || match[1])
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null
  return {
    min: Math.min(first, second),
    max: Math.max(first, second),
    direction: match[3]
  }
}

const parseArticle = (html, url) => {
  const text = clean(html)
  const coverage = text.match(/(\d{1,2})月(\d{1,2})日0时\s*[-—至]+\s*(\d{1,2})月(\d{1,2})日0时/)
  if (!coverage) return null
  const year = Number((url.match(/\/art\/(\d{4})\//) || [])[1] || new Date().getUTCFullYear())
  const waves = {
    east: waveRow(text, '东部海域（开发区至牟平区）'),
    pengchang: waveRow(text, '蓬长海域（蓬莱区）'),
    west: waveRow(text, '西部海域（莱州市至龙口市）'),
    south: waveRow(text, '南部海域（海阳市至莱阳市）')
  }
  const tides = {
    zhifu: tideRow(text, '芝罘近岸海域'),
    muping: tideRow(text, '牟平近岸海域'),
    development: tideRow(text, '开发区近岸海域'),
    penglai: tideRow(text, '蓬莱近岸海域'),
    changdaoSouth: tideRow(text, '长岛南部海域'),
    changdaoNorth: tideRow(text, '长岛北部海域'),
    laizhou: tideRow(text, '莱州近岸海域'),
    longkou: tideRow(text, '龙口近岸海域'),
    haiyang: tideRow(text, '海阳近岸海域')
  }
  if (!waves.east || !waves.pengchang || !waves.west || !waves.south || !tides.zhifu) return null
  return {
    date: year + '-' + String(coverage[1]).padStart(2, '0') + '-' + String(coverage[2]).padStart(2, '0'),
    label: coverage[1] + '月' + coverage[2] + '日0时—' + coverage[3] + '月' + coverage[4] + '日0时',
    url,
    waves,
    tides
  }
}

const articleLinks = (html, base) => {
  const links = []
  const pattern = /href=["']([^"']*\/col\/col1638\/art\/\d{4}\/art_[^"']+\.html)[^"']*["']/gi
  for (const match of html.matchAll(pattern)) {
    try { links.push(new URL(match[1], base).toString()) } catch (error) {}
  }
  return links
}

async function official() {
  const links = []
  try {
    const payload = JSON.parse(await get(LIST_API))
    const html = payload && payload.data && payload.data.html || ''
    links.push(...articleLinks(html, HOME))
  } catch (error) {
    console.warn('official list api unavailable', error.message)
  }
  if (!links.length) {
    const pages = await Promise.allSettled([get(HOME), get(INDEX)])
    pages.forEach((result, index) => {
      if (result.status === 'fulfilled') links.push(...articleLinks(result.value, index === 0 ? HOME : INDEX))
    })
  }
  const unique = Array.from(new Set(links))
  for (const url of unique.slice(0, 30)) {
    try {
      const parsed = parseArticle(await get(url), url)
      if (parsed && parsed.date === chinaDate()) return parsed
    } catch (error) {
      console.warn('official article skipped', error.message)
    }
  }
  console.warn('official daily forecast not found', { date: chinaDate(), linkCount: unique.length })
  return null
}

async function weather() {
  const query = 'latitude=37.536&longitude=121.450&timezone=Asia%2FShanghai&forecast_days=1&current=temperature_2m%2Cprecipitation%2Cweather_code%2Cwind_speed_10m%2Cwind_gusts_10m&hourly=visibility'
  const data = JSON.parse(await get('https://api.open-meteo.com/v1/forecast?' + query))
  const current = data.current || {}
  const index = current.time && data.hourly ? data.hourly.time.indexOf(current.time.slice(0, 13) + ':00') : -1
  return {
    temp: Number(current.temperature_2m),
    rain: Number(current.precipitation),
    code: Number(current.weather_code),
    wind: Number(current.wind_speed_10m),
    gust: Number(current.wind_gusts_10m),
    visibility: index >= 0 ? Number(data.hourly.visibility[index]) : null
  }
}

const REGIONS = {
  zhifu: { tide: 'zhifu', wave: 'east', label: '芝罘近岸海域' },
  muping: { tide: 'muping', wave: 'east', label: '牟平近岸海域' },
  development: { tide: 'development', wave: 'east', label: '开发区近岸海域' },
  penglai: { tide: 'penglai', wave: 'pengchang', label: '蓬莱近岸海域' },
  changdaoSouth: { tide: 'changdaoSouth', wave: 'pengchang', label: '长岛南部海域' },
  changdaoNorth: { tide: 'changdaoNorth', wave: 'pengchang', label: '长岛北部海域' },
  laizhou: { tide: 'laizhou', wave: 'west', label: '莱州近岸海域' },
  longkou: { tide: 'longkou', wave: 'west', label: '龙口近岸海域' },
  haiyang: { tide: 'haiyang', wave: 'south', label: '海阳近岸海域' }
}

const regionFor = location => {
  const latitude = Number(location && location.latitude)
  const longitude = Number(location && location.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 36.4 || latitude > 38.5 || longitude < 119.3 || longitude > 122.2) return REGIONS.zhifu
  if (latitude >= 37.88) return REGIONS.changdaoSouth
  if (latitude <= 36.9) return REGIONS.haiyang
  if (longitude <= 120.25) return REGIONS.laizhou
  if (longitude <= 120.58) return REGIONS.longkou
  if (longitude <= 120.95) return REGIONS.penglai
  if (longitude <= 121.32) return REGIONS.development
  if (longitude >= 121.58) return REGIONS.muping
  return REGIONS.zhifu
}

const plan = (row, wave, met) => {
  const now = chinaMinutes()
  const lows = row.low.map(time => {
    const parts = time.split(':').map(Number)
    return { time, minutes: parts[0] * 60 + parts[1] }
  })
  const next = lows.find(item => item.minutes + 30 >= now)
  const seaWeatherScore =
    (wave <= 0.5 ? 18 : wave <= 0.8 ? 16 : wave <= 1 ? 12 : wave < 1.5 ? 6 : 0) +
    (met.wind <= 18 ? 14 : met.wind <= 28 ? 10 : met.wind < 39 ? 5 : 0) +
    (met.rain < 0.5 ? 8 : met.rain < 2 ? 5 : 0)
  if (!next) return { nextLow: null, window: null, tideScore: 0, seaWeatherScore }
  const delta = next.minutes - now
  const tideScore = delta >= -30 && delta <= 120 ? 40 : delta <= 240 ? 30 : delta <= 360 ? 18 : 8
  const format = value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0')
  return {
    nextLow: next.time,
    window: format(Math.max(0, next.minutes - 120)) + '—' + format(Math.min(1439, next.minutes + 30)),
    tideScore,
    seaWeatherScore
  }
}

const evaluateRegion = (region, ocean, met) => {
  const row = ocean.tides[region.tide]
  const wave = ocean.waves[region.wave]
  if (!row || !row.low.length || !wave) return null
  const result = plan(row, wave.max, met)
  const reasons = []
  if (wave.max >= 1.5) reasons.push('浪高达到' + wave.max + '米')
  if (met.wind >= 39 || met.gust >= 50) reasons.push('风力或阵风过大')
  if (met.code >= 95) reasons.push('存在雷暴天气')
  if (met.visibility !== null && met.visibility < 1000) reasons.push('能见度低于1公里')
  return {
    row,
    wave,
    result,
    blocked: reasons.length > 0,
    reasons,
    conditions: {
      dataReady: true,
      blocked: reasons.length > 0,
      reasons,
      regionLabel: region.label,
      nextLow: result.nextLow,
      window: result.window,
      tideScore: result.tideScore,
      seaWeatherScore: result.seaWeatherScore,
      weatherLabel: met.temp + '℃ · 风速' + met.wind + 'km/h',
      waveLabel: '浪高' + wave.min + '—' + wave.max + 'm · ' + wave.direction + '浪'
    }
  }
}

async function yantaiOfficial(event) {
  const checkedAt = new Date().toISOString()
  const location = event && event.location || { latitude: 37.536, longitude: 121.45 }
  try {
    const values = await Promise.all([official(), weather()])
    const ocean = values[0]
    const met = values[1]
    if (!ocean) {
      return {
        source: 'official-unavailable',
        checkedAt,
        reason: '当天官方海洋预报文章未发现或未通过解析',
        conditions: { dataReady: false, blocked: false }
      }
    }
    const region = regionFor(location)
    const evaluated = evaluateRegion(region, ocean, met)
    if (!evaluated) {
      return {
        source: 'official-region-unavailable',
        checkedAt,
        reason: region.label + '数据不完整',
        conditions: { dataReady: false, blocked: false }
      }
    }
    const regionalConditions = {}
    Object.keys(REGIONS).forEach(key => {
      const item = evaluateRegion(REGIONS[key], ocean, met)
      if (item) regionalConditions[key] = item.conditions
    })
    const row = evaluated.row
    const result = evaluated.result
    const blocked = evaluated.blocked
    const reasons = evaluated.reasons
    const conditions = Object.assign({}, evaluated.conditions, { regions: regionalConditions })
    return {
      source: '烟台官方海洋预报 + Open-Meteo烟台代表点天气',
      checkedAt,
      summary: {
        safetyScore: blocked ? null : Math.min(100, result.tideScore + result.seaWeatherScore + 18),
        lowTide: row.low.join(' / '),
        bestTime: result.window || '今日低潮窗口已过',
        weather: met.temp + '℃',
        wind: '风速' + met.wind + 'km/h',
        tideRange: conditions.waveLabel,
        safety: blocked ? reasons.join('、') : '涨潮前至少30分钟开始回撤',
        officialSourceUrl: ocean.url,
        coverageLabel: ocean.label + ' · ' + region.label
      },
      conditions
    }
  } catch (error) {
    console.error('forecast failed', error)
    return {
      source: 'forecast-failed',
      checkedAt,
      reason: error.message,
      conditions: { dataReady: false, blocked: false }
    }
  }
}


const finite = value => Number.isFinite(Number(value))
const localClock = iso => String(iso || '').slice(11, 16)
const localTimestamp = iso => Date.parse(String(iso || '') + '+08:00')
const formatChinaTime = timestamp => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
}).format(new Date(timestamp))

const modelConditions = (metData, marineData, label) => {
  const met = metData && metData.current || {}
  const hourly = marineData && marineData.hourly || {}
  const times = Array.isArray(hourly.time) ? hourly.time : []
  const levels = Array.isArray(hourly.sea_level_height_msl) ? hourly.sea_level_height_msl : []
  const waves = Array.isArray(hourly.wave_height) ? hourly.wave_height : []
  if (!times.length || !levels.length || !waves.length || !finite(met.wind_speed_10m)) return null

  const now = Date.now()
  const candidates = []
  for (let index = 1; index < Math.min(times.length - 1, levels.length - 1); index += 1) {
    const stamp = localTimestamp(times[index])
    const current = Number(levels[index])
    if (!finite(stamp) || !finite(current) || stamp < now - 30 * 60000 || stamp > now + 30 * 3600000) continue
    if (current <= Number(levels[index - 1]) && current <= Number(levels[index + 1])) candidates.push(index)
  }
  let lowIndex = candidates[0]
  if (!Number.isInteger(lowIndex)) {
    let minimum = Infinity
    for (let index = 0; index < Math.min(times.length, levels.length); index += 1) {
      const stamp = localTimestamp(times[index])
      const value = Number(levels[index])
      if (stamp >= now - 30 * 60000 && stamp <= now + 18 * 3600000 && finite(value) && value < minimum) {
        minimum = value
        lowIndex = index
      }
    }
  }
  if (!Number.isInteger(lowIndex)) return null

  const lowStamp = localTimestamp(times[lowIndex])
  const delta = Math.round((lowStamp - now) / 60000)
  const tideScore = delta >= -30 && delta <= 120 ? 40 : delta <= 240 ? 30 : delta <= 360 ? 18 : 8
  const windowStart = lowStamp - 120 * 60000
  const windowEnd = lowStamp + 30 * 60000
  const windowWaves = waves.filter((value, index) => {
    const stamp = localTimestamp(times[index])
    return stamp >= lowStamp - 2 * 3600000 && stamp <= lowStamp + 2 * 3600000 && finite(value)
  }).map(Number)
  const currentWave = finite(marineData.current && marineData.current.wave_height)
    ? Number(marineData.current.wave_height)
    : Number(waves[Math.max(0, lowIndex)])
  const wave = windowWaves.length ? Math.max(...windowWaves) : currentWave
  const wind = Number(met.wind_speed_10m)
  const gust = Number(met.wind_gusts_10m || wind)
  const rain = Number(met.precipitation || 0)
  const code = Number(met.weather_code || 0)
  const visibility = finite(met.visibility) ? Number(met.visibility) : null
  if (![wave, wind, gust, rain].every(finite)) return null

  const seaWeatherScore =
    (wave <= 0.5 ? 18 : wave <= 0.8 ? 16 : wave <= 1 ? 12 : wave < 1.5 ? 6 : 0) +
    (wind <= 18 ? 14 : wind <= 28 ? 10 : wind < 39 ? 5 : 0) +
    (rain < 0.5 ? 8 : rain < 2 ? 5 : 0)
  const reasons = []
  if (wave >= 1.5) reasons.push('浪高达到' + wave.toFixed(1) + '米')
  if (wind >= 39 || gust >= 50) reasons.push('风力或阵风过大')
  if (code >= 95) reasons.push('存在雷暴天气')
  if (visibility !== null && visibility < 1000) reasons.push('能见度低于1公里')

  return {
    dataReady: true,
    blocked: reasons.length > 0,
    reasons,
    regionLabel: label + '近岸模型网格',
    nextLow: localClock(times[lowIndex]),
    window: formatChinaTime(windowStart) + '—' + formatChinaTime(windowEnd),
    tideScore,
    seaWeatherScore,
    weatherLabel: Number(met.temperature_2m).toFixed(1) + '℃ · 风速' + wind.toFixed(1) + 'km/h',
    waveLabel: '浪高约' + wave.toFixed(1) + 'm · 数值模型',
    modelNotice: '潮位约8公里分辨率，仅作赶海时间参考，不用于航海'
  }
}

async function nationwideModel(event) {
  const cityName = String(event && event.cityName || '当前城市').slice(0, 20)
  const center = event && event.location || { latitude: 37.536, longitude: 121.45 }
  const requested = Array.isArray(event && event.locations) ? event.locations.slice(0, 30) : []
  const points = [{ id: '__summary', latitude: Number(center.latitude), longitude: Number(center.longitude) }]
    .concat(requested.map(item => ({ id: String(item.id || '').slice(0, 80), latitude: Number(item.latitude), longitude: Number(item.longitude) })))
    .filter(item => item.id && finite(item.latitude) && finite(item.longitude) && item.latitude >= 3 && item.latitude <= 54 && item.longitude >= 73 && item.longitude <= 136)
  if (!points.length) throw new Error('缺少有效沿海坐标')

  const latitudes = points.map(item => item.latitude.toFixed(6)).join(',')
  const longitudes = points.map(item => item.longitude.toFixed(6)).join(',')
  const weatherQuery = 'latitude=' + latitudes + '&longitude=' + longitudes + '&timezone=Asia%2FShanghai&forecast_days=1&current=temperature_2m%2Cprecipitation%2Cweather_code%2Cwind_speed_10m%2Cwind_gusts_10m%2Cvisibility'
  const marineQuery = 'latitude=' + latitudes + '&longitude=' + longitudes + '&timezone=Asia%2FShanghai&forecast_days=2&cell_selection=sea&current=wave_height%2Csea_level_height_msl&hourly=wave_height%2Csea_level_height_msl'
  const values = await Promise.all([
    get('https://api.open-meteo.com/v1/forecast?' + weatherQuery),
    get('https://marine-api.open-meteo.com/v1/marine?' + marineQuery)
  ])
  const weatherData = JSON.parse(values[0])
  const marineData = JSON.parse(values[1])
  const weatherRows = Array.isArray(weatherData) ? weatherData : [weatherData]
  const marineRows = Array.isArray(marineData) ? marineData : [marineData]
  const conditionsBySpot = {}
  points.forEach((point, index) => {
    const conditions = modelConditions(weatherRows[index], marineRows[index], point.id === '__summary' ? cityName : cityName)
    if (conditions && point.id !== '__summary') conditionsBySpot[point.id] = conditions
  })
  const conditions = modelConditions(weatherRows[0], marineRows[0], cityName)
  if (!conditions) throw new Error('全国海洋模型未返回完整潮位或浪高')
  conditions.spots = conditionsBySpot
  const safetyScore = conditions.blocked ? null : Math.min(100, conditions.tideScore + conditions.seaWeatherScore + 18)
  return {
    source: 'Open-Meteo全球海洋模型 + 全球天气模型',
    checkedAt: new Date().toISOString(),
    summary: {
      safetyScore,
      lowTide: conditions.nextLow || '--:--',
      bestTime: conditions.window || '暂不可计算',
      weather: conditions.weatherLabel.split(' · ')[0],
      wind: conditions.weatherLabel.split(' · ')[1],
      tideRange: conditions.waveLabel,
      safety: conditions.blocked ? conditions.reasons.join('、') : '模型参考；涨潮前至少30分钟开始回撤',
      officialSourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api',
      coverageLabel: cityName + '近岸数值模型 · 约8公里潮位网格'
    },
    conditions
  }
}

exports.main = async event => {
  const cityId = String(event && event.cityId || 'yantai')
  if (cityId === 'yantai') {
    const officialResult = await yantaiOfficial(event)
    if (officialResult && officialResult.conditions && officialResult.conditions.dataReady) return officialResult
    try {
      const fallback = await nationwideModel(event)
      fallback.source = '烟台官方预报不可用，已切换 ' + fallback.source
      fallback.officialFallbackReason = officialResult && officialResult.reason
      return fallback
    } catch (error) {
      return officialResult
    }
  }
  try {
    return await nationwideModel(event)
  } catch (error) {
    console.error('nationwide forecast failed', error)
    return {
      source: 'nationwide-forecast-failed',
      checkedAt: new Date().toISOString(),
      reason: error.message,
      conditions: { dataReady: false, blocked: false }
    }
  }
}
