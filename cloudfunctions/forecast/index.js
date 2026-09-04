const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const HOME = 'https://hyj.yantai.gov.cn/'
const INDEX = 'https://hyj.yantai.gov.cn/col/col1638/index.html'
const MODEL_CACHE_TTL = 10 * 60 * 1000
const PERSISTENT_CACHE_FRESH_MS = 10 * 60 * 1000
const PERSISTENT_CACHE_COLLECTION = 'forecast_cache'
const modelCache = new Map()

const cacheDocumentId = cityId => 'city-' + String(cityId || 'yantai').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50)

async function savePersistentCache(cityId, value) {
  try {
    await db.collection(PERSISTENT_CACHE_COLLECTION).doc(cacheDocumentId(cityId)).set({ data: {
      cityId,
      checkedAt: value.checkedAt || new Date().toISOString(),
      value,
      updatedAt: db.serverDate()
    } })
  } catch (error) {
    console.warn('forecast persistent cache write skipped', error.message)
  }
}

async function readPersistentCache(cityId) {
  try {
    const result = await db.collection(PERSISTENT_CACHE_COLLECTION).doc(cacheDocumentId(cityId)).get()
    const data = result && result.data
    const value = data && data.value
    const checkedAt = value && value.checkedAt || data && data.checkedAt
    const time = new Date(checkedAt).getTime()
    if (!value || !Number.isFinite(time)) return null
    return { value, checkedAt, ageMs: Math.max(0, Date.now() - time) }
  } catch (error) {
    console.warn('forecast persistent cache read skipped', error.message)
    return null
  }
}
const OFFICIAL_TIDE_STATIONS = {
  shanghai: {
    id: 'sh-luchaogang',
    name: '芦潮港',
    latitude: 30.84,
    longitude: 121.86,
    placeId: 21,
    source: '上海海事局'
  },
  nantong: {
    id: 'js-qinglonggang',
    name: '青龙港',
    latitude: 31.74,
    longitude: 121.69,
    placeId: 5,
    source: '上海海事局潮汐服务'
  }
}
const LIST_API = 'https://hyj.yantai.gov.cn/api-gateway/jpaas-publish-server/front/page/build/unit?parseType=bulidstatic&webId=52&tplSetId=MsPkwMwlYqOxItyOUpt7Y&pageType=column&tagId=%E5%88%97%E8%A1%A8%E6%96%B0%E9%97%BB&editType=null&pageId=1638'

const get = url => new Promise((resolve, reject) => {
  const request = https.get(url, { headers: { 'User-Agent': 'GanhaiRadar/1.1' } }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return get(new URL(res.headers.location, url).toString()).then(resolve, reject)
    }
    let body = ''
    res.setEncoding('utf8')
    res.on('data', chunk => { body += chunk })
    res.on('end', () => res.statusCode < 300 ? resolve(body) : reject(new Error('HTTP ' + res.statusCode)))
  })
  request.setTimeout(12000, () => request.destroy(new Error('请求超时')))
  request.on('error', reject)
})

const distanceKm = (from, to) => {
  const radians = value => value * Math.PI / 180
  const lat1 = radians(Number(from.latitude))
  const lat2 = radians(Number(to.latitude))
  const dLat = lat2 - lat1
  const dLng = radians(Number(to.longitude) - Number(from.longitude))
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

const clean = html => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&ndash;|&mdash;/gi, '—')
  .replace(/\s+/g, ' ')

const chinaDateOffset = days => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date(Date.now() + Number(days || 0) * 86400000))

const chinaDate = () => chinaDateOffset(0)

const chinaTimestamp = (date, time) => Date.parse(date + 'T' + time + ':00+08:00')

