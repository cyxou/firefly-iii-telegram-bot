import * as dotenv from 'dotenv';
import Debug from 'debug';

if (process.env.DEBUG) Debug.enable(process.env.DEBUG)

dotenv.config()

export default {
  // Logging of unauthorized users is enabled by default; disable if env var is set to 'true'
  disableUnauthorizedUserLog: process.env.DISABLE_UNAUTHORIZED_USER_LOG === 'true',
  allowedUserIds: process.env.ALLOWED_TG_USER_IDS
    ? process.env.ALLOWED_TG_USER_IDS.split(',')
        .map(id => id.trim())
        .filter(Boolean)
        .map(id => Number(id))
        .filter(id => !isNaN(id))
    : undefined,
  botToken: process.env.BOT_TOKEN || 'USE_YOUR_REAL_BOT_TOKEN',
  fireflyUrl: process.env.FIREFLY_URL || '',
  fireflyApiUrl: process.env.FIREFLY_API_URL || `${process.env.FIREFLY_URL}/api`,
  fireflyAccessToken: process.env.FIREFLY_ACCESS_TOKEN || ''
}
