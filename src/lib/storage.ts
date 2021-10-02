import config from '../config'
import debug from 'debug'

const rootLog = debug(`bot:storage`)

type KEYS =
  'FIREFLY_URL'
  | 'FIREFLY_ACCESS_TOKEN'
  | 'DEFAULT_ASSET_ACCOUNT'
type StorageMap = Map<KEYS, any>
type UserStorage = {
  [key: number]: StorageMap
}

const userStorage: UserStorage = { }

export function getUserStorage(userId: number) {
  return userStorage[userId] || bootstrapUserStorage(userId)
}

type UserStorageValues = {
  fireflyUrl: string,
  fireflyAccessToken: string
  defaultAssetAccount: string
}

export function getDataFromUserStorage(userId: number): UserStorageValues {
  const log = rootLog.extend('getDataFromUserStorage')
  log('userId: %O', userId)
  const storage = getUserStorage(userId)
  log('storage: %O', storage)
  const fireflyUrl = storage.get('FIREFLY_URL')
  log('fireflyUrl: %O', fireflyUrl)
  const fireflyAccessToken = storage.get('FIREFLY_ACCESS_TOKEN')
  log('fireflyAccessToken: %O', fireflyAccessToken)
  const defaultAssetAccount = storage.get('DEFAULT_ASSET_ACCOUNT')
  log('defaultAssetAccount: %O', defaultAssetAccount)

  return {
    fireflyUrl,
    fireflyAccessToken,
    defaultAssetAccount
  }
}

function bootstrapUserStorage(userId: number) {
  const log = rootLog.extend('bootstrapUserStorage')
  log('userId: %O', userId)
  const map: StorageMap = new Map()

  if (config.fireflyUrl) {
    map.set('FIREFLY_URL', config.fireflyUrl)
  } else map.set('FIREFLY_URL', null)

  if (config.fireflyAccessToken) {
    map.set('FIREFLY_ACCESS_TOKEN', config.fireflyAccessToken)
  } else map.set('FIREFLY_ACCESS_TOKEN', null)

  map.set('DEFAULT_ASSET_ACCOUNT', null)

  userStorage[userId] = map
  log('userStorage[userId]: %O', userStorage[userId])
  return userStorage[userId]
}