async function shMsaOfficialTide(station, date) {
  const url = 'https://www.sh.msa.gov.cn/shhsfb/information-aim-navigation/tide-search?PlaceId=' + station.placeId + '&TideDate=' + date
  const text = clean(await get(url))
  const match = text.match(/潮时\(Hrs\)\s*((?:\d{2}:\d{2}\s*){2,4})\s*潮高\(cm\)\s*((?:-?\d+\s*){2,4})/)
  if (!match) throw new Error('上海海事局潮汐表解析失败')
  const times = (match[1].match(/\d{2}:\d{2}/g) || [])
  const heights = (match[2].match(/-?\d+/g) || []).map(Number)
  if (times.length < 2 || times.length !== heights.length) throw new Error('上海海事局潮汐表数据不完整')
  const extrema = times.map((time, index) => ({ time, height: heights[index], timestamp: chinaTimestamp(date, time) }))
  const lows = extrema.filter((item, index) => {
    const previous = index > 0 ? extrema[index - 1].height : Infinity
    const next = index < extrema.length - 1 ? extrema[index + 1].height : Infinity
    return item.height <= previous && item.height <= next
  }).sort((a, b) => a.timestamp - b.timestamp)
  return { station, url, lows }
}

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
  const query = 'latitude=37.536&longitude=121.450&timezone=Asia%2FShanghai&forecast_days=1&current=temperature_2m%2Cprecipitation%2Cweather_code%2Cwind_speed_10m%2Cwind_direction_10m%2Cwind_gusts_10m&hourly=visibility'
  const data = JSON.parse(await get('https://api.open-meteo.com/v1/forecast?' + query))
  const current = data.current || {}
  const index = current.time && data.hourly ? data.hourly.time.indexOf(current.time.slice(0, 13) + ':00') : -1
  return {
    temp: Number(current.temperature_2m),
    rain: Number(current.precipitation),
    code: Number(current.weather_code),
    wind: Number(current.wind_speed_10m),
    windDirection: Number(current.wind_direction_10m),
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
      windSpeed: met.wind,
      windGust: met.gust,
      windDirection: met.windDirection,
      waveHeight: wave.max,
      waveDirectionText: wave.direction,
      waveLabel: '浪高' + wave.min + '—' + wave.max + 'm · ' + wave.direction + '浪',
      tideSource: '烟台市海洋发展和渔业局',
      tideStation: region.label,
      tideConfidence: '高',
      stationDistanceKm: null,
      modelNotice: '潮汐与分海域浪高采用烟台官方每日海洋预报'
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
  const metHourly = metData && metData.hourly || {}
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

  const historyStart = now - 18 * 3600000
  const metIndexByTime = {}
  ;(metHourly.time || []).forEach((time, index) => { metIndexByTime[String(time)] = index })
  const transportHistory = times.map((time, index) => {
    const stamp = localTimestamp(time)
    if (!finite(stamp) || stamp < historyStart || stamp > now + 3600000) return null
    const metIndex = metIndexByTime[String(time)]
    return {
      time,
      windSpeed: Number.isInteger(metIndex) && finite(metHourly.wind_speed_10m && metHourly.wind_speed_10m[metIndex]) ? Number(metHourly.wind_speed_10m[metIndex]) : null,
      windDirection: Number.isInteger(metIndex) && finite(metHourly.wind_direction_10m && metHourly.wind_direction_10m[metIndex]) ? Number(metHourly.wind_direction_10m[metIndex]) : null,
      waveHeight: finite(hourly.wave_height && hourly.wave_height[index]) ? Number(hourly.wave_height[index]) : null,
      waveDirection: finite(hourly.wave_direction && hourly.wave_direction[index]) ? Number(hourly.wave_direction[index]) : null,
      wavePeriod: finite(hourly.wave_period && hourly.wave_period[index]) ? Number(hourly.wave_period[index]) : null,
      oceanCurrentVelocity: finite(hourly.ocean_current_velocity && hourly.ocean_current_velocity[index]) ? Number(hourly.ocean_current_velocity[index]) : null,
      oceanCurrentDirection: finite(hourly.ocean_current_direction && hourly.ocean_current_direction[index]) ? Number(hourly.ocean_current_direction[index]) : null
    }
  }).filter(Boolean)

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
    windSpeed: wind,
    windGust: gust,
    windDirection: finite(met.wind_direction_10m) ? Number(met.wind_direction_10m) : null,
    waveHeight: wave,
    waveDirection: valueAt(marineData, 'wave_direction', lowIndex),
    wavePeriod: valueAt(marineData, 'wave_period', lowIndex),
    seaSurfaceTemperature: valueAt(marineData, 'sea_surface_temperature', lowIndex),
    oceanCurrentVelocity: valueAt(marineData, 'ocean_current_velocity', lowIndex),
    oceanCurrentDirection: valueAt(marineData, 'ocean_current_direction', lowIndex),
    transportHistory,
    tideSource: 'Open-Meteo潮位模型',
    tideConfidence: '参考',
    stationDistanceKm: null,
    modelNotice: '潮位约8公里分辨率，仅作赶海时间参考，不用于航海'
  }
}

