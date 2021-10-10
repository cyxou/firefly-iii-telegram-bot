import { ITransaction } from '../lib/firefly'

export interface SessionData {
  settingsStep: 'idle' | 'fireflyUrl' | 'fireflyAccessToken'
  transactionsStep: 'idle',
  transaction: ITransaction
}
