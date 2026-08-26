const { distanceKm, formatDistance } = require('./geo')
const { safetyScoreWithConditions, scoreLabel } = require('./predict')

const pendingGuide = {
  entry: '待实地核验，暂不提供入口建议',
  shoreline: '待实地核验，暂不提供岸段建议',
  direction: '待实地核验，暂不提供路线建议',
  retreat: '待实地核验，暂不提供撤离建议'
}

const spots = [
  { id: 'jinshatan', name: '金沙滩海滨公园（瞭望台附近）', area: '黄渤海新区', latitude: 37.573856, longitude: 121.260837, type: '沙滩', harvest: '蛤蜊 · 海肠', verification: '附近导航点已核验', terrainSafety: 18, entry: '金沙滩海滨公园瞭望台附近导航点', shoreline: '瞭望台周边海岸，实际下滩口以现场公开通道为准', direction: '到达后先确认开放通道，不穿越绿化、护栏或管理围挡', retreat: '回涨前返回海滨路一侧，现场关闭或警戒时立即结束' },
  { id: 'jiahekou', name: '夹河口—古贝广场', area: '芝罘区', latitude: 37.5672, longitude: 121.3345, type: '泥沙滩', harvest: '蛤蜊 · 海蛎子', verification: '公开资料待复核', terrainSafety: 14, ...pendingGuide },
  { id: 'first-bath', name: '第一海水浴场', area: '芝罘区', latitude: 37.536201, longitude: 121.419746, type: '沙滩', harvest: '海螺 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 18, entry: '第一海水浴场公共入口', shoreline: '东侧裸露礁石与岸边沙滩，以现场开放区域为限', direction: '优先核对东侧礁石区，不进入游泳分隔区', retreat: '涨潮前至少30分钟回到固定岸线' },
  { id: 'jinhaiwan', name: '金海湾—旅游大世界', area: '芝罘区', latitude: 37.535687, longitude: 121.42711, type: '礁石 + 沙滩', harvest: '海螺 · 螃蟹', verification: '候选点待实地', terrainSafety: 15, ...pendingGuide },
  { id: 'moon-bay', name: '月亮湾', area: '芝罘区', latitude: 37.534699, longitude: 121.432033, type: '礁石', harvest: '螃蟹 · 海螺', verification: 'POI坐标已核验', terrainSafety: 15, entry: '滨海北路月亮湾公共步行入口', shoreline: '月亮老人周边可见礁石岸段，以护栏和现场提示为界', direction: '仅观察退潮后裸露礁石，不翻越护栏', retreat: '发现回涨或浪花越过外缘立即撤离' },
  { id: 'dongpaotai', name: '东炮台—海韵广场', area: '芝罘区', latitude: 37.534003, longitude: 121.436541, type: '礁石', harvest: '海螺 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 15, entry: '东炮台公园公共入口', shoreline: '东炮台东侧至海韵广场方向的开放岸段', direction: '避开海豹湾生态保育和任何封闭区域', retreat: '涨潮前30分钟离开低位礁石' },
  { id: 'second-bath', name: '第二海水浴场', area: '莱山区', latitude: 37.520652, longitude: 121.449064, type: '礁石 + 沙滩', harvest: '螃蟹 · 海螺', verification: 'POI坐标已核验', terrainSafety: 15, entry: '第二海水浴场公共入口', shoreline: '北侧礁石、南侧沙滩的现场开放岸段', direction: '礁石与沙滩分开判断，不跨越管理隔离', retreat: '回涨前返回主沙滩或硬质步道' },
  { id: 'yanda', name: '烟大海水浴场', area: '莱山区', latitude: 37.4862, longitude: 121.4625, type: '沙滩', harvest: '蛤蜊 · 蛏子', verification: '公开资料待复核', terrainSafety: 18, ...pendingGuide },
  { id: 'tianyuewan', name: '天越湾—东灯塔', area: '高新区', latitude: 37.46145, longitude: 121.488068, type: '沙滩', harvest: '小螃蟹 · 海螺', verification: '公开资料待复核', terrainSafety: 18, ...pendingGuide },
  { id: 'beizhai', name: '北寨—辛安河口', area: '高新区', latitude: 37.4418, longitude: 121.5385, type: '礁石 + 沙滩', harvest: '海螺 · 小螃蟹', verification: '候选点待实地', terrainSafety: 15, ...pendingGuide },
  { id: 'fenbei', name: '粉贝沙滩', area: '高新区', latitude: 37.443113, longitude: 121.550549, type: '沙滩', harvest: '贝壳 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 18, entry: '滨海东路靠近海河西路一侧公共入口', shoreline: '辛安河特大桥西北侧公开沙滩岸段', direction: '远离河口急流、桥墩和施工围挡', retreat: '水位开始持续上升时返回道路侧' },
  { id: 'yangmadao-front', name: '养马岛前海', area: '牟平区', latitude: 37.474548, longitude: 121.644837, type: '沙滩', harvest: '海螺 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 18, entry: '养马岛海水浴场公共入口', shoreline: '海水浴场近岸公开区域，以现场管理边界为准', direction: '只在平缓近岸活动，不向离岸礁石延伸', retreat: '预留30分钟返回入口，天气突变立即结束' },
  { id: 'yangmadao-back', name: '养马岛后海', area: '牟平区', latitude: 37.486, longitude: 121.606, type: '礁石', harvest: '海螺 · 螃蟹', verification: '候选点待实地', terrainSafety: 15, ...pendingGuide },
  { id: 'haiyang-wanmi', name: '海阳凤城万米海滩', area: '海阳市', latitude: 36.69538, longitude: 121.225813, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: 'POI坐标已核验', terrainSafety: 18, entry: '凤城万米海滩公共入口', shoreline: '海景路沿线公开海水浴场岸段，以现场开放区域为限', direction: '仅在平缓沙滩和现场允许区域活动', retreat: '回涨前返回海景路一侧，浴场关闭或警戒时立即结束' },
  { id: 'longkou-donghai-west', name: '东海度假区西部夏季海水浴场', area: '龙口市', latitude: 37.715873, longitude: 120.411911, type: '沙滩', harvest: '贝类 · 小鱼', verification: 'POI坐标已核验', terrainSafety: 18, entry: '海涛二路6号浴场入口', shoreline: '海润豪景对面海水浴场岸段，以现场开放区域为限', direction: '从海涛二路一侧进入，仅在平缓近岸和现场允许区域活动', retreat: '回涨前返回海涛二路一侧，浴场关闭或出现警戒时立即结束' },
  { id: 'penglai-bath-nearby', name: '蓬莱海水浴场（仙境路附近）', area: '蓬莱区', latitude: 37.820125, longitude: 120.766869, type: '沙滩', harvest: '贝类 · 小螃蟹', verification: '附近导航点已核验', terrainSafety: 18, entry: '仙境路2号附近导航参考点，并非浴场入口', shoreline: '仙境路北侧海滩方向，实际下滩口以现场公开通道为准', direction: '到达参考点后沿公开步道寻找现场开放入口，不跨越景区或管理边界', retreat: '回涨前返回仙境路一侧，遇封闭、警戒或收费管理区域立即停止' }
]

function harvestAssessment(spot, reports) {
  const item = (reports || []).find(report => report.spotId === spot.id)
  const count = Number(item && item.count || 0)
  const average = Number(item && item.average || 0)
  if (count < 5) return { count, label: '样本不足', score: null, confidence: '无' }
  const label = average < 1.75 ? '偏少' : average < 2.75 ? '一般' : '较好'
  if (count < 20) return { count, label, score: null, confidence: '低' }
  return { count, label, score: Math.round(Math.min(100, average / 4 * 100)), confidence: count < 50 ? '中' : '高' }
}

function getSpots(location, conditions, reports) {
  return spots.map(item => {
    const km = distanceKm(location, item)
    const verified = item.verification === 'POI坐标已核验'
    const safetyScore = verified ? safetyScoreWithConditions(item.terrainSafety, conditions) : null
    const harvest = harvestAssessment(item, reports)
    const recommended = safetyScore !== null && safetyScore >= 80 && harvest.score !== null
    const lowTide = conditions && conditions.nextLow ? conditions.nextLow : '--:--'
    const window = conditions && conditions.window ? conditions.window : '暂不可计算'
    return Object.assign({}, item, {
      score: safetyScore,
      safetyScore,
      harvestScore: harvest.score,
      harvestLabel: harvest.label,
      confidence: harvest.confidence,
      sampleCount: harvest.count,
      recommended,
      level: recommended ? '达到推荐门槛' : safetyScore !== null ? scoreLabel(safetyScore) : item.verification,
      distance: km === null ? null : Number(km.toFixed(1)),
      distanceLabel: formatDistance(km),
      tide: lowTide === '--:--' ? '潮汐待更新' : '下一低潮 ' + lowTide,
      bestWindow: window,
      weather: conditions && conditions.weatherLabel || '天气待更新',
      tideRange: conditions && conditions.waveLabel || '海况待更新',
      update: conditions && conditions.dataReady ? '实时海况' : '等待实时数据',
      tags: [item.type, item.verification, item.harvest],
      species: item.harvest.split(' · ').slice(0, 3).map((name, index) => ({ name, mark: name.slice(0, 1), value: harvest.label, tone: index === 0 ? 'warm' : 'cool' })),
      zone: { side: item.direction, distance: item.shoreline, reason: item.entry },
      risk: item.type.indexOf('礁石') >= 0 ? '中' : '低',
      safety: item.retreat,
      note: '收获判断只使用近14天现场定位通过的样本'
    })
  }).sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
    if ((a.safetyScore !== null) !== (b.safetyScore !== null)) return a.safetyScore !== null ? -1 : 1
    if (a.safetyScore !== b.safetyScore) return Number(b.safetyScore || 0) - Number(a.safetyScore || 0)
    return Number(a.distance || 999) - Number(b.distance || 999)
  })
}

function getSpot(id) {
  return spots.find(item => item.id === id) || spots[0]
}

function getTodaySummary() {
  return {
    score: null,
    safetyScore: null,
    label: '实时数据待更新',
    safetyLevel: '实时数据待更新',
    subtitle: '官方潮汐或实时天气未通过校验时，系统停止推荐',
    lowTide: '--:--',
    weather: '待更新',
    wind: '待更新',
    tideRange: '待更新',
    bestTime: '暂不可计算',
    safety: '请稍后下拉刷新，不使用过期数据',
    updatedAt: new Date().toLocaleString(),
    dataReady: false,
    conditions: { dataReady: false, blocked: false }
  }
}

module.exports = { spots, getSpots, getSpot, getTodaySummary, harvestAssessment }
