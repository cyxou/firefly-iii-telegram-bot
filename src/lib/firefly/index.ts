import * as api from './api'
import { Configuration } from './configuration'
import globalAxios from 'axios';
import Debug from 'debug'

import { getUserStorage } from '../storage'

const debug = Debug('firefly')

export default function firefly(userId: number) {
  const log = debug.extend('index')
  const { fireflyUrl, fireflyAccessToken } = getUserStorage(userId)
  const configuration = new Configuration({
    accessToken: fireflyAccessToken,
    basePath: fireflyUrl.replace(/\/+$/, ""),
  })

  globalAxios.interceptors.response.use(function(response) {
    // Any status code that lie within the range of 2xx cause this function to trigger
    // Do something with response data
    return response;
  }, function (err) {
    log('Error response: %O', err)
    return Promise.reject(err.response.data);
  })

  return {
    About: api.AboutApiFactory(configuration),
    Accounts: api.AccountsApiFactory(configuration),
    Categories: api.CategoriesApiFactory(configuration),
    Insight: api.InsightApiFactory(configuration),
    Transactions: api.TransactionsApiFactory(configuration),
  }
}
