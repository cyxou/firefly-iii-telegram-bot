import * as api from './api'
import { Configuration } from './configuration'
import globalAxios from 'axios';
import Debug from 'debug'
import { AxiosError } from 'axios';

import { getUserStorage } from '../storage'
import { AuthenticationError, HostNotFoundError  } from '../errorHandler'

const debug = Debug('firefly')

export default function firefly(userId: number) {
  const log = debug.extend('index')
  const { fireflyUrl, fireflyAccessToken } = getUserStorage(userId)
  const configuration = new Configuration({
    accessToken: fireflyAccessToken,
    basePath: fireflyUrl.replace(/\/+$/, ""),
  })
  log('configuration: %O', configuration)

  globalAxios.interceptors.response.use(resSuccessInterceptor, resErrorInterceptor)

  return {
    About: api.AboutApiFactory(configuration),
    Accounts: api.AccountsApiFactory(configuration),
    Categories: api.CategoriesApiFactory(configuration),
    Insight: api.InsightApiFactory(configuration),
    Transactions: api.TransactionsApiFactory(configuration),
  }
}

function resSuccessInterceptor(response: any) { return response }
function resErrorInterceptor(axiosError: AxiosError) {
  const log = debug.extend('axios:resErrorInterceptor')
  log('Axios error: %O', axiosError)

  if (axiosError.response?.status === 401 && axiosError.response.statusText === 'Unauthorized') {
    return Promise.reject(new AuthenticationError(axiosError?.code))
  }

  if (axiosError.code === 'ENOTFOUND') {
    return Promise.reject(new HostNotFoundError(axiosError?.code))
  }

  return Promise.reject(axiosError)
}
