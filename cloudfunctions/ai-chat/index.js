/*
 * CloudBase AI adapter.
 *
 * The mini-program currently runs in demo mode so it can be previewed without
 * an environment ID. After the growth-plan environment is created, wire the
 * Hunyuan model here and keep all provider credentials server-side.
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const question = (event && event.question) || ''
  return {
    ok: true,
    mode: 'adapter-ready',
    question,
    answer: 'AI服务接口已预留。接入云开发成长计划后，这里会读取天气、潮汐、地点和战果数据，再生成回答。'
  }
}
