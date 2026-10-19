// 无网络回归检查：node scripts/test-startup.js
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const root = path.resolve(__dirname, '..')
const source = name => fs.readFileSync(path.join(root, name), 'utf8')
const data = require('../utils/data')
const presentation = require('../utils/presentation')
const flush = async () => { for (let i = 0; i < 15; i += 1) await Promise.resolve() }

function clockAt(iso = '2026-10-19T08:00:00Z') {
  let now = Date.parse(iso), id = 0
  const timers = new Map()
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])) }
    static now() { return now }
  }
  return {
    Date: ClockDate,
    now: () => now,
    setTimeout(fn, delay) { const key = ++id; timers.set(key, { at: now + delay, fn }); return key },
    clearTimeout(key) { timers.delete(key) },
    tick(ms) {
      now += ms
      for (const [key, task] of [...timers]) if (task.at <= now) { timers.delete(key); task.fn() }
    }
  }
}

function fixture(clock, blocked = false) {
  return {
    version: 'test', checkedAt: new Date(clock.now()).toISOString(), source: '测试海况',
    conditions: { dataReady: true, blocked, reasons: blocked ? ['风浪预警'] : [], tideScore: 40, seaWeatherScore: 36, nextLow: '17:00', window: '15:00—17:30', weatherLabel: '20℃ · 风速10km/h' }
  }
}

function apiHarness(clock, storage = new Map()) {
  const calls = [], writes = [], app = { globalData: { cloudEnabled: true, selectedCityId: 'yantai', location: null } }
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync(key, value) { storage.set(key, value) },
    setStorage({ key, data: value }) { writes.push({ key, value }); storage.set(key, value) },
    cloud: { callFunction(request) { return new Promise((resolve, reject) => calls.push({ ...request, resolve: value => resolve({ result: value }), reject })) } },
    stopPullDownRefresh() {}, showToast() {}, nextTick(fn) { this.nextFrame = fn }
  }
  const exports = {}
  const sandbox = { module: { exports }, require: () => data, getApp: () => app, wx, Date: clock.Date, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console: { warn() {} } }
  vm.runInNewContext(source('services/api.js'), sandbox)
  return { api: sandbox.module.exports, calls, writes, app, wx }
}

async function testRequestsAndFreshness() {
  const clock = clockAt(), h = apiHarness(clock)
  const local = h.api.getHomeSnapshot(null, 'yantai')
  assert(local.spots.length > 0)
  assert.strictEqual(local.summary.dataReady, false)
  assert(local.spots.every(spot => spot.safetyScore === null))
  assert.strictEqual(h.calls.length, 0, '首屏不发请求')
  const updates = []
  const p1 = h.api.getHomeData({ latitude: 37.987654, longitude: 121.123456 }, 'yantai', { onUpdate: value => updates.push(value) })
  const p2 = h.api.getHomeData({ latitude: 37.54, longitude: 121.4 }, 'yantai')
  await flush()
  assert.strictEqual(h.calls.filter(call => call.name === 'forecast').length, 1)
  assert.strictEqual(h.calls.filter(call => call.name === 'report').length, 1)
  assert(!JSON.stringify(h.calls).includes('37.987654'), '用户位置不发送至云端')
  h.calls.find(call => call.name === 'forecast').resolve(fixture(clock))
  await flush()
  const ready = await p1
  await p2
  assert(ready.summary.dataReady, '样本请求未结束也应显示海况')
  assert(!JSON.stringify(h.writes).includes('37.987654'), '用户位置不进入持久缓存')
  h.calls.find(call => call.name === 'report').resolve({ ok: true, summaries: [] })
  await flush()
  assert(updates.length > 0, '样本随后更新')
  const before = h.calls.length
  await h.api.getHomeData(null, 'yantai')
  assert.strictEqual(h.calls.length, before, '两分钟内跨页/重新定位复用海况')
  const refresh = h.api.getHomeData(null, 'yantai', { force: true })
  await flush()
  const forced = h.calls.filter(call => call.name === 'forecast').at(-1)
  assert.strictEqual(forced.data.forceRefresh, true)
  forced.resolve({ reason: '测试超时', conditions: { dataReady: false } })
  h.calls.filter(call => call.name === 'report').at(-1).resolve({ ok: true, summaries: [] })
  const fallback = await refresh
  assert(fallback.summary.dataReady)
  assert(fallback.summary.cacheNotice && fallback.summary.failureReason)
  const anotherCity = h.api.getHomeSnapshot(null, 'qingdao')
  assert(!anotherCity.summary.dataReady)
  clock.tick(10 * 60 * 1000 + 1)
  const expired = h.api.getHomeSnapshot(null, 'yantai')
  assert(!expired.summary.dataReady)
  assert(expired.spots.every(spot => spot.safetyScore === null))

  const midnight = clockAt('2026-10-19T16:01:00Z')
  const cache = fixture(midnight)
  cache.checkedAt = '2026-10-19T15:59:00Z'
  const disk = new Map([['coastal_forecast_v1_yantai', { cityId: 'yantai', value: cache }]])
  assert(!apiHarness(midnight, disk).api.getHomeSnapshot(null, 'yantai').summary.dataReady, '跨北京时间零点不沿用昨日日潮汐')

  const timeoutClock = clockAt(), timeout = apiHarness(timeoutClock)
  const waiting = timeout.api.getHomeData(null, 'yantai')
  await flush(); timeoutClock.tick(15001); await flush()
  const failure = await waiting
  assert(!failure.summary.dataReady && /超时/.test(failure.summary.failureReason))
}

