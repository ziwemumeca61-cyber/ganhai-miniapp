const { distanceKm, formatDistance } = require('./geo')
const { scoreWithConditions, scoreLabel } = require('./predict')

const spots = [
  {
    id: 'jinshatan',
    name: '金沙滩北岸',
    area: '开发区',
    latitude: 37.5722,
    longitude: 121.1923,
    distance: 4.8,
    score: 88,
    level: '优先去',
    color: '#e69843',
    tide: '05:42 低潮 · 17:31 低潮',
    bestWindow: '04:50—07:00',
    weather: '晴 · 东南风2级',
    tideRange: '潮差 2.9m',
    update: '刚刚更新',
    tags: ['沙滩', '亲子友好', '停车方便'],
    species: [
      { name: '蛤蜊', mark: '蛤', value: '较多', tone: 'warm' },
      { name: '小螃蟹', mark: '蟹', value: '一般', tone: 'cool' },
      { name: '海螺', mark: '螺', value: '一般', tone: 'cool' }
    ],
    zone: { side: '东侧潮沟', distance: '离岸 50—110m', reason: '退潮后潮沟边缘更容易发现蛤蜊和小螃蟹' },
    risk: '低',
    safety: '沿北侧沙滩返回，别切入中部深沟',
    note: '演示预测：需用现场战果继续校准'
  },
  {
    id: 'jiahekou',
    name: '夹河口外滩',
    area: '福山区',
    latitude: 37.5528,
    longitude: 121.1747,
    distance: 7.2,
    score: 82,
    level: '值得去',
    color: '#43a995',
    tide: '06:03 低潮 · 17:52 低潮',
    bestWindow: '05:10—07:20',
    weather: '晴 · 东南风2级',
    tideRange: '潮差 2.7m',
    update: '5分钟前',
    tags: ['泥沙滩', '蛤蜊', '人少'],
    species: [
      { name: '蛤蜊', mark: '蛤', value: '多', tone: 'warm' },
      { name: '海蛎子', mark: '蛎', value: '一般', tone: 'cool' },
      { name: '海肠', mark: '肠', value: '偏少', tone: 'cool' }
    ],
    zone: { side: '西北侧泥滩', distance: '离岸 80—160m', reason: '河口外侧泥沙交界带是当前优先区域' },
    risk: '中',
    safety: '注意河口回流，不要越过红色警戒线',
    note: '演示预测：需用现场战果继续校准'
  },
  {
    id: 'zhifu-island',
    name: '芝罘岛东口',
    area: '芝罘区',
    latitude: 37.5915,
    longitude: 121.3511,
    distance: 10.6,
    score: 77,
    level: '可以去',
    color: '#5f91b5',
    tide: '05:36 低潮 · 17:25 低潮',
    bestWindow: '05:00—06:50',
    weather: '晴 · 东南风2级',
    tideRange: '潮差 2.5m',
    update: '8分钟前',
    tags: ['礁石', '海螺', '需要防滑'],
    species: [
      { name: '海螺', mark: '螺', value: '较多', tone: 'warm' },
      { name: '海蛎子', mark: '蛎', value: '较多', tone: 'warm' },
      { name: '螃蟹', mark: '蟹', value: '一般', tone: 'cool' }
    ],
    zone: { side: '东南侧礁石带', distance: '离岸 25—70m', reason: '背风礁石缝隙更适合找海螺和海蛎子' },
    risk: '中',
    safety: '礁石湿滑，穿防滑鞋，涨潮前沿原路返回',
    note: '演示预测：需用现场战果继续校准'
  },
  {
    id: 'first-bath',
    name: '第一海水浴场东侧',
    area: '芝罘区',
    latitude: 37.5357,
    longitude: 121.4143,
    distance: 12.3,
    score: 69,
    level: '休闲为主',
    color: '#8a9eaa',
    tide: '05:28 低潮 · 17:18 低潮',
    bestWindow: '05:00—06:30',
    weather: '晴 · 东南风2级',
    tideRange: '潮差 2.3m',
    update: '10分钟前',
    tags: ['交通方便', '新手友好', '海螺'],
    species: [
      { name: '海螺', mark: '螺', value: '一般', tone: 'cool' },
      { name: '小螃蟹', mark: '蟹', value: '一般', tone: 'cool' },
      { name: '蛤蜊', mark: '蛤', value: '偏少', tone: 'cool' }
    ],
    zone: { side: '东侧礁石边', distance: '离岸 20—50m', reason: '适合新手熟悉潮间带，不建议追求大收获' },
    risk: '低',
    safety: '优先走开放沙滩，避开封闭施工区域',
    note: '演示预测：需用现场战果继续校准'
  },
  {
    id: 'laishan',
    name: '莱山滨海步道外侧',
    area: '莱山区',
    latitude: 37.5087,
    longitude: 121.4899,
    distance: 15.7,
    score: 73,
    level: '可以去',
    color: '#4c9c9a',
    tide: '05:48 低潮 · 17:39 低潮',
    bestWindow: '05:20—07:10',
    weather: '晴 · 东南风2级',
    tideRange: '潮差 2.6m',
    update: '12分钟前',
    tags: ['礁石', '海蛎子', '风景好'],
    species: [
      { name: '海蛎子', mark: '蛎', value: '较多', tone: 'warm' },
      { name: '海螺', mark: '螺', value: '一般', tone: 'cool' },
      { name: '螃蟹', mark: '蟹', value: '偏少', tone: 'cool' }
    ],
    zone: { side: '步道东南侧', distance: '离岸 30—90m', reason: '外侧礁石边缘有较好的附着带' },
    risk: '中',
    safety: '注意礁石落差，不要从步道护栏翻越',
    note: '演示预测：需用现场战果继续校准'
  },
  {
    id: 'yangmadao',
    name: '养马岛东端',
    area: '牟平区',
    latitude: 37.4744,
    longitude: 121.7183,
    distance: 25.9,
    score: 91,
    level: '今日首选',
    color: '#dd8750',
    tide: '05:21 低潮 · 17:12 低潮',
    bestWindow: '04:35—06:50',
    weather: '晴 · 东南风2级',
    tideRange: '潮差 3.1m',
    update: '刚刚更新',
    tags: ['礁石滩', '海螺', '螃蟹'],
    species: [
      { name: '海螺', mark: '螺', value: '多', tone: 'warm' },
      { name: '螃蟹', mark: '蟹', value: '较多', tone: 'warm' },
      { name: '海蛎子', mark: '蛎', value: '一般', tone: 'cool' }
    ],
    zone: { side: '东南侧背风礁', distance: '离岸 35—95m', reason: '今日东南风较弱，背风礁缝优先级最高' },
    risk: '中',
    safety: '必须在低潮后90分钟内开始返程，严禁进入深沟',
    note: '演示预测：需用现场战果继续校准'
  }
]

