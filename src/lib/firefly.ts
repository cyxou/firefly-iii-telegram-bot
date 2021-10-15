import axios from 'axios'
import dayjs from 'dayjs'
import debug from 'debug'
import querystring from 'querystring'

import { getUserStorage } from './storage'

const rootLog = debug(`bot:Firefly`)

export default class Firefly {

  static async getSystemInfo(userId: number) {
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

  static async getBudgets(userId: number) {
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

  static async getAccounts(type = 'asset', userId: number) {
    const log = rootLog.extend('getAccounts')
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.get(`/accounts?type=${type}`, config)
      log('accounts: %O', res.data.data)
      return res.data.data
    } catch (err) {
      console.error('Error occurred getting accounts: ', err)
    }
  }

  static async getCategories(userId: number) {
    const log = rootLog.extend('getCategories')
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.get('/categories', config)
      log('categories: %O', res.data.data)
      return res.data.data
    } catch (err) {
      console.error('Error occurred getting categories: ', err)
    }
  }

  static async getCategory(categoryId: string, userId: number) {
    const log = rootLog.extend('getCategory')
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.get(`/categories/${categoryId}`, config)
      log('category: %O', res.data.data)
      return res.data.data
    } catch (err) {
      console.error('Error occurred getting category: ', err)
    }
  }

  static async createCategory(category: ICategory, userId: number, ) {
    const log = rootLog.extend('createCategory')
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.post('/categories', category, config)
      log('category: %O', res.data.data)
      return res.data.data
    } catch (err) {
      console.error('Error occurred creating a category: ', err)
    }
  }

  static async editCategory(categoryId: string, category: ICategory, userId: number, ) {
    const log = rootLog.extend('editCategory')
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.put(`/categories/${categoryId}`, category, config)
      log('category: %O', res.data.data)
      return res.data.data
    } catch (err) {
      console.error('Error occurred editing a category: ', err)
    }
  }

  static async deleteCategory(categoryId: number | string, userId: number) {
    const log = rootLog.extend('deleteCategory')
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.delete(`/categories/${categoryId}`, config)
      log('result data: %O', res.data.data)
      return res.data
    } catch (err) {
      console.error('Error occurred deleting category: ', err)
    }
  }

  static async createTransaction(transaction: ITransaction, userId: number) {
    const log = rootLog.extend('createTransaction')
    log('transaction: %O', transaction)
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
      log('transaction: %O', res.data.data)
      return res.data.data
    } catch (err) {
      console.error('Error occurred creating transaction: ', err)
    }
  }

  static async deleteTransaction(transactionId: number | string, userId: number) {
    const log = rootLog.extend('deleteTransaction')
    try {
      const config = getAxiosConfigForUser(userId)
      const res = await axios.delete(`/transactions/${transactionId}`, config)
      log('result data: %O', res.data.data)
      return res.data
    } catch (err) {
      console.error('Error occurred deleting transaction: ', err)
    }
  }

  static async listTransactions(userId: number) {
    const log = rootLog.extend('listTransactions')
    try {
      const config = getAxiosConfigForUser(userId)
      const start = dayjs().subtract(7, 'day').format('YYYY-MM-DD')
      const end = dayjs().format('YYYY-MM-DD')
      const type = 'withdrawal'

      const res = await axios.get(
        `/transactions?${querystring.stringify({ start, end, type })}`,
        config
      )
      log('transactions: %O', res.data.data)
      return res.data.data
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

export type ICategory = {
  name: string,
  notes?: string
  id?: string
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
  const log = rootLog.extend('getAxiosConfigForUser')
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
