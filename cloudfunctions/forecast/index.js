/*
 * 天气/潮汐数据适配器。
 * 在 CloudBase 环境变量中配置 QWEATHER_API_HOST、QWEATHER_TOKEN、
 * QWEATHER_TIDE_STATION_YANTAI 后启用；未配置时返回 demo 状态，前端自动回退。
 */
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function requestJson(path) {
  const host = process.env.QWEATHER_API_HOST || 'devapi.qweather.com'
  const token = process.env.QWEATHER_TOKEN
  if (!token) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = https.request({
      host,
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    }, response => {
      let body = ''
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          if (response.statusCode >= 400 || parsed.code !== '200') return reject(new Error(`QWeather ${parsed.code || response.statusCode}`))
          resolve(parsed)
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('error', reject)
    request.end()
  })
}

function firstNumber(value) {
  const matched = String(value || '').match(/[0-9]+(?:\.[0-9]+)?/)
  return matched ? Number(matched[0]) : 0
}

function normalizeTide(tide) {
  const table = (tide && tide.tideTable) || []
  const lows = table.filter(item => item.type === 'L')
  const heights = table.map(item => Number(item.height)).filter(Number.isFinite)
  const range = heights.length ? Math.max(...heights) - Math.min(...heights) : 0
  return {
    lowTide: lows.slice(0, 2).map(item => `${item.fxTime.slice(11, 16)} 低潮`).join(' / '),
    tideRange: Number(range.toFixed(1)),
    tideTable: table
  }
}

function normalizeWeather(weather) {
  const hourly = (weather && weather.hourly) || []
  const first = hourly[0] || {}
  return {
    weather: `${first.text || '天气待更新'}  ·  ${first.temp || '--'}℃`,
    wind: `${first.windDir || ''}${first.windScale || ''}级`,
    windLevel: firstNumber(first.windScale),
    precipitation: firstNumber(first.pop),
    warning: false
  }
}

exports.main = async event => {
  const location = event && event.location
  const tideStation = process.env.QWEATHER_TIDE_STATION_YANTAI
  if (!location || !process.env.QWEATHER_TOKEN) {
    return { source: 'demo', reason: 'missing QWeather configuration' }
  }

  try {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const weather = await requestJson(`/v7/weather/24h?location=${encodeURIComponent(location)}`)
    const tide = tideStation ? await requestJson(`/v7/ocean/tide?location=${encodeURIComponent(tideStation)}&date=${date}`) : null
    const weatherData = normalizeWeather(weather)
    const tideData = normalizeTide(tide)
    const lowTide = tideData.lowTide || '潮汐待更新'
    return {
      source: tide ? 'qweather-live' : 'qweather-weather-only',
      summary: {
        weather: weatherData.weather,
        wind: weatherData.wind,
        lowTide,
        tideRange: tideData.tideRange ? `潮差 ${tideData.tideRange}m` : '潮差待更新'
      },
      conditions: {
        windLevel: weatherData.windLevel,
        precipitation: weatherData.precipitation,
        tideRange: tideData.tideRange,
        warning: weatherData.warning
      }
    }
  } catch (error) {
    console.error('forecast provider failed', error)
    return { source: 'demo', reason: 'provider request failed' }
  }
}
