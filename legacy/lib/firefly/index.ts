import * as api from './api'
import { Configuration } from './configuration'
import globalAxios from 'axios';
import Debug from 'debug'
import { AxiosError, AxiosResponse } from 'axios';

import {
  AuthenticationError,
  HostNotFoundError,
  BadRequestError,
  ResourceNotFoundError
} from '../errorHandler'

const debug = Debug('firefly')

export default function firefly(userSettings : { fireflyApiUrl: string, fireflyAccessToken: string }) {
  const log = debug.extend('index')
  const configuration = new Configuration({
    accessToken: userSettings.fireflyAccessToken,
    basePath: userSettings.fireflyApiUrl.replace(/\/+$/, ""),
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

  if ((axiosError.response?.data as any)?.message === 'Unauthenticated') {
    log('Rejecting with AuthenticationError: Unauthenticated')
    return Promise.reject(new AuthenticationError(axiosError?.code))
  }

  if (axiosError.response?.status === 401 && axiosError.response.statusText === 'Unauthorized') {
    log('Rejecting with AuthenticationError: Unauthorized')
    return Promise.reject(new AuthenticationError(axiosError?.code))
  }

  if (
    axiosError.code === 'ERR_BAD_REQUEST' &&
    (axiosError.response?.data as any)?.exception === 'NotFoundHttpException'
  ) {
    log('Rejecting with ResourceNotFoundError exception')
    return Promise.reject(new ResourceNotFoundError(axiosError.code))
  }

  if (axiosError.code === 'ERR_BAD_REQUEST') {
    log('Rejecting with BadRequestError')
    return Promise.reject(new BadRequestError(
      (axiosError.response?.data as any)?.message || axiosError.code
    ))
  }

  if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
    log('Rejecting with HostNotFoundError')
    return Promise.reject(new HostNotFoundError(axiosError.code))
  }

  log('Rejecting with some other error kind')
  return Promise.reject(axiosError)
}
