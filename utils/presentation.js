// 只整理展示样式；潮汐、评分和地点排序仍使用原有数据。
function coastState(spot) {
  if (spot && spot.conditionsBlocked) return { tone: 'quiet', label: '暂勿下滩' }
  if (!spot || !spot.conditionsReady || spot.safetyScore === null) return { tone: 'pending', label: '海况待更新' }
  if (!spot.canReport) return { tone: 'calm', label: '仅观察，不采集' }
  if (spot.safetyScore >= 85) return { tone: 'calm', label: '海况较好' }
  return { tone: 'quiet', label: spot.safetyScore >= 70 ? '谨慎下滩' : '条件一般' }
}

function exploreSpot(spot) {
  const type = String(spot.type || '')
  const terrain = !spot.canReport ? 'observe' : /礁|石/.test(type) ? 'rock' : 'sand'
  const state = coastState(spot)
  return Object.assign({}, spot, {
    exploreTone: terrain,
    exploreLabel: terrain === 'rock' ? '礁石岸' : terrain === 'observe' ? '看海去' : '沙滩边',
    coastTone: state.tone,
    coastLabel: state.label
  })
}

function homeMood(summary, lead) {
  const state = coastState(lead)
  if (lead && lead.conditionsBlocked) return { tone: 'quiet', title: '今天，\n岸上看海。', subtitle: '风浪有提醒，先别急着下滩。' }
  if (!summary.dataReady || state.tone === 'pending') return { tone: 'pending', title: '想去海边，\n先看潮汐。', subtitle: '海况还没准备好，先逛逛地点。' }
  if (state.tone === 'quiet') return { tone: 'quiet', title: '慢一点，\n沿岸走走。', subtitle: '先留意风浪，再决定是否下滩。' }
  return { tone: 'calm', title: '退潮后，\n去见海。', subtitle: '挑一片海岸，把脚步放慢。' }
}

function dayLabel() {
  const today = new Date()
  return (today.getMonth() + 1) + '月' + today.getDate() + '日 · 海边手记'
}

module.exports = { coastState, exploreSpot, homeMood, dayLabel }
