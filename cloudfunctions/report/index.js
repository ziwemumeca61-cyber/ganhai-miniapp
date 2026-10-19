const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const command = db.command

const spots = require('./national-spots')
const weights = { '未发现': 0, '少量': 1, '一般': 2, '较多': 3, '满载': 4 }
const zoneLabels = { west: '参考点西侧', middle: '参考点附近', east: '参考点东侧', unknown: '未分段' }
const normalizeZoneId = value => Object.prototype.hasOwnProperty.call(zoneLabels, String(value || '')) ? String(value) : 'unknown'
const radians = value => value * Math.PI / 180
const distanceMeters = (from, to) => {
  const radius = 6371000
  const dLat = radians(to.latitude - from.latitude)
  const dLng = radians(to.longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
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
  const since = new Date(Date.now() - 90 * 86400000)
  try {
    const rows = await readAll(() => db.collection('field_reports').where({ createdAt: command.gte(since), verified: true }))
    const grouped = {}
    const generic = {}
    const byZone = {}
    rows.forEach(item => {
      const species = String(item.species || '其他').slice(0, 12)
      const found = item.found !== false && item.amount !== '未发现'
      const zoneId = normalizeZoneId(item.zoneId)
      const key = item.spotId + '|' + species + '|' + zoneId
      if (!grouped[key]) grouped[key] = { spotId: item.spotId, species, zoneId, zoneLabel: zoneLabels[zoneId], count: 0, positiveCount: 0, negativeCount: 0, total: 0 }
      const group = grouped[key]
      group.count += 1
      group[found ? 'positiveCount' : 'negativeCount'] += 1
      const zoneKey = item.spotId + '|' + zoneId
      if (!byZone[zoneKey]) byZone[zoneKey] = { spotId: item.spotId, species: '*', zoneId, zoneLabel: zoneLabels[zoneId], count: 0, positiveCount: 0, negativeCount: 0, total: 0 }
      const zoneGroup = byZone[zoneKey]
      zoneGroup.count += 1
      zoneGroup[found ? 'positiveCount' : 'negativeCount'] += 1
      if (Date.now() - new Date(item.createdAt).getTime() <= 14 * 86400000) {
        if (!generic[item.spotId]) generic[item.spotId] = { spotId: item.spotId, species: '*', count: 0, total: 0 }
        generic[item.spotId].count += 1
        generic[item.spotId].total += found ? Number(item.amountWeight || 0) : 0
      }
      if (found) {
        group.total += Number(item.amountWeight || 0)
        zoneGroup.total += Number(item.amountWeight || 0)
      }
    })
    const speciesSummaries = Object.values(grouped).map(item => Object.assign({}, item, { average: item.positiveCount ? Number((item.total / item.positiveCount).toFixed(2)) : 0, windowDays: 90 }))
    const genericSummaries = Object.values(generic).map(item => ({ spotId: item.spotId, species: '*', count: item.count, average: Number((item.total / item.count).toFixed(2)), windowDays: 14 }))
    const zoneSummaries = Object.values(byZone).map(item => Object.assign({}, item, { average: item.positiveCount ? Number((item.total / item.positiveCount).toFixed(2)) : 0, windowDays: 90 }))
    return { ok: true, summaries: genericSummaries.concat(zoneSummaries, speciesSummaries) }
  } catch (error) {
    console.warn('field_reports unavailable', error)
    return { ok: true, summaries: [], needsCollection: true }
  }
}

async function feedback(event) {
  const context = cloud.getWXContext()
  const target = spots[event.spotId]
  const types = ['位置不准', '入口封闭', '禁止采集', '入口建议', '赶海区建议', '其他']
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
  const species = String(event.species || '')
  if (['蛤蜊', '海螺', '海蛎子', '螃蟹', '海肠', '其他'].indexOf(species) < 0) return { ok: false, error: '请选择现场品类' }
  const found = event.found !== false
  const amount = found ? event.amount : '未发现'
  if (!Object.prototype.hasOwnProperty.call(weights, amount)) return { ok: false, error: '请选择收获量' }
  const zoneId = normalizeZoneId(event.zoneId)
  const rawLocation = event.location
  const latitude = Number(rawLocation && rawLocation.latitude)
  const longitude = Number(rawLocation && rawLocation.longitude)
  const accuracy = Number(rawLocation && rawLocation.accuracy)
  const hasLocation = Boolean(rawLocation) && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
  const accuracyReady = Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 300
  const onsiteDistance = hasLocation ? distanceMeters({ latitude, longitude }, target) : null
  const verified = hasLocation && accuracyReady && onsiteDistance <= 2500 + accuracy
  if (!hasLocation) return { ok: false, error: '匿名预测样本需要现场定位核验' }
  if (!accuracyReady) return { ok: false, error: '定位精度不足，请到室外重新定位' }
  if (!verified) return { ok: false, error: '当前位置距离所选地点较远，请到现场或改选正确地点' }
  const verificationLabel = '现场定位已核验'
  const now = new Date()
  try {
    const duplicate = await db.collection('field_reports').where({ _openid: context.OPENID, createdAt: command.gte(new Date(Date.now() - 10 * 60000)) }).limit(1).get()
    if (duplicate.data && duplicate.data.length) return { ok: false, error: '10分钟内请勿重复提交样本' }
    const result = await db.collection('field_reports').add({ data: {
      _openid: context.OPENID,
      spotId: event.spotId,
      cityId: target.cityId,
      spotName: target.name,
      species,
      zoneId,
      zoneLabel: zoneLabels[zoneId],
      found,
      amount,
      amountWeight: weights[amount],
      verified,
      verificationLabel,
      distanceMeters: onsiteDistance,
      locationAccuracy: accuracyReady ? Math.round(accuracy) : null,
      observedAt: now,
      createdAt: now
    } })
    return { ok: true, id: result._id, verified, verificationLabel, distanceMeters: onsiteDistance }
  } catch (error) {
    console.error('report submit failed', error)
    return { ok: false, error: '请先在云数据库创建 field_reports 集合并部署 report 云函数' }
  }
}

exports.main = event => {
  if (event && event.action === 'submit') return submit(event)
  if (event && event.action === 'feedback') return feedback(event)
  return summaries()
}