async function testFirstFrameAndRace() {
  const clock = clockAt(), h = apiHarness(clock)
  let page, locationRequests = 0
  const payloads = []
  vm.runInNewContext(source('pages/index/index.js'), {
    require(name) { return name.includes('/api') ? h.api : name.includes('presentation') ? presentation : { getLocation() { locationRequests += 1 } } },
    Page(value) { page = value }, getApp: () => h.app, wx: h.wx, Date: clock.Date,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout
  })
  page.data = structuredClone(page.data)
  page.setData = function (value) { payloads.push(value); Object.assign(this.data, value) }
  page.onLoad(); page.onShow()
  assert.strictEqual(h.calls.length, 0)
  assert.strictEqual(locationRequests, 0, '首帧不等待/启动高精度定位')
  assert(page.data.visibleSpots.length > 0 && !page.data.loading)
  assert(!('conditions' in page.data.summary) && !('spots' in page.data), '渲染桥不传完整条件与全城地点')
  const fullPayload = JSON.stringify(h.api.getHomeSnapshot(null, 'yantai')).length
  const lightPayload = JSON.stringify(payloads.find(value => value.visibleSpots)).length
  assert(lightPayload < fullPayload / 2)
  h.wx.nextFrame(); await flush()
  assert.strictEqual(locationRequests, 1)
  const old = h.calls.find(call => call.name === 'forecast')
  page.chooseCity({ detail: { value: 1 } }); await flush()
  const current = h.calls.filter(call => call.name === 'forecast').at(-1)
  current.resolve(fixture(clock)); await flush()
  const selected = page.data.cityId
  old.resolve(fixture(clock)); await flush()
  assert.strictEqual(page.data.cityId, selected)
  assert(page.data.visibleSpots.every(spot => data.spots.some(item => item.id === spot.id && item.cityId === selected)))
  h.calls.find(call => call.name === 'report').resolve({ ok: true, summaries: [] }); await flush()
  page.showMoreSpots()
  const expanded = page.data.visibleSpots.length
  page.loadData(); await flush()
  assert.strictEqual(page.data.visibleSpots.length, expanded)
  clock.tick(10 * 60 * 1000 + 25); await flush()
  assert(!page.data.summary.dataReady, '前台停留超过缓存有效期后停止旧评分')
  page.onHide()
  console.log('首屏渲染载荷（测试城市）：', fullPayload, '→', lightPayload, 'bytes')
}

async function testSampleInvalidation() {
  const clock = clockAt(), h = apiHarness(clock)
  const first = h.api.getHomeData(null, 'yantai')
  await flush()
  const oldReport = h.calls.find(call => call.name === 'report')
  h.calls.find(call => call.name === 'forecast').resolve(fixture(clock))
  const ready = await first
  h.api.invalidateReportCache()
  await h.api.getHomeData(null, 'yantai')
  await flush()
  const reports = h.calls.filter(call => call.name === 'report')
  assert.strictEqual(reports.length, 2, '提交后不能合并到提交前的样本请求')
  const id = ready.spots[0].id
  reports[1].resolve({ ok: true, summaries: [{ spotId: id, species: '*', count: 20, average: 3, windowDays: 14 }] })
  await flush()
  oldReport.resolve({ ok: true, summaries: [] })
  await flush()
  assert.strictEqual(h.api.getHomeSnapshot(null, 'yantai').spots.find(spot => spot.id === id).sampleCount, 20, '迟到的旧样本不覆盖提交后的新样本')
}

