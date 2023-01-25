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

  constructor({ 
    fireflyUrl = config.fireflyUrl,
    fireflyApiUrl = config.fireflyApiUrl,
    fireflyAccessToken = ''
  }) {
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
  let userSettings: UserSettings

  if (config.userId && config.userId === userId) {
    userSettings = new UserSettings({
      fireflyAccessToken: config.fireflyAccessToken
    })
  } else if (config.userId && config.userId !== userId) {
    log('⚠️ WARNING! You provided `TG_USER_ID (%s)` via .env file which does not match the current Telegram userId (%s), therefore the user config will be reset.', config.userId, userId)
    userSettings = new UserSettings({})
  } else {
    userSettings = new UserSettings({})
  }

  userStorage[userId] = userSettings
  log('userStorage[userId]: %O', userStorage[userId])
  return userStorage[userId]
}
