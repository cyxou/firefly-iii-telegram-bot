import config from '../config'
import debug from 'debug'

import { AccountAttributes } from '../types/SessionData'

const rootLog = debug(`bot:storage`)
const allowedLanguages = ['ru', 'en']

class UserSettings {
  _fireflyUrl = ''
  _fireflyApiUrl = ''
  _fireflyAccessToken = ''
  _defaultSourceAccount = { id: '', type: '', name: '' }
  _defaultDestinationAccount = { id: '', type: '', name: '' }
  _language = 'en'

  constructor(fireflyUrl = '', fireflyApiUrl = '', fireflyAccessToken = '') {
    this._fireflyUrl = fireflyUrl
    this._fireflyApiUrl = fireflyApiUrl || fireflyUrl
    this._fireflyAccessToken = fireflyAccessToken
  }

  get fireflyUrl() { return this._fireflyUrl }
  set fireflyUrl(val: string) { this._fireflyUrl = val }

  get fireflyApiUrl() { return this._fireflyApiUrl }
  set fireflyApiUrl(val: string) { this._fireflyApiUrl = val }

  get fireflyAccessToken() { return this._fireflyAccessToken }
  set fireflyAccessToken(val: string) { this._fireflyAccessToken = val }

  get defaultSourceAccount() { return this._defaultSourceAccount }
  set defaultSourceAccount(val: AccountAttributes) { this._defaultSourceAccount = val }

  get defaultDestinationAccount() { return this._defaultDestinationAccount }
  set defaultDestinationAccount(val: AccountAttributes) { this._defaultDestinationAccount = val }

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
  const userSettings = new UserSettings(config.fireflyUrl, config.fireflyApiUrl, config.fireflyAccessToken)

  userStorage[userId] = userSettings
  log('userStorage[userId]: %O', userStorage[userId])
  return userStorage[userId]
}
