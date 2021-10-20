import axios from 'axios'
import debug from 'debug'

import { getAxiosConfigForUser } from './helpers'

const rootLog = debug(`bot:Firefly:budgets`)

async function getBudgets(userId: number) {
  const log = rootLog.extend('getBudgets')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.get('/budgets', config)
    log('budgets: ', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred getting budgets: ', err)
  }
}