function valueAt(data, name, preferredIndex) {
  const current = data && data.current || {}
  if (finite(current[name])) return Number(current[name])
  const values = data && data.hourly && data.hourly[name]
  if (!Array.isArray(values) || !values.length) return null
  if (Number.isInteger(preferredIndex) && finite(values[preferredIndex])) return Number(values[preferredIndex])
  const value = values.find(finite)
  return finite(value) ? Number(value) : null
}

const withOfficialTide = (conditions, official, point) => {
  if (!conditions || !official || !official.lows || !official.lows.length) return conditions
  const km = distanceKm(point, official.station)
  if (!Number.isFinite(km) || km > 65) return conditions
  const now = Date.now()
  const next = official.lows.find(item => item.timestamp + 30 * 60000 >= now)
  if (!next) return conditions
  const delta = Math.round((next.timestamp - now) / 60000)
  const tideScore = delta >= -30 && delta <= 120 ? 40 : delta <= 240 ? 30 : delta <= 360 ? 18 : 8
  return Object.assign({}, conditions, {
    nextLow: next.time,
    window: formatChinaTime(next.timestamp - 120 * 60000) + '—' + formatChinaTime(next.timestamp + 30 * 60000),
    tideScore,
    tideSource: official.source || official.station.source,
    tideSourceUrl: official.url || '',
    regionLabel: (official.source || official.station.source) + ' · ' + official.station.name + '潮汐站',
    tideStation: official.station.name,
    tideConfidence: km <= 30 ? '高' : '中',
    stationDistanceKm: Number(km.toFixed(1)),
    modelNotice: '低潮时间采用' + official.station.name + '官方潮汐站；浪高与天气仍采用数值模型'
  })
}

