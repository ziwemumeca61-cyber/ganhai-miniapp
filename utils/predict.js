function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function safetyScoreWithConditions(terrainScore, conditions) {
  const data = conditions || {}
  if (!data.dataReady || data.blocked) return null
  const tideScore = Number(data.tideScore)
  const seaWeatherScore = Number(data.seaWeatherScore)
  if (!Number.isFinite(tideScore) || !Number.isFinite(seaWeatherScore)) return null
  return clamp(tideScore + seaWeatherScore + Number(terrainScore || 0), 0, 100)
}

function scoreLabel(score) {
  if (score === null || score === undefined) return '待海况'
  if (score >= 85) return '安全条件较好'
  if (score >= 75) return '安全条件一般'
  if (score >= 60) return '谨慎评估'
  return '不建议下滩'
}

function safetyLevel(conditions) {
  const data = conditions || {}
  if (data.blocked) return '不建议下滩'
  if (!data.dataReady) return '实时数据待更新'
  return '实时海况已更新'
}

module.exports = { clamp, safetyScoreWithConditions, scoreLabel, safetyLevel }
