import * as dotenv from 'dotenv';

dotenv.config()

export default {
  botToken: process.env.BOT_TOKEN || 'USE_YOUR_REAL_BOT_TOKEN',
  fireflyUrl: process.env.FIREFLY_URL || '',
  fireflyAccessToken: process.env.FIREFLY_ACCESS_TOKEN || ''
}
