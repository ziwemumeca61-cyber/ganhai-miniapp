const { getSpots, getTodaySummary } = require('../utils/data')

function localAnswer(question) {
  const spots = getSpots()
  const top = spots[0]
  if (/带孩子|亲子|小朋友/.test(question)) {
    return `带孩子优先看${spots.find(item => item.tags.indexOf('亲子友好') >= 0).name}，今天指数84分。沙滩平缓、停车方便，建议在${spots[0].bestWindow}到达，06:40前开始回撤。`
  }
  if (/螃蟹|螃蟹多/.test(question)) {
    return `想找螃蟹，今天先看${top.name}的${top.zone.side}，推荐范围是${top.zone.distance}。如果愿意跑远一点，${spots.find(item => item.id === 'yangmadao').name}的礁石缝更值得优先观察。`
  }
  if (/蛤蜊|花蛤/.test(question)) {
    return `想挖蛤蜊，优先考虑${spots.find(item => item.id === 'jiahekou').name}，当前泥沙交界带评分较高；带上小铲和网袋，别进入河口回流区域。`
  }
  if (/现在|能不能|适合/.test(question)) {
    return `当前演示数据判断：今天适合赶海，推荐指数84分。最佳窗口是${top.bestWindow}，但实际下海前要重新确认现场风浪、封闭区域和潮汐变化。`
  }
  return `今天烟台整体赶海指数84分，首选${top.name}，建议去${top.zone.side}，${top.zone.distance}。这是演示预测，真实版会接入天气、潮汐和用户战果数据后动态更新。`
}

async function requestCloudAI(messages) {
  const app = getApp()
  const canUseCloudAI = app && app.globalData && app.globalData.cloudEnabled && wx.cloud && wx.cloud.extend && wx.cloud.extend.AI

  if (!canUseCloudAI) return null

  try {
    // 成长计划环境：具体 provider/model 以 CloudBase 控制台完成资格和模型开通后为准。
    const model = wx.cloud.extend.AI.createModel('hunyuan-exp')
    const res = await model.generateText({ model: 'hy3', messages })
    const answer = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content
    return answer ? { answer, source: '混元 AI · 结构化数据' } : null
  } catch (error) {
    console.warn('CloudBase AI unavailable, fallback to local adapter', error)
    return null
  }
}

async function ask(question, context) {
  const summary = getTodaySummary()
  const topSpots = getSpots().slice(0, 4).map(item => `${item.name}(${item.score}分，${item.zone.side}，${item.zone.distance})`).join('；')
  const cloudResult = await requestCloudAI([
    { role: 'system', content: '你是烟台赶海向导。只能基于提供的结构化数据回答；不要编造潮汐、天气、封闭区域或海货数量。先说结论，再给时间、区域和安全提醒。' },
    { role: 'user', content: `用户问题：${question}\n城市：${(context && context.city) || '烟台'}\n今日数据：${summary.label}，指数${summary.score}，低潮${summary.lowTide}，窗口${summary.bestTime}，天气${summary.weather}，风${summary.wind}。\n候选地点：${topSpots}` }
  ])
  if (cloudResult) return cloudResult

  return { answer: localAnswer(question, context), source: '本地演示回答' }
}

async function summarizeReport(payload) {
  const data = payload || {}
  const spotName = data.spotName || '烟台沿海'
  const species = data.species || '海货'
  const amount = data.amount || '少量'
  const note = data.note || '现场情况正常'
  const cloudResult = await requestCloudAI([
    { role: 'system', content: '你是赶海记录整理助手。把用户的简短记录整理成一句客观、简洁、适合提交到社区的中文描述，不夸大数量，不补写用户没有提供的事实。' },
    { role: 'user', content: `地点：${spotName}\n品类：${species}\n收获：${amount}\n补充：${note}` }
  ])
  if (cloudResult) return cloudResult
  return { answer: `在${spotName}记录到${species}，收获${amount}。${note}。`, source: '本地整理助手' }
}

module.exports = { ask, summarizeReport }
