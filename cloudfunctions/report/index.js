const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const command = db.command

const spots = {
  'first-bath': { name: '第一海水浴场', latitude: 37.536201, longitude: 121.419746 },
  'moon-bay': { name: '月亮湾', latitude: 37.534699, longitude: 121.432033 },
  dongpaotai: { name: '东炮台—海韵广场', latitude: 37.534003, longitude: 121.436541 },
  'second-bath': { name: '第二海水浴场', latitude: 37.520652, longitude: 121.449064 },
  fenbei: { name: '粉贝沙滩', latitude: 37.443113, longitude: 121.550549 },
  'yangmadao-front': { name: '养马岛前海', latitude: 37.474548, longitude: 121.644837 },
  'haiyang-wanmi': { name: '海阳凤城万米海滩', latitude: 36.69538, longitude: 121.225813 },
  'longkou-donghai-west': { name: '东海度假区西部夏季海水浴场', latitude: 37.715873, longitude: 120.411911 },
  jinshatan: { name: '金沙滩海滨公园（瞭望台附近）', latitude: 37.573856, longitude: 121.260837 },
  yanda: { name: '烟大海水浴场（附近）', latitude: 37.4862, longitude: 121.4625 },
  tianyuewan: { name: '天越湾酒店附近沙滩', latitude: 37.46145, longitude: 121.488068 },
  'penglai-bath-nearby': { name: '蓬莱海水浴场（仙境路附近）', latitude: 37.820125, longitude: 120.766869 },
  'qingdao-shilaoren': { name: '石老人海水浴场（附近）', latitude: 36.09231, longitude: 120.47021 },
  'qingdao-jinshatan': { name: '青岛金沙滩（附近）', latitude: 35.9609, longitude: 120.2417 },
  'weihai-international': { name: '威海国际海水浴场', latitude: 37.527543, longitude: 122.042078 },
  'rizhao-wanpingkou': { name: '万平口海滨风景区（3号停车场附近）', latitude: 35.424022, longitude: 119.569466 }
}
const weights = { '少量': 1, '一般': 2, '较多': 3, '满载': 4 }
const radians = value => value * Math.PI / 180
const distanceMeters = (from, to) => {
  const radius = 6371000
  const dLat = radians(to.latitude - from.latitude)
  const dLng = radians(to.longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}
const isoTime = value => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

async function summaries() {
  const since = new Date(Date.now() - 14 * 86400000)
  try {
    const result = await db.collection('field_reports').where({ createdAt: command.gte(since), verified: true }).limit(100).get()
    const grouped = {}
    ;(result.data || []).forEach(item => {
      if (!grouped[item.spotId]) grouped[item.spotId] = { spotId: item.spotId, count: 0, total: 0 }
      grouped[item.spotId].count += 1
      grouped[item.spotId].total += Number(item.amountWeight || 0)
    })
    return { ok: true, summaries: Object.values(grouped).map(item => ({ spotId: item.spotId, count: item.count, average: Number((item.total / item.count).toFixed(2)) })) }
  } catch (error) {
    console.warn('field_reports unavailable', error)
    return { ok: true, summaries: [], needsCollection: true }
  }
}

async function feed() {
  try {
    const result = await db.collection('field_reports').orderBy('createdAt', 'desc').limit(30).get()
    const items = (result.data || []).map(item => ({
      id: item._id,
      spotId: item.spotId,
      spotName: item.spotName || spots[item.spotId] && spots[item.spotId].name || '已核验地点',
      species: String(item.species || '其他').slice(0, 12),
      amount: weights[item.amount] ? item.amount : '已记录',
      note: String(item.note || '').slice(0, 120),
      verified: item.verified === true,
      createdAt: isoTime(item.createdAt)
    }))
    return { ok: true, items }
  } catch (error) {
    console.warn('field_reports feed unavailable', error)
    return { ok: true, items: [], needsCollection: true }
  }
}

async function submit(event) {
  const context = cloud.getWXContext()
  const target = spots[event.spotId]
  if (!target) return { ok: false, error: '请选择已收录的赶海地点' }
  if (!weights[event.amount]) return { ok: false, error: '请选择收获量' }
  const now = new Date()
  try {
    const duplicate = await db.collection('field_reports').where({ _openid: context.OPENID, createdAt: command.gte(new Date(Date.now() - 10 * 60000)) }).limit(1).get()
    if (duplicate.data && duplicate.data.length) return { ok: false, error: '10分钟内请勿重复发布' }
    const result = await db.collection('field_reports').add({ data: {
      spotId: event.spotId,
      spotName: target.name,
      species: String(event.species || '其他').slice(0, 12),
      amount: event.amount,
      amountWeight: weights[event.amount],
      note: String(event.note || '').slice(0, 120),
      verified: false,
      verificationLabel: '用户自选地点',
      observedAt: now,
      createdAt: now
    } })
    return { ok: true, id: result._id, verified: false }
  } catch (error) {
    console.error('report submit failed', error)
    return { ok: false, error: '请先在云数据库创建 field_reports 集合并部署 report 云函数' }
  }
}

exports.main = event => {
  if (event && event.action === 'submit') return submit(event)
  if (event && event.action === 'feed') return feed()
  return summaries()
}
