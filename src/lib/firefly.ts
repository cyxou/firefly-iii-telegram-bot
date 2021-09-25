import axios from 'axios'
import dayjs from 'dayjs'
import debug from 'debug'
import querystring from 'querystring'

import config from '../config'
import { getDataFromUserStorage } from './storage'

const log = debug(`bot:Firefly`)

export default class Firefly {

  static async getSystemInfo(userId: number) {
    const config = getAxiosConfigForUser(userId)
    try {
      const res = await axios.get('/about', config)
      log('about data: %O', res.data.data)
      return res.data.data
    } catch (err) {
      console.log('Error occurred getting system info: ', err)
      return null
    }

  }

  static async getBudgets(userId: number) {
    const config = getAxiosConfigForUser(userId)
    try {
      const res = await axios.get('/budgets', config)
      console.log('budgets: ', res.data.data)
      return res.data.data
    } catch (err) {
      console.log('Error occurred getting budgets: ', err)
    }
  }

  static async getAccounts(type = 'asset', userId: number) {
    const config = getAxiosConfigForUser(userId)
    log('Axios config: %O', config)
    try {
      const res = await axios.get(`/accounts?type=${type}`, config)
      return res.data.data
    } catch (err) {
      console.log('Error occurred getting accounts: ', err)
    }
  }

  static async getCategories(userId: number) {
    const config = getAxiosConfigForUser(userId)
    try {
      const res = await axios.get('/categories', config)
      return res.data.data
    } catch (err) {
      console.log('Error occurred getting categories: ', err)
    }
  }

  static async createTransaction(transaction: ITransaction, userId: number) {
    log('createTransaction: %O, %O', transaction, userId)
    const config = getAxiosConfigForUser(userId)
    try {
      const {
        amount,
        description = 'Расход по категории',
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
    const config = getAxiosConfigForUser(userId)
    try {
      const res = await axios.delete(
        `/transactions/${transactionId}`,
        config
      )
      return res.data
    } catch (err) {
      console.error('Error occurred deleting transaction: ', err)
    }
  }

  static async listTransactions(userId: number) {
    const config = getAxiosConfigForUser(userId)
    try {
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


export interface ITransaction {
  amount: number,
  description?: string,
  categoryName?: string,
  sourceName: string,
  sourceId?: number,
  budget?: string,
  destinationId?: number
  destinationName?: string
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
  const { fireflyUrl, fireflyAccessToken } = getDataFromUserStorage(userId)
  return  {
    baseURL: `${fireflyUrl}/api/v1/`,
    headers: {
      Authorization: `Bearer ${fireflyAccessToken}`
    }
  }
}
/**

def create_transaction(self, amount, description, source_account, destination_account=None, category=None, budget=None):
        now = datetime.datetime.now()
        payload = {
            "transactions": [{
                "type": "withdrawal",
                "description": description,
                "date": now.strftime("%Y-%m-%d"),
                "amount": amount,
                "budget_name": budget,
                "category_name": category,
            }]
        }
        if source_account.isnumeric():
            payload["transactions"][0]["source_id"] = source_account
        else:
            payload["transactions"][0]["source_name"] = source_account

        if destination_account:
            if destination_account.isnumeric():
                payload["transactions"][0]["destination_id"] = destination_account
            else:
                payload["transactions"][0]["destination_name"] = destination_account
        else:
            payload["transactions"][0]["destination_name"] = description

        return self._post(endpoint="transactions", payload=payload)

*/
