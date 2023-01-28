import * as api from './api'
import { Configuration } from './configuration'
import globalAxios from 'axios';
import Debug from 'debug'
import { AxiosError, AxiosResponse } from 'axios';

import { getUserStorage } from '../storage'
import {
  AuthenticationError,
  HostNotFoundError,
  BadRequestError,
  ResourceNotFoundError
} from '../errorHandler'

const debug = Debug('firefly')

export default function firefly(userId: number) {
  const log = debug.extend('index')
  const { fireflyApiUrl, fireflyAccessToken } = getUserStorage(userId)
  const configuration = new Configuration({
    accessToken: fireflyAccessToken,
    basePath: fireflyApiUrl.replace(/\/+$/, ""),
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

function resSuccessInterceptor(response: AxiosResponse) { return response }
function resErrorInterceptor(axiosError: AxiosError) {
  const log = debug.extend('axios:resErrorInterceptor')
  log('Axios error: %O', axiosError)
  log('Axios response data: %O', axiosError.response?.data)

  if (axiosError.response?.status === 401 && axiosError.response.statusText === 'Unauthorized') {
    return Promise.reject(new AuthenticationError(axiosError?.code))
  }

  if (
    axiosError.code === 'ERR_BAD_REQUEST' &&
    axiosError.response?.data!['exception'] === 'NotFoundHttpException'
  ) {
    return Promise.reject(new ResourceNotFoundError(axiosError.code))
  }

  if (axiosError.code === 'ERR_BAD_REQUEST') {
    return Promise.reject(new BadRequestError(axiosError.code))
  }

  if (axiosError.code === 'ENOTFOUND') {
    return Promise.reject(new HostNotFoundError(axiosError.code))
  }

  return Promise.reject(axiosError)
}
