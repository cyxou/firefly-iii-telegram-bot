import config from '../config'
import debug from 'debug'
import path from 'path'

const rootLog = debug(`bot:storage`)

class UserSettings {
  _fireflyUrl = ''
  _fireflyAccessToken = ''
  _defaultAssetAccount = ''

  constructor(fireflyUrl = '', fireflyAccessToken = '') {
    this._fireflyUrl = fireflyUrl
    this._fireflyAccessToken = fireflyAccessToken
  }

  get fireflyUrl() { return this._fireflyUrl }
  set fireflyUrl(val: string) { this._fireflyUrl = val }

  get fireflyAccessToken() { return this._fireflyAccessToken }
  set fireflyAccessToken(val: string) { this._fireflyAccessToken = val }

  get defaultAssetAccount() { return this._defaultAssetAccount }
  set defaultAssetAccount(val: string) { this._defaultAssetAccount = val }
}

type UserStorage = {
  [key: number]: UserSettings
}

const userStorage: UserStorage = { } as UserStorage

export function getUserStorage(userId: number): UserSettings {
  return userStorage[userId] || bootstrapUserStorage(userId)
}

function bootstrapUserStorage(userId: number): UserSettings {
  const log = rootLog.extend('bootstrapUserStorage')
  log('userId: %O', userId)
  const userSettings = new UserSettings(config.fireflyUrl, config.fireflyAccessToken)

  userStorage[userId] = userSettings
  return userStorage[userId]
}
