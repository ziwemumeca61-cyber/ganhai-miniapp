function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

// 第一版规则模型：真实天气/潮汐接入后只需替换 conditions，不改页面逻辑。
function scoreWithConditions(baseScore, conditions) {
  const data = conditions || {}
  let delta = 0
  const windLevel = Number(data.windLevel || 0)
  const precipitation = Number(data.precipitation || 0)
  const tideRange = Number(data.tideRange || 0)

  if (windLevel >= 6) delta -= 28
  else if (windLevel >= 4) delta -= 12
  else if (windLevel > 0 && windLevel <= 2) delta += 3

  if (precipitation >= 50) delta -= 25
  else if (precipitation >= 20) delta -= 10

  if (tideRange >= 3) delta += 5
  else if (tideRange > 0 && tideRange < 2.2) delta -= 7

  if (data.warning) delta -= 35
  return clamp(baseScore + delta, 0, 100)
}

function scoreLabel(score) {
  if (score >= 85) return '优先去'
  if (score >= 72) return '值得去'
  if (score >= 60) return '可以去'
  if (score >= 45) return '看风况'
  return '不建议'
}

function safetyLevel(conditions) {
  const data = conditions || {}
  if (data.warning || Number(data.windLevel || 0) >= 6 || Number(data.precipitation || 0) >= 50) return '不建议下海'
  if (Number(data.windLevel || 0) >= 4 || Number(data.precipitation || 0) >= 20) return '谨慎出行'
  return '适合赶海'
}

module.exports = { scoreWithConditions, scoreLabel, safetyLevel }
