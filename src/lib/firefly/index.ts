import axios from 'axios'
import dayjs from 'dayjs'
import debug from 'debug'

import about from './about'
import accounts from './accounts'
import insight from './insight'
import categories from './categories'
import transactions from './transactions'

import { getAxiosConfigForUser } from './helpers'

const rootLog = debug(`bot:Firefly`)

export default {
  ...about,
  ...accounts,
  ...categories,
  ...insight,
  ...transactions,
}


