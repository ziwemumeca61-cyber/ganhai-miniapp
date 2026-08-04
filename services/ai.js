const { getSpots } = require('../utils/data')

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

function ask(question, context) {
  // 接入成长计划后，把这里替换为 wx.cloud.callFunction({ name: 'ai-chat' })。
  return Promise.resolve({
    answer: localAnswer(question, context),
    source: '本地演示回答'
  })
}

module.exports = { ask }
