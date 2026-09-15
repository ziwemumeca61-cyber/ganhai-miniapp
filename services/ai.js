const api = require('./api')

function spotLine(item) {
  const safety = item.safetyScore === null ? '安全待评估' : '安全' + item.safetyScore + '分'
  const harvest = item.sampleCount >= 5 ? '近14天收获趋势' + item.harvestLabel : '收获样本不足'
  return item.name + '：' + safety + '，距你' + item.distanceLabel + '，' + item.bestWindow + '；可能有' + item.harvest + '；优先看' + item.bestZone + '（' + harvest + '）'
}

function safeLocalAnswer(data, question) {
  if (!data || !data.summary || !data.summary.dataReady) return '当前官方潮汐或实时天气没有通过时效校验，我不能给出地点、时间或分数推荐。请稍后下拉刷新，并以现场开放和安全提示为准。'
  if (data.summary.conditions && data.summary.conditions.blocked) return '当前触发安全拦截：' + (data.summary.conditions.reasons || []).join('、') + '。今天不建议下滩。'
  const all = data.spots || []
  if (!all.length) return '当前城市还没有收录可比较的赶海地点。'
  const text = String(question || '').replace(/\s+/g, '')
  const listIntent = /有哪些|所有|全部|多少个|地点列表|赶海点/.test(text)
  const mentioned = findMentionedSpots(text, all)
  if (listIntent && !mentioned.length) {
    const names = all.map(item => item.name)
    const shown = names.slice(0, 15).join('、')
    return '当前城市共收录' + names.length + '个地点，不只第二海水浴场：' + shown + (names.length > 15 ? '等另外' + (names.length - 15) + '个。' : '。') + '你可以继续问具体地点、海货、距离或是否适合带孩子。'
  }
  const selected = selectRelevantSpots(question, all, mentioned.length ? mentioned.length : 3)
  const recommended = selected.find(item => item.recommended)
  const conclusion = recommended
    ? recommended.name + '已达到安全与收获样本双重门槛。'
    : '当前收获样本尚不足以给出正式推荐，以下按问题匹配和综合排序供你比较。'
  return conclusion + ' 当前城市共收录' + all.length + '个地点。' + selected.map(spotLine).join('\n') + '\n下一低潮' + data.summary.lowTide + '，总览观察窗口' + data.summary.bestTime + '；以各地点自己的时段和现场管理为准。'
}

function extractAnswer(res) {
  if (!res) return ''
  if (typeof res.text === 'string') return res.text
  return res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content || ''
}

let aiCooldownUntil = 0

async function requestCloudAI(messages, modelName) {
  const app = getApp()
  const enabled = app && app.globalData && app.globalData.cloudEnabled && wx.cloud && wx.cloud.extend && wx.cloud.extend.AI
  if (!enabled) return null
  if (Date.now() < aiCooldownUntil) return { error: 'rate-limit' }
  try {
    const model = wx.cloud.extend.AI.createModel('cloudbase')
    const name = modelName || 'hy3'
    const res = await model.generateText({ data: { model: name, messages } })
    const answer = extractAnswer(res)
    return answer ? { answer, source: '混元 AI · 已核验结构化数据' } : null
  } catch (error) {
    console.warn('CloudBase AI unavailable', error)
    const message = String(error && (error.errMsg || error.message || error) || '')
    if (/429|Too Many Requests/i.test(message)) {
      aiCooldownUntil = Date.now() + 60000
      return { error: 'rate-limit' }
    }
    return { error: 'unavailable' }
  }
}

function findMentionedSpots(question, spots) {
  const text = String(question || '').replace(/\s+/g, '')
  return spots.filter(item => {
    const full = String(item.name || '').replace(/\s+/g, '')
    const withoutNote = full.replace(/[（(][^）)]*[）)]/g, '')
    const short = withoutNote.replace(/海水浴场|海滨公园|赶海园|风景区|岸段|沙滩|附近/g, '')
    const area = String(item.area || '').replace(/\s+/g, '')
    return [full, withoutNote, short, area].some(alias => alias.length >= 2 && text.indexOf(alias) >= 0)
  })
}

