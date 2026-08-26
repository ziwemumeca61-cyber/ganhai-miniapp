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
  'longkou-donghai-west': { name: '东海度假区西部夏季海水浴场', latitude: 37.715873, longitude: 120.411911 }
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
    const result = await db.collection('field_reports').where({ verified: true }).orderBy('createdAt', 'desc').limit(30).get()
    const items = (result.data || []).map(item => ({
      id: item._id,
      spotId: item.spotId,
      spotName: item.spotName || spots[item.spotId] && spots[item.spotId].name || '已核验地点',
      species: String(item.species || '其他').slice(0, 12),
      amount: weights[item.amount] ? item.amount : '已记录',
      note: String(item.note || '').slice(0, 120),
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
  const latitude = Number(event.latitude)
  const longitude = Number(event.longitude)
  const accuracy = Math.round(Number(event.accuracy))
  if (!target || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) return { ok: false, error: '上报内容或现场定位不完整' }
  if (accuracy < 1 || accuracy > 500) return { ok: false, error: '定位精度超过500米，请到开阔处重新定位' }
  const distance = distanceMeters({ latitude, longitude }, target)
  if (distance > 2000) return { ok: false, error: '当前位置距所选地点约' + (distance / 1000).toFixed(1) + '公里，不能计入现场样本' }
  if (!weights[event.amount]) return { ok: false, error: '请选择收获量' }
  const now = new Date()
  try {
    const duplicate = await db.collection('field_reports').where({ _openid: context.OPENID, createdAt: command.gte(new Date(Date.now() - 10 * 60000)) }).limit(1).get()
    if (duplicate.data && duplicate.data.length) return { ok: false, error: '10分钟内请勿重复上报' }
    const result = await db.collection('field_reports').add({ data: {
      spotId: event.spotId,
      spotName: target.name,
      species: String(event.species || '其他').slice(0, 12),
      amount: event.amount,
      amountWeight: weights[event.amount],
      note: String(event.note || '').slice(0, 120),
      accuracy,
      distanceM: distance,
      verified: true,
      observedAt: now,
      createdAt: now
    } })
    return { ok: true, id: result._id, distanceM: distance }
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
