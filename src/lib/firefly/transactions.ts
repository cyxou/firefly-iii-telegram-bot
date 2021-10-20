import axios from 'axios'
import dayjs from 'dayjs'
import debug from 'debug'
import qs from 'qs'

import { getAxiosConfigForUser } from './helpers'

const rootLog = debug(`bot:Firefly:transactions`)

export default {
  listTransactions,
  createTransaction,
  deleteTransaction,
}

type TransactionType = 'withdrawal' | 'deposit' | 'transfer'


async function createWithdrawalTransaction(transaction: ITransaction, userId: number) {

}
async function createDepositTransaction(transaction: ITransaction, userId: number) {

}
async function createTransferTransaction(transaction: ITransaction, userId: number) {

}

async function createTransaction(transaction: ITransaction, userId: number) {
  const log = rootLog.extend('createTransaction')
  log('transaction: %O', transaction)
  try {
    const config = getAxiosConfigForUser(userId)
    const {
      type,
      amount,
      description = 'N/A',
      categoryId,
      budget,
      sourceId,
      sourceName,
      destinationId,
      destinationName
    } = transaction

    const t: ITransactionPayload = {
      type,
      description,
      date: dayjs().format(),
      amount,
      category_id: categoryId,
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
    throw err
  }
}

// amount: "1000"
// date: "2021-10-21"
// description: "ЗП"
// destination_id: "11"
// destination_name: "🏦 [БПС] Счет карты"
// source_id: 10
// type: "deposit"

async function deleteTransaction(transactionId: number | string, userId: number) {
  const log = rootLog.extend('deleteTransaction')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.delete(`/transactions/${transactionId}`, config)
    log('result data: %O', res.data.data)
    return res.data
  } catch (err) {
    console.error('Error occurred deleting transaction: ', err)
    throw err
  }
}

async function listTransactions(userId: number) {
  const log = rootLog.extend('listTransactions')
  try {
    const config = getAxiosConfigForUser(userId)
    const start = dayjs().subtract(7, 'day').format('YYYY-MM-DD')
    const end = dayjs().format('YYYY-MM-DD')
    const type = 'withdrawal'

    const res = await axios.get(
      `/transactions?${qs.stringify({ start, end, type })}`,
      config
    )
    log('transactions: %O', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred getting transactions: ', err)
    throw err
  }
}

export type ICreatedTransaction = {
  transaction_journal_id: string,
  type: string,
  amount: string,
  date: string,
  currency_symbol: string,
  description: string,
  category_name: string
  destination_name: string
}

interface ITransactionPayload {
  [key: string]: any
  type: TransactionType
  date: string
  amount: number
  description: string
  source_id?: number | string
  destination_id?: number | string
  source_name?: string
  destination_name?: string
  category_name?: string
  category_id?: string | number
  budget_name?: string
}

export type ITransaction = {
  type: TransactionType
  amount: number,
  description?: string,
  categoryId?: number | string,
  sourceName?: string,
  sourceId?: number | string,
  budget?: string,
  destinationId?: number | string,
  destinationName?: string,
}
