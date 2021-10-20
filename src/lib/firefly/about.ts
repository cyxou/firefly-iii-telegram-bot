import axios from 'axios'
import debug from 'debug'

import { getAxiosConfigForUser } from './helpers'

const rootLog = debug(`bot:Firefly:about`)

export default {
  getUserInfo,
  getSystemInfo
}

async function getSystemInfo(userId: number) {
  const log = rootLog.extend('getSystemInfo')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.get('/about', config)
    log('about data: %O', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred getting system info: ', err)
    return null
  }
}

async function getUserInfo(userId: number) {
  const log = rootLog.extend('getUserInfo')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.get('/about/user', config)
    log('about data: %O', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred getting system info: ', err)
    return null
  }
}