async function nationwideModel(event) {
  const cacheKey = String(event && event.cityId || '') + ':' + String(event && event.cityName || '')
  const cached = modelCache.get(cacheKey)
  if (cached && Date.now() - cached.time < MODEL_CACHE_TTL) return Object.assign({}, cached.value, { cached: true })
  const cityName = String(event && event.cityName || '当前城市').slice(0, 20)
  const center = event && event.location || { latitude: 37.536, longitude: 121.45 }
  const requested = Array.isArray(event && event.locations) ? event.locations.slice(0, 30) : []
  const points = [{ id: '__summary', latitude: Number(center.latitude), longitude: Number(center.longitude) }]
    .concat(requested.map(item => ({ id: String(item.id || '').slice(0, 80), latitude: Number(item.latitude), longitude: Number(item.longitude) })))
    .filter(item => item.id && finite(item.latitude) && finite(item.longitude) && item.latitude >= 3 && item.latitude <= 54 && item.longitude >= 73 && item.longitude <= 136)
  if (!points.length) throw new Error('缺少有效沿海坐标')

  const latitudes = points.map(item => item.latitude.toFixed(6)).join(',')
  const longitudes = points.map(item => item.longitude.toFixed(6)).join(',')
  const weatherQuery = 'latitude=' + latitudes + '&longitude=' + longitudes + '&timezone=Asia%2FShanghai&past_days=1&forecast_days=1&current=temperature_2m%2Cprecipitation%2Cweather_code%2Cwind_speed_10m%2Cwind_direction_10m%2Cwind_gusts_10m%2Cvisibility&hourly=wind_speed_10m%2Cwind_direction_10m'
  const marineVariables = 'wave_height%2Cwave_direction%2Cwave_period%2Csea_level_height_msl%2Csea_surface_temperature%2Cocean_current_velocity%2Cocean_current_direction'
  const marineQuery = 'latitude=' + latitudes + '&longitude=' + longitudes + '&timezone=Asia%2FShanghai&past_days=1&forecast_days=2&cell_selection=sea&current=' + marineVariables + '&hourly=' + marineVariables
  const cityId = String(event && event.cityId || '')
  const officialStation = OFFICIAL_TIDE_STATIONS[cityId]
  const officialPromise = officialStation
    ? Promise.allSettled([shMsaOfficialTide(officialStation, chinaDate()), shMsaOfficialTide(officialStation, chinaDateOffset(1))]).then(results => {
        const available = results.filter(item => item.status === 'fulfilled').map(item => item.value)
        if (!available.length) return null
        return {
          station: available[0].station,
          url: available[0].url,
          lows: available.reduce((all, item) => all.concat(item.lows || []), []).sort((a, b) => a.timestamp - b.timestamp)
        }
      })
    : Promise.resolve(null)
  const values = await Promise.all([
    get('https://api.open-meteo.com/v1/forecast?' + weatherQuery),
    get('https://marine-api.open-meteo.com/v1/marine?' + marineQuery),
    officialPromise
  ])
  const weatherData = JSON.parse(values[0])
  const marineData = JSON.parse(values[1])
  const officialTide = values[2]
  const weatherRows = Array.isArray(weatherData) ? weatherData : [weatherData]
  const marineRows = Array.isArray(marineData) ? marineData : [marineData]
  const conditionsBySpot = {}
  points.forEach((point, index) => {
    let conditions = modelConditions(weatherRows[index], marineRows[index], cityName)
    if (officialTide) conditions = withOfficialTide(conditions, { station: officialTide.station, source: officialTide.station.source, url: officialTide.url, lows: officialTide.lows }, point)
    if (conditions && point.id !== '__summary') conditionsBySpot[point.id] = conditions
  })
  let conditions = modelConditions(weatherRows[0], marineRows[0], cityName)
  if (officialTide) conditions = withOfficialTide(conditions, { station: officialTide.station, source: officialTide.station.source, url: officialTide.url, lows: officialTide.lows }, points[0])
  if (!conditions) throw new Error('全国海洋模型未返回完整潮位或浪高')
  conditions.spots = conditionsBySpot
  const safetyScore = conditions.blocked ? null : Math.min(100, conditions.tideScore + conditions.seaWeatherScore + 18)
  const value = {
    source: conditions.tideStation ? conditions.tideSource + '潮汐 + Open-Meteo浪高天气' : 'Open-Meteo全球海洋模型 + 全球天气模型',
    checkedAt: new Date().toISOString(),
    summary: {
      safetyScore,
      lowTide: conditions.nextLow || '--:--',
      bestTime: conditions.window || '暂不可计算',
      weather: conditions.weatherLabel.split(' · ')[0],
      wind: conditions.weatherLabel.split(' · ')[1],
      tideRange: conditions.waveLabel,
      safety: conditions.blocked ? conditions.reasons.join('、') : (conditions.tideStation ? '官方站潮汐参考；涨潮前至少30分钟开始回撤' : '模型参考；涨潮前至少30分钟开始回撤'),
      officialSourceUrl: conditions.tideSourceUrl || 'https://open-meteo.com/en/docs/marine-weather-api',
      coverageLabel: conditions.tideStation ? conditions.tideSource + '·' + conditions.tideStation + '站' : cityName + '近岸数值模型 · 约8公里潮位网格'
    },
    conditions
  }
  modelCache.set(cacheKey, { time: Date.now(), value })
  return value
}

