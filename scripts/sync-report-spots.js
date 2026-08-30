const fs = require('fs')
const path = require('path')
const { spots } = require('../utils/data')

const output = {}
spots.forEach(item => {
  output[item.id] = {
    name: item.name,
    cityId: item.cityId || 'yantai',
    latitude: item.latitude,
    longitude: item.longitude,
    collectible: String(item.harvest || '').indexOf('仅观察') < 0
  }
})

const target = path.resolve(__dirname, '../cloudfunctions/report/national-spots.js')
fs.writeFileSync(target, '// 由 scripts/sync-report-spots.js 生成，请勿手工修改。\nmodule.exports = ' + JSON.stringify(output, null, 2) + '\n')
console.log('已同步 ' + Object.keys(output).length + ' 个地点到 report 云函数白名单')
