import axios from 'axios'
import type { AxiosError, AxiosResponse } from 'axios'
import * as api from '#root/lib/firefly/api.js'
import { Configuration } from '#root/lib/firefly/generated/configuration.js'
import {
  AuthenticationError,
  BadRequestError,
  HostNotFoundError,
  ResourceNotFoundError,
} from '#root/lib/errors.js'

export interface FireflyClients {
  About: ReturnType<typeof api.AboutApiFactory>
  Accounts: ReturnType<typeof api.AccountsApiFactory>
  Categories: ReturnType<typeof api.CategoriesApiFactory>
  Transactions: ReturnType<typeof api.TransactionsApiFactory>
}

function resSuccessInterceptor(response: AxiosResponse) {
  return response
}

// Ported verbatim from legacy/lib/firefly/index.ts:36-73.
function resErrorInterceptor(axiosError: AxiosError) {
  if ((axiosError.response?.data as any)?.message === 'Unauthenticated')
    return Promise.reject(new AuthenticationError(axiosError?.code))
  if (axiosError.response?.status === 401 && axiosError.response.statusText === 'Unauthorized')
    return Promise.reject(new AuthenticationError(axiosError?.code))
  if (
    axiosError.code === 'ERR_BAD_REQUEST'
    && (axiosError.response?.data as any)?.exception === 'NotFoundHttpException'
  )
    return Promise.reject(new ResourceNotFoundError(axiosError.code))
  if (axiosError.code === 'ERR_BAD_REQUEST')
    return Promise.reject(new BadRequestError((axiosError.response?.data as any)?.message || axiosError.code))
  if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED')
    return Promise.reject(new HostNotFoundError(axiosError.code))
  return Promise.reject(axiosError)
}

// v1 bug fixed here (beads 8sw): the interceptor used to be registered on EVERY
// firefly() call, accumulating handlers for the process lifetime. The generated
// code resolves the global axios instance, so we keep it global but guard with a
// module-level once flag.
let interceptorsRegistered = false

const cache = new Map<string, FireflyClients>()

export function createFireflyClients(settings: {
  fireflyApiUrl: string
  fireflyAccessToken: string
}): FireflyClients {
  const key = `${settings.fireflyApiUrl}|${settings.fireflyAccessToken}`
  const cached = cache.get(key)
  if (cached)
    return cached

  if (!interceptorsRegistered) {
    axios.interceptors.response.use(resSuccessInterceptor, resErrorInterceptor)
    interceptorsRegistered = true
  }

  const configuration = new Configuration({
    accessToken: settings.fireflyAccessToken,
    basePath: settings.fireflyApiUrl.replace(/\/+$/, ''),
  })

  const clients: FireflyClients = {
    About: api.AboutApiFactory(configuration),
    Accounts: api.AccountsApiFactory(configuration),
    Categories: api.CategoriesApiFactory(configuration),
    Transactions: api.TransactionsApiFactory(configuration),
  }
  cache.set(key, clients)
  return clients
}