function selectRelevantSpots(question, spots, limit) {
  const text = String(question || '').replace(/\s+/g, '')
  const mentioned = findMentionedSpots(text, spots)
  const mentionedIds = mentioned.reduce((result, item) => { result[item.id] = true; return result }, {})
  const childIntent = /孩子|带娃|儿童|老人|新手/.test(text)
  const scored = spots.map((item, index) => {
    let relevance = mentionedIds[item.id] ? 1000 : 0
    if (item.harvest && String(item.harvest).split(/[·、，,\s]+/).some(name => name.length >= 2 && text.indexOf(name) >= 0)) relevance += 120
    if (childIntent && /沙滩|细沙/.test(String(item.type || '') + String(item.shoreline || ''))) relevance += 35
    if (childIntent && Number(item.safetyScore) >= 80) relevance += 20
    return { item, index, relevance }
  }).sort((a, b) => b.relevance - a.relevance || a.index - b.index)
  const selected = []
  scored.forEach(entry => {
    if (selected.length < (limit || 12)) selected.push(entry.item)
  })
  return selected
}

async function ask(question, context) {
  const app = getApp()
  const selectedCityId = context && context.cityId || app && app.globalData && app.globalData.selectedCityId || 'yantai'
  const selectedCity = api.cities.find(item => item.id === selectedCityId) || api.cities[0]
  const cityName = context && context.city || selectedCity.name
  const data = await api.getHomeData(app && app.globalData && app.globalData.location, selectedCity.id)
  if (!data.summary.dataReady || data.summary.conditions && data.summary.conditions.blocked) return { answer: safeLocalAnswer(data, question), source: '安全数据闸门' }
  if (/有哪些|所有|全部|多少个|地点列表|赶海点/.test(String(question || '').replace(/\s+/g, ''))) {
    return { answer: safeLocalAnswer(data, question), source: '本地实时地点库' }
  }
  const selected = selectRelevantSpots(question, data.spots, 12)
  const spotDetails = selected.map(item => {
    const safety = item.safetyScore === null ? '安全待评估' : '安全' + item.safetyScore
    const harvest = item.harvestScore === null ? '收获' + item.harvestLabel + '/' + item.confidence + '置信/' + item.sampleCount + '条' : '收获' + item.harvestScore + '/' + item.confidence + '置信/' + item.sampleCount + '条'
    return item.name + '(' + item.verification + '，' + safety + '，' + harvest + '，距离' + item.distanceLabel + '，时段' + item.bestWindow + '，优先赶海区' + item.bestZone + '，现场特征' + item.searchFeature + '，入口' + item.entry + '，撤离' + item.retreat + ')'
  }).join('；')
  const spotCatalog = data.spots.map(item => item.name).join('、')
  const cloudResult = await requestCloudAI([
    { role: 'system', content: '你是全国沿海赶海向导，当前服务城市是' + cityName + '。只能基于提供的结构化数据回答。必须知道“全部地点目录”中的地点，不得声称当前城市只有详细候选里的地点。海况安全分与收获概率必须分开；少于20条现场样本不能称为推荐；不得编造离岸距离、收获、开放边界或潮汐。先说结论，再说观察窗口、地点核验和撤离提醒。' },
    { role: 'user', content: '问题：' + question + '\n城市：' + cityName + '\n全部地点目录（共' + data.spots.length + '个）：' + spotCatalog + '\n低潮：' + data.summary.lowTide + '\n观察窗口：' + data.summary.bestTime + '\n天气：' + data.summary.weather + '，' + data.summary.wind + '\n与问题最相关的详细地点：' + spotDetails }
  ])
  if (cloudResult && cloudResult.answer) return cloudResult
  return { answer: safeLocalAnswer(data, question), source: cloudResult && cloudResult.error === 'rate-limit' ? '本地实时数据 · AI限流降级' : '本地安全规则' }
}

async function summarizeReport(payload) {
  const data = payload || {}
  const cloudResult = await requestCloudAI([
    { role: 'system', content: '把赶海记录整理成一句客观简洁的中文，不补写用户没有提供的事实，不夸大数量。' },
    { role: 'user', content: '地点：' + (data.spotName || '沿海地点') + '\n岸段：' + (data.zoneLabel || '未说明') + '\n品类：' + (data.species || '海货') + '\n收获：' + (data.amount || '少量') + '\n补充：' + (data.note || '未填写') }
  ])
  if (cloudResult && cloudResult.answer) return cloudResult
  return { answer: '在' + (data.spotName || '沿海地点') + (data.zoneLabel ? data.zoneLabel : '') + '记录到' + (data.species || '海货') + '，收获' + (data.amount || '少量') + (data.note ? '。' + data.note : '。'), source: '本地整理' }
}

module.exports = { ask, summarizeReport }
