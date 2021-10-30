import debug from 'debug'

import { getUserStorage } from '../storage'

const rootLog = debug(`bot:Firefly:helpers`)

export function getAxiosConfigForUser(userId: number) {
  const log = rootLog.extend('getAxiosConfigForUser')
  try {
    const { fireflyUrl, fireflyAccessToken } = getUserStorage(userId)

    if (!fireflyUrl || !fireflyAccessToken) {
      throw new Error('Firefly URL or Firefly Access Token is not set hence a valid Axios config can not be created')
    }

    const config = {
      baseURL: `${fireflyUrl}/api/v1/`,
      headers: {
        Authorization: `Bearer ${fireflyAccessToken}`
      }
    }

    log('Axios config: %O', config)

    return config
  } catch (err) {
    console.error('Error occurred generating Axios config: ', err)
    throw err
  }
}