exports.main = async event => {
  const cityId = String(event && event.cityId || 'yantai')
  let result
  if (cityId === 'yantai') {
    const values = await Promise.allSettled([yantaiOfficial(event), nationwideModel(event)])
    const officialResult = values[0].status === 'fulfilled' ? values[0].value : null
    const modelResult = values[1].status === 'fulfilled' ? values[1].value : null
    if (officialResult && officialResult.conditions && officialResult.conditions.dataReady) {
      result = officialResult
      if (modelResult && modelResult.conditions) {
        const transportFields = ['windSpeed', 'windGust', 'windDirection', 'waveHeight', 'waveDirection', 'wavePeriod', 'seaSurfaceTemperature', 'oceanCurrentVelocity', 'oceanCurrentDirection', 'transportHistory']
        const mergeTransport = (officialConditions, modelConditions) => {
          const merged = Object.assign({}, officialConditions)
          transportFields.forEach(key => {
            if (modelConditions && modelConditions[key] !== null && modelConditions[key] !== undefined) merged[key] = modelConditions[key]
          })
          return merged
        }
        const perSpot = {}
        const requested = Array.isArray(event && event.locations) ? event.locations : []
        requested.forEach(point => {
          const modelSpot = modelResult.conditions.spots && modelResult.conditions.spots[point.id]
          const officialSpot = officialResult.conditions.regions && officialResult.conditions.regions[Object.keys(REGIONS).find(key => REGIONS[key] === regionFor(point))]
          if (officialSpot) perSpot[point.id] = mergeTransport(officialSpot, modelSpot)
        })
        result.conditions = mergeTransport(result.conditions, modelResult.conditions)
        result.conditions.spots = perSpot
        result.source += ' + Open-Meteo风浪洋流'
      }
    } else {
      try {
        if (!modelResult) throw new Error(values[1].reason && values[1].reason.message || '数值模型不可用')
        const fallback = modelResult
        fallback.source = '烟台官方预报不可用，已切换 ' + fallback.source
        fallback.officialFallbackReason = officialResult && officialResult.reason
        result = fallback
      } catch (error) {
        result = officialResult
      }
    }
  } else {
    try {
      result = await nationwideModel(event)
    } catch (error) {
      console.error('nationwide forecast failed', error)
      result = {
        source: 'nationwide-forecast-failed',
        checkedAt: new Date().toISOString(),
        reason: error.message,
        conditions: { dataReady: false, blocked: false }
      }
    }
  }

  if (!result) {
    result = {
      source: 'forecast-unavailable',
      checkedAt: new Date().toISOString(),
      reason: '实时海况服务未返回有效结果',
      conditions: { dataReady: false, blocked: false }
    }
  }

  if (result.conditions && result.conditions.dataReady) {
    await savePersistentCache(cityId, result)
    return result
  }

  const cached = await readPersistentCache(cityId)
  if (!cached) return result
  const ageMinutes = Math.max(1, Math.round(cached.ageMs / 60000))
  if (cached.ageMs <= PERSISTENT_CACHE_FRESH_MS) {
    const value = JSON.parse(JSON.stringify(cached.value))
    value.cached = true
    value.cacheAgeMinutes = ageMinutes
    value.source = '最近有效缓存 · ' + value.source
    value.conditions.regionLabel = '缓存' + ageMinutes + '分钟前 · ' + (value.conditions.regionLabel || String(event && event.cityName || '当前城市') + '近岸')
    value.conditions.modelNotice = (value.conditions.modelNotice ? value.conditions.modelNotice + '；' : '') + '实时接口暂不可用，当前为' + ageMinutes + '分钟前的最近有效数据'
    return value
  }
  return Object.assign({}, result || {}, {
    reason: String(result && result.reason || '实时海况接口暂不可用') + '；上次有效数据为' + ageMinutes + '分钟前，因超过10分钟已停止评分',
    lastValid: { checkedAt: cached.checkedAt, ageMinutes },
    conditions: { dataReady: false, blocked: false }
  })
}
