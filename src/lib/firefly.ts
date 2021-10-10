import axios from 'axios'
import dayjs from 'dayjs'
import debug from 'debug'
import querystring from 'querystring'

import { getUserStorage } from './storage'

const log = debug(`bot:Firefly`)

export default class Firefly {

  static async getSystemInfo(userId: number) {
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.get('/about', config)
      log('about data: %O', res.data.data)
      return res.data.data
    } catch (err) {
      console.log('Error occurred getting system info: ', err)
      return null
    }
  }

  static async getBudgets(userId: number) {
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.get('/budgets', config)
      console.log('budgets: ', res.data.data)
      return res.data.data
    } catch (err) {
      console.log('Error occurred getting budgets: ', err)
    }
  }

  static async getAccounts(type = 'asset', userId: number) {
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.get(`/accounts?type=${type}`, config)
      return res.data.data
    } catch (err) {
      console.log('Error occurred getting accounts: ', err)
    }
  }

  static async getCategories(userId: number) {
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.get('/categories', config)
      return res.data.data
    } catch (err) {
      console.log('Error occurred getting categories: ', err)
    }
  }

  static async createTransaction(transaction: ITransaction, userId: number) {
    log('createTransaction: %O, %O', transaction, userId)
    try {
      const config = getAxiosConfigForUser(userId)
      const {
        amount,
        description = 'N/A',
        categoryName,
        budget,
        sourceId,
        sourceName,
        destinationId,
        destinationName
      } = transaction

      const t: ITransactionPayload = {
        type: 'withdrawal',
        description,
        date: dayjs().format(),
        amount,
        category_name: categoryName,
        budget_name: budget,
      }
      if (sourceId) t.source_id = sourceId
      if (sourceName) t.source_name = sourceName
      if (destinationId) t.destination_id = destinationId
      if (destinationName) t.destination_name = destinationName

      // Get rid of empty or nulluble values
      for (const key of Object.keys(t)) {
        if (!t[key]) delete t[key]
      }

      const payload = { transactions: [t] }
      const res = await axios.post('/transactions', payload, config)
      log('res.data: %O', res.data)
      return res.data.data
    } catch (err) {
      console.error('Error occurred creating transaction: ', err)
    }
  }

  static async deleteTransaction(transactionId: number | string, userId: number) {
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.delete(`/transactions/${transactionId}`, config)
      return res.data
    } catch (err) {
      console.error('Error occurred deleting transaction: ', err)
    }
  }

  static async listTransactions(userId: number) {
    try {
      const config = getAxiosConfigForUser(userId)
      const start = dayjs().subtract(7, 'day').format('YYYY-MM-DD')
      const end = dayjs().format('YYYY-MM-DD')
      const type = 'withdrawal'

      const res = await axios.get(
        `/transactions?${querystring.stringify({ start, end, type })}`,
        config
      )
      return res.data
    } catch (err) {
      console.error('Error occurred getting transactions: ', err)
    }
  }
}

export type ITransaction = {
  amount: number,
  description?: string,
  categoryName?: string,
  sourceName: string,
  sourceId?: number,
  budget?: string,
  destinationId?: number
  destinationName?: string
}

export type ICreatedTransaction = {
  transaction_journal_id: string,
  type: string,
  amount: string,
  date: string,
  currency_symbol: string,
  description: string,
  category_name: string
}

interface ITransactionPayload {
  [key: string]: any
  type: 'withdrawal'
  date: string
  amount: number
  description: string
  source_id?: number | null
  destination_id?: number | null
  source_name?: string | null
  destination_name?: string | null
  category_name?: string | null
  category_id?: string | null
  budget_name?: string
}

function getAxiosConfigForUser(userId: number) {
  try {
    const { fireflyUrl, fireflyAccessToken } = getUserStorage(userId)

    if (!fireflyUrl || !fireflyAccessToken) {
      throw new Error('Firefly URL or Firefly Access Token is not set hence a valid Axios config can not be created')
    }

    const config = {
      baseURL: `${fireflyUrl}/api/v1/`,
      headers: {
        Authorization: `Bearer ${fireflyAccessToken}`
      }
    }

    log('Axios config: %O', config)

    return config
  } catch (err) {
    console.error('Error occurred generating Axios config: ', err)
    throw err
  }
}
