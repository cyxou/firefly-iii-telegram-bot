import config from '../config'
import debug from 'debug'

import { AccountAttributes } from '../types/SessionData'

const rootLog = debug(`bot:storage`)
const allowedLanguages = ['ru', 'en']

class UserSettings {
  _fireflyUrl = ''
  _fireflyAccessToken = ''
  _defaultAssetAccount = ''
  _defaultSourceAccount = { id: '', type: '', name: '' }
  _defaultAssetAccountId = 0
  _language = 'en'

  constructor(fireflyUrl = '', fireflyAccessToken = '') {
    this._fireflyUrl = fireflyUrl
    this._fireflyAccessToken = fireflyAccessToken
  }

  get fireflyUrl() { return this._fireflyUrl }
  set fireflyUrl(val: string) { this._fireflyUrl = val }

  get fireflyAccessToken() { return this._fireflyAccessToken }
  set fireflyAccessToken(val: string) { this._fireflyAccessToken = val }

  get defaultSourceAccount() { return this._defaultSourceAccount }
  set defaultSourceAccount(val: AccountAttributes) { this._defaultSourceAccount = val }

  get defaultAssetAccount() { return this._defaultAssetAccount }
  set defaultAssetAccount(val: string) { this._defaultAssetAccount = val }

  get defaultAssetAccountId() { return this._defaultAssetAccountId }
  set defaultAssetAccountId(val: number) { this._defaultAssetAccountId = val }

  get language() { return this._language }
  set language(val: string) {
    if (allowedLanguages.includes(val as 'en' | 'ru')) this._language = val
  }
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
