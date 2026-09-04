const SITES = {
  jinshatan: { habitat: 30, onshore: 180, basis: '开发区北岸沙质底与历史增殖、冲岸记录' },
  jiahekou: { habitat: 30, onshore: 180, basis: '夹河口北岸松散泥沙底与历史冲岸记录' },
  'first-bath': { habitat: 20, onshore: 180, basis: '芝罘北岸沙质近岸带' },
  jinhaiwan: { habitat: 10, onshore: 180, basis: '芝罘北岸，但礁石比例较高' },
  yanda: { habitat: 20, onshore: 270, basis: '莱山东侧沙质近岸带' },
  tianyuewan: { habitat: 10, onshore: 270, basis: '莱山东侧沙滩，缺少本地历史样本' },
  fenbei: { habitat: 10, onshore: 270, basis: '莱山东侧沙质近岸带' }
}
const finite = value => Number.isFinite(Number(value))
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const diff = (a, b) => Math.abs(((Number(a) - Number(b) + 540) % 360) - 180)
const align = (bearing, onshore) => finite(bearing) ? Math.max(0, Math.cos(diff(bearing, onshore) * Math.PI / 180)) : null
const fromAlign = (direction, onshore) => align((Number(direction) + 180) % 360, onshore)
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

function seaIntestineForecast(spot, conditions, reports) {
  const site = spot && SITES[spot.id]
  if (!site || !conditions || !conditions.dataReady) return { available: false }
  const report = (reports || []).find(item => item.spotId === spot.id && item.species === '海肠')
  const positive = Number(report && report.positiveCount || 0)
  const negative = Number(report && report.negativeCount || 0)
  const sampleCount = positive + negative
  const history = Array.isArray(conditions.transportHistory) ? conditions.transportHistory : []
  const reasons = [site.basis]
  let score = site.habitat
  let fields = 0

  const windHistory = mean(history.filter(x => finite(x.windDirection) && finite(x.windSpeed)).map(x => clamp(Number(x.windSpeed) / 35, 0, 1) * fromAlign(x.windDirection, site.onshore)))
  const windNow = finite(conditions.windSpeed) ? clamp(Number(conditions.windSpeed) / 35, 0, 1) * fromAlign(conditions.windDirection, site.onshore) : null
  if (windHistory !== null || windNow !== null) {
    fields += 1
    const value = (windHistory !== null ? windHistory : windNow) * 18
    score += value
    if (value >= 7) reasons.push('近18小时风场有明显向岸输送分量')
  }

  const waveHistory = mean(history.filter(x => finite(x.waveDirection) && finite(x.waveHeight)).map(x => clamp(Number(x.waveHeight) ** 2 * (finite(x.wavePeriod) ? Number(x.wavePeriod) : 5) / 12, 0, 1) * fromAlign(x.waveDirection, site.onshore)))
  const waveNow = finite(conditions.waveHeight) ? clamp(Number(conditions.waveHeight) ** 2 * (finite(conditions.wavePeriod) ? Number(conditions.wavePeriod) : 5) / 12, 0, 1) * fromAlign(conditions.waveDirection, site.onshore) : null
  if (waveHistory !== null || waveNow !== null) {
    fields += 1
    const value = (waveHistory !== null ? waveHistory : waveNow) * 22
    score += value
    if (value >= 8) reasons.push('浪涌能量与向岸方向同时增强')
  }

  const currentHistory = mean(history.filter(x => finite(x.oceanCurrentDirection) && finite(x.oceanCurrentVelocity)).map(x => clamp(Number(x.oceanCurrentVelocity) / 0.5, 0, 1) * align(x.oceanCurrentDirection, site.onshore)))
  const currentNow = finite(conditions.oceanCurrentVelocity) ? clamp(Number(conditions.oceanCurrentVelocity) / 0.5, 0, 1) * align(conditions.oceanCurrentDirection, site.onshore) : null
  if (currentHistory !== null || currentNow !== null) {
    fields += 1
    const value = (currentHistory !== null ? currentHistory : currentNow) * 12
    score += value
    if (value >= 5) reasons.push('表层洋流存在向岸分量')
  }
  if (finite(conditions.seaSurfaceTemperature)) fields += 1
  if (finite(conditions.tideScore)) score += clamp(Number(conditions.tideScore) / 40, 0, 1) * 6
  if (sampleCount) {
    const rate = (positive + 1) / (sampleCount + 2)
    const weight = clamp(sampleCount / 20, 0, 1)
    score = score * (1 - weight * 0.35) + rate * 100 * weight * 0.35
    reasons.push('近90天' + positive + '次发现、' + negative + '次未发现')
  } else reasons.push('尚无该点位海肠正负样本')

  score = Math.round(clamp(score, 0, 100))
  const blocked = conditions.blocked === true
  const label = score >= 65 ? '较强信号' : score >= 45 ? '值得观察' : '当前较弱'
  const confidence = sampleCount >= 30 && fields >= 3 ? '高' : sampleCount >= 10 && fields >= 2 ? '中' : '低'
  return {
    available: true,
    score,
    label,
    confidence,
    safetyBlocked: blocked,
    positiveCount: positive,
    negativeCount: negative,
    reasons: reasons.slice(0, 3),
    summary: blocked ? '冲岸信号' + label + '，但当前禁止下海' : '冲岸指数' + score + ' · ' + label + ' · ' + confidence + '置信',
    disclaimer: '相对冲岸信号，不是收获保证'
  }
}

module.exports = { seaIntestineForecast, SEA_INTESTINE_SITES: SITES }
