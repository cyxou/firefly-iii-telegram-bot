import config from '../config'

type KEYS =
  'FIREFLY_URL'
  | 'FIREFLY_ACCESS_TOKEN'
  | 'DEFAULT_ASSET_ACCOUNT'
type Storage = Map<KEYS, any>
type UserStorage = {
  [key: number]: Storage
}

const userStorage: UserStorage = { }

export function getUserStorage(userId: number) {
  if (!userStorage[userId]) bootstrapUserStorage(userId)
  return userStorage[userId]
}

type UserStorageValues = {
  fireflyUrl: string,
  fireflyAccessToken: string
  defaultAssetAccount: string
}

export function getDataFromUserStorage(userId: number): UserStorageValues {
  const storage = getUserStorage(userId)
  const fireflyUrl = storage.get('FIREFLY_URL')
  const fireflyAccessToken = storage.get('FIREFLY_ACCESS_TOKEN')
  const defaultAssetAccount = storage.get('DEFAULT_ASSET_ACCOUNT')

  return {
    fireflyUrl,
    fireflyAccessToken,
    defaultAssetAccount
  }
}

function bootstrapUserStorage(userId: number) {
  const storage: Storage = new Map()
  userStorage[userId] = storage

  if (config.fireflyUrl) {
    userStorage[userId].set('FIREFLY_URL', config.fireflyUrl)
  } else userStorage[userId].set('FIREFLY_URL', null)

  if (config.fireflyAccessToken) {
    userStorage[userId].set('FIREFLY_ACCESS_TOKEN', config.fireflyAccessToken)
  } else userStorage[userId].set('FIREFLY_ACCESS_TOKEN', null)

  userStorage[userId].set('DEFAULT_ASSET_ACCOUNT', null)

  return userStorage[userId]
}
