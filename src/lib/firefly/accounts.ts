import axios from 'axios'
import debug from 'debug'

import { getAxiosConfigForUser } from './helpers'

const rootLog = debug(`bot:Firefly:accounts`)

export default {
  getAccounts
}

type AccountType = 'all' | 'asset' | 'cash' | 'expense' | 'revenue' | 'special' | 'hidden' | 'liability' | 'liabilities' | 'Default account' | 'Cash account' | 'Asset account' | 'Expense account' | 'Revenue account' | 'Initial balance account' | 'Beneficiary account' | 'Import account' | 'Reconciliation account' | 'Loan' | 'Debt' | 'Mortgage'

async function getAccounts(type: AccountType, userId: number) {
  const log = rootLog.extend('getAccounts')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.get(`/accounts?type=${type}`, config)
    log('accounts: %O', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred getting accounts: ', err)
    throw err
  }
}
