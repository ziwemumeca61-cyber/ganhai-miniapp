const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const command = db.command

const spots = require('./national-spots')
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

async function readAll(queryFactory, pageSize = 100, maxPages = 50) {
  const rows = []
  for (let page = 0; page < maxPages; page += 1) {
    const result = await queryFactory().skip(page * pageSize).limit(pageSize).get()
    const batch = result.data || []
    rows.push.apply(rows, batch)
    if (batch.length < pageSize) break
  }
  return rows
}

async function summaries() {
  const since = new Date(Date.now() - 14 * 86400000)
  try {
    const aggregate = db.command.aggregate
    if (aggregate) {
      const result = await db.collection('field_reports').aggregate()
        .match({ createdAt: command.gte(since), verified: true })
        .group({ _id: '$spotId', count: aggregate.sum(1), total: aggregate.sum('$amountWeight') })
        .end()
      const list = result.list || []
      return { ok: true, summaries: list.map(item => ({ spotId: item._id, count: item.count, average: Number((item.total / item.count).toFixed(2)) })) }
    }
    throw new Error('聚合能力不可用')
  } catch (aggregateError) {
    try {
      const rows = await readAll(() => db.collection('field_reports').where({ createdAt: command.gte(since), verified: true }))
      const grouped = {}
      rows.forEach(item => {
        if (!grouped[item.spotId]) grouped[item.spotId] = { spotId: item.spotId, count: 0, total: 0 }
        grouped[item.spotId].count += 1
        grouped[item.spotId].total += Number(item.amountWeight || 0)
      })
      return { ok: true, summaries: Object.values(grouped).map(item => ({ spotId: item.spotId, count: item.count, average: Number((item.total / item.count).toFixed(2)) })) }
    } catch (error) {
      console.warn('field_reports unavailable', aggregateError, error)
      return { ok: true, summaries: [], needsCollection: true }
    }
  }
}

async function feed(event) {
  try {
    const selectedCityId = String(event && event.cityId || '').slice(0, 40)
    let records
    try {
      const query = selectedCityId
        ? db.collection('field_reports').where({ cityId: selectedCityId })
        : db.collection('field_reports')
      const result = await query.orderBy('createdAt', 'desc').limit(30).get()
      records = result.data || []
    } catch (indexError) {
      const rows = await readAll(() => selectedCityId
        ? db.collection('field_reports').where({ cityId: selectedCityId })
        : db.collection('field_reports'))
      records = rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30)
    }
    const items = records.map(item => ({
      id: item._id,
      cityId: item.cityId || 'yantai',
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

async function feedback(event) {
  const context = cloud.getWXContext()
  const target = spots[event.spotId]
  const types = ['位置不准', '入口封闭', '禁止采集', '入口建议', '其他']
  const issueType = String(event.issueType || '')
  const note = String(event.note || '').trim().slice(0, 200)
  if (!target) return { ok: false, error: '未找到这个地点' }
  if (types.indexOf(issueType) < 0) return { ok: false, error: '请选择反馈类型' }
  if (!note) return { ok: false, error: '请补充具体情况' }
  try {
    const recent = await db.collection('spot_feedback').where({ _openid: context.OPENID, createdAt: command.gte(new Date(Date.now() - 5 * 60000)) }).limit(1).get()
    if (recent.data && recent.data.length) return { ok: false, error: '反馈已收到，5分钟内请勿重复提交' }
    await db.collection('spot_feedback').add({ data: {
      _openid: context.OPENID,
      spotId: event.spotId,
      cityId: target.cityId,
      spotName: target.name,
      issueType,
      note,
      status: 'pending',
      createdAt: new Date()
    } })
    return { ok: true }
  } catch (error) {
    console.error('spot feedback failed', error)
    return { ok: false, error: '请先创建 spot_feedback 集合并重新部署 report 云函数' }
  }
}

async function submit(event) {
  const context = cloud.getWXContext()
  const target = spots[event.spotId]
  if (!target) return { ok: false, error: '请选择已收录的赶海地点' }
  if (target.collectible === false) return { ok: false, error: '该地点仅供生态观察，不开放收获上报' }
  if (!weights[event.amount]) return { ok: false, error: '请选择收获量' }
  const latitude = Number(event.location && event.location.latitude)
  const longitude = Number(event.location && event.location.longitude)
  const accuracy = Number(event.location && event.location.accuracy)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false, error: '未收到有效定位，请重新核验' }
  if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 300) return { ok: false, error: '定位精度不足（需在300米内），请到室外重新定位' }
  const onsiteDistance = distanceMeters({ latitude, longitude }, target)
  if (onsiteDistance > 2500 + accuracy) return { ok: false, error: '当前位置距所选地点约' + Math.round(onsiteDistance / 100) / 10 + '公里，请到现场或改选正确地点' }
  const now = new Date()
  try {
    const duplicate = await db.collection('field_reports').where({ _openid: context.OPENID, createdAt: command.gte(new Date(Date.now() - 10 * 60000)) }).limit(1).get()
    if (duplicate.data && duplicate.data.length) return { ok: false, error: '10分钟内请勿重复发布' }
    const result = await db.collection('field_reports').add({ data: {
      _openid: context.OPENID,
      spotId: event.spotId,
      cityId: target.cityId,
      spotName: target.name,
      species: String(event.species || '其他').slice(0, 12),
      amount: event.amount,
      amountWeight: weights[event.amount],
      note: String(event.note || '').slice(0, 120),
      verified: true,
      verificationLabel: '现场定位已核验',
      distanceMeters: onsiteDistance,
      locationAccuracy: Math.round(accuracy),
      observedAt: now,
      createdAt: now
    } })
    return { ok: true, id: result._id, verified: true, distanceMeters: onsiteDistance }
  } catch (error) {
    console.error('report submit failed', error)
    return { ok: false, error: '请先在云数据库创建 field_reports 集合并部署 report 云函数' }
  }
}

exports.main = event => {
  if (event && event.action === 'submit') return submit(event)
  if (event && event.action === 'feed') return feed(event)
  if (event && event.action === 'feedback') return feedback(event)
  return summaries()
}