function getSpots(location, conditions) {
  return spots.map(item => {
    const km = distanceKm(location, item)
    const score = conditions ? scoreWithConditions(item.score, conditions) : item.score
    return Object.assign({}, item, {
      score,
      level: scoreLabel(score),
      distance: km === null ? item.distance : Number(km.toFixed(1)),
      distanceLabel: formatDistance(km === null ? item.distance : km)
    })
  }).sort((a, b) => b.score - a.score)
}

function getSpot(id) {
  return spots.find(item => item.id === id) || spots[0]
}

function getTodaySummary() {
  return {
    score: 84,
    label: '适合赶海',
    subtitle: '退潮窗口清晰，风浪较小，优先选择背风区域',
    lowTide: '05:35 / 17:26',
    sunrise: '04:52',
    weather: '晴  ·  24℃',
    wind: '东南风 2级',
    tideRange: '潮差 2.8m',
    bestTime: '04:50—07:10',
    safety: '建议 06:40 前开始回撤',
    updatedAt: '2026-08-03 12:10',
    conditions: {
      windLevel: 2,
      windDirection: '东南',
      precipitation: 0,
      tideRange: 2.8,
      warning: false
    }
  }
}

module.exports = {
  spots,
  getSpots,
  getSpot,
  getTodaySummary
}
