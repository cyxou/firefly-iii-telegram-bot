import axios from 'axios'
import dayjs from 'dayjs'
import debug from 'debug'
import qs from 'qs'

import { getAxiosConfigForUser } from './helpers'

const rootLog = debug(`bot:Firefly:insight`)

export default {
  getInsightExpenseCategory
}

async function getInsightExpenseCategory(
  {
    start = dayjs().format('YYYY-MM-DD'),
    end = dayjs().format('YYYY-MM-DD'),
    categories = [] as number[],
    accounts = [] as number[],
  },
  userId: number
) {
  const log = rootLog.extend('getInsightExpenseCategory')
  try {
    const config = getAxiosConfigForUser(userId)
    start = dayjs(start).format('YYYY-MM-DD')
    end = dayjs(end).format('YYYY-MM-DD')
    log('start: %O', start)
    log('end: %O', end)
    log('categories: %O', categories)
    log('accounts: %O', accounts)

    const params = qs.stringify({ start, end, categories, accounts })
    log('params: %O', params)
    const res = await axios.get(
      `/insight/expense/category?${params}`,
      config
    )
    log('category expense insight: %O', res.data)
    return res.data
  } catch (err) {
    console.error(err)
    console.error('Error occurred getting expense category insight: ', err)
    throw err
  }
}
