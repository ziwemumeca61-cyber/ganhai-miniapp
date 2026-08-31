const api = require('./api')

function safeLocalAnswer(data) {
  if (!data || !data.summary || !data.summary.dataReady) return '当前官方潮汐或实时天气没有通过时效校验，我不能给出地点、时间或分数推荐。请稍后下拉刷新，并以现场开放和安全提示为准。'
  if (data.summary.conditions && data.summary.conditions.blocked) return '当前触发安全拦截：' + (data.summary.conditions.reasons || []).join('、') + '。今天不建议下滩。'
  const recommended = data.spots.find(item => item.recommended)
  const safe = data.spots.find(item => item.safetyScore !== null)
  if (!recommended) {
    return (safe ? safe.name + '海况安全分' + safe.safetyScore + '，' : '') + '但近14天现场收获样本尚未达到20条，因此只评估安全条件，不把任何地点称为推荐地点。下一低潮' + data.summary.lowTide + '，观察窗口' + data.summary.bestTime + '。'
  }
  return recommended.name + '达到双重门槛：海况安全分' + recommended.safetyScore + '，收获概率' + recommended.harvestScore + '分（' + recommended.confidence + '置信，' + recommended.sampleCount + '条现场样本）。观察窗口' + recommended.bestWindow + '，仍须服从现场管理和撤离提示。'
}

function extractAnswer(res) {
  if (!res) return ''
  if (typeof res.text === 'string') return res.text
  return res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content || ''
}

async function requestCloudAI(messages, modelName) {
  const app = getApp()
  const enabled = app && app.globalData && app.globalData.cloudEnabled && wx.cloud && wx.cloud.extend && wx.cloud.extend.AI
  if (!enabled) return null
  try {
    const model = wx.cloud.extend.AI.createModel('cloudbase')
    const name = modelName || 'hy3'
    const res = await model.generateText({ data: { model: name, messages } })
    const answer = extractAnswer(res)
    return answer ? { answer, source: '混元 AI · 已核验结构化数据' } : null
  } catch (error) {
    console.warn('CloudBase AI unavailable', error)
    return null
  }
}

function selectRelevantSpots(question, spots) {
  const text = String(question || '').replace(/\s+/g, '')
  const mentioned = spots.filter(item => {
    const full = String(item.name || '').replace(/\s+/g, '')
    const withoutNote = full.replace(/[（(][^）)]*[）)]/g, '')
    const short = withoutNote.replace(/海水浴场|海滨公园|赶海园|风景区|岸段|沙滩|附近/g, '')
    return [full, withoutNote, short].some(alias => alias.length >= 3 && text.indexOf(alias) >= 0)
  })
  const selected = []
  mentioned.concat(spots).forEach(item => {
    if (selected.length < 10 && !selected.some(existing => existing.id === item.id)) selected.push(item)
  })
  return selected
}

async function ask(question, context) {
  const app = getApp()
  const selectedCityId = context && context.cityId || app && app.globalData && app.globalData.selectedCityId || 'yantai'
  const selectedCity = api.cities.find(item => item.id === selectedCityId) || api.cities[0]
  const cityName = context && context.city || selectedCity.name
  const data = await api.getHomeData(app && app.globalData && app.globalData.location, selectedCity.id)
  if (!data.summary.dataReady || data.summary.conditions && data.summary.conditions.blocked) return { answer: safeLocalAnswer(data), source: '安全数据闸门' }
  const spots = selectRelevantSpots(question, data.spots).map(item => {
    const safety = item.safetyScore === null ? '安全待评估' : '安全' + item.safetyScore
    const harvest = item.harvestScore === null ? '收获' + item.harvestLabel + '/' + item.confidence + '置信/' + item.sampleCount + '条' : '收获' + item.harvestScore + '/' + item.confidence + '置信/' + item.sampleCount + '条'
    return item.name + '(' + item.verification + '，' + safety + '，' + harvest + '，距离' + item.distanceLabel + '，时段' + item.bestWindow + '，优先赶海区' + item.bestZone + '，现场特征' + item.searchFeature + '，入口' + item.entry + '，撤离' + item.retreat + ')'
  }).join('；')
  const cloudResult = await requestCloudAI([
    { role: 'system', content: '你是全国沿海赶海向导，当前服务城市是' + cityName + '。只能基于提供的结构化数据回答。海况安全分与收获概率必须分开；少于20条现场样本不能称为推荐；不得编造离岸距离、收获、开放边界或潮汐。先说结论，再说观察窗口、地点核验和撤离提醒。' },
    { role: 'user', content: '问题：' + question + '\n城市：' + cityName + '\n低潮：' + data.summary.lowTide + '\n观察窗口：' + data.summary.bestTime + '\n天气：' + data.summary.weather + '，' + data.summary.wind + '\n地点：' + spots }
  ])
  return cloudResult || { answer: safeLocalAnswer(data), source: '本地安全规则' }
}

async function summarizeReport(payload) {
  const data = payload || {}
  const cloudResult = await requestCloudAI([
    { role: 'system', content: '把赶海记录整理成一句客观简洁的中文，不补写用户没有提供的事实，不夸大数量。' },
    { role: 'user', content: '地点：' + (data.spotName || '沿海地点') + '\n品类：' + (data.species || '海货') + '\n收获：' + (data.amount || '少量') + '\n补充：' + (data.note || '未填写') }
  ])
  if (cloudResult) return cloudResult
  return { answer: '在' + (data.spotName || '沿海地点') + '记录到' + (data.species || '海货') + '，收获' + (data.amount || '少量') + (data.note ? '。' + data.note : '。'), source: '本地整理' }
}

module.exports = { ask, summarizeReport }