function testLocation() {
  const clock = clockAt(), requests = [], app = { globalData: {} }, module = { exports: {} }
  vm.runInNewContext(source('utils/location.js'), {
    module, getApp: () => app, wx: { getLocation: value => requests.push(value) },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, console
  })
  const progress = [], finals = []
  module.exports.getLocation((error, value) => finals.push(value), { onProgress: value => progress.push(value.accuracy) })
  module.exports.getLocation((error, value) => finals.push(value))
  assert.strictEqual(requests.length, 1)
  requests[0].success({ latitude: 37.5, longitude: 121.4, accuracy: 250 })
  assert.strictEqual(progress[0], 250)
  assert.strictEqual(finals.length, 0)
  requests[1].success({ latitude: 37.501, longitude: 121.401, accuracy: 35 })
  assert.strictEqual(finals.length, 2)
  assert.strictEqual(finals[0].accuracy, 35)
  const errors = []
  module.exports.getLocation(error => errors.push(error))
  const before = requests.length
  requests.at(-1).fail({ errMsg: 'getLocation:fail auth deny' })
  assert.strictEqual(requests.length, before, '拒绝授权不连试三次')
  assert.strictEqual(errors.length, 1)
}

async function testForecast() {
  const clock = clockAt(), exports = {}, cached = fixture(clock), cloud = {
    init() {}, DYNAMIC_CURRENT_ENV: 'test',
    database: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: { value: cached } }) }) }) })
  }
  const box = {
    exports, require: name => name === 'wx-server-sdk' ? cloud : require(name),
    Date: clock.Date, URL, console, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout
  }
  vm.runInNewContext(source('cloudfunctions/forecast/index.js') + '\nexports.test = { parseArticle, articleLinks, modelConditions };', box)
  const test = exports.test
  const today = '烟台市海洋预报（10月19日0时-10月20日0时）'
  const url = 'https://hyj.yantai.gov.cn/col/col1638/art/2026/art_today.html'
  const article = today + ' 东部海域（黄渤海新区至牟平区）将有0.5米的轻浪增至1.5米的中浪，风浪向南转北；蓬长海域将有0.5到1.8米的风浪，风浪向北；西部海域将有0.5米减至0.3米的风浪，风浪向南；南部海域将有0.8米的风浪，风浪向北；芝罘近岸海域 03:00 16:00 09:00 22:00 黄渤海新区近岸海域 02:00 15:00 08:00 21:00'
  const parsed = test.parseArticle(article, url)
  assert.strictEqual(parsed.date, '2026-10-19')
  assert.strictEqual(parsed.waves.east.max, 1.5)
  assert.strictEqual(parsed.waves.pengchang.max, 1.8)
  assert(parsed.tides.development)
  assert(test.parseArticle(article.replaceAll('黄渤海新区', '开发区'), url), '兼容旧名称')
  const list = '<a href="/col/col1638/art/2026/art_future.html">烟台市海洋预报（10月20日0时-10月21日0时）</a><a href="/col/col1638/art/2026/art_warning.html">海洋环境监测预报中心风暴潮 I...</a><a href="/col/col1638/art/2026/art_today.html">' + today + '</a>'
  const links = test.articleLinks(list, 'https://hyj.yantai.gov.cn')
  assert.strictEqual(links.length, 1)
  assert.strictEqual(links[0], url)
  const invalid = { hourly: { time: ['2026-10-19T16:00', '2026-10-19T17:00', '2026-10-19T18:00'], wave_height: [null, null, null], sea_level_height_msl: [null, null, null] } }
  assert.strictEqual(test.modelConditions({ current: { temperature_2m: 20, wind_speed_10m: 10 } }, invalid, '测试'), null, '缺失海况不按零浪高评分')
  const warm = await exports.main({ cityId: 'yantai' })
  assert(warm.cached && warm.version === 'forecast-20261019.1', '云端新鲜缓存不必重抓外网')
}

;(async () => {
  await testRequestsAndFreshness()
  await testFirstFrameAndRace()
  await testSampleInvalidation()
  testLocation()
  await testForecast()
  console.log('PASS: 首帧、请求复用、样本旁路、隐私、缓存过期/跨日、慢请求、城市竞争、定位进度、官方解析与缓存')
})().catch(error => { console.error(error); process.exitCode = 1 })
