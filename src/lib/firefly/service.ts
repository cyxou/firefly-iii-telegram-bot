import dayjs from 'dayjs'
import type { UserSettings } from '#root/lib/settings-store.js'
import { createFireflyClients } from '#root/lib/firefly/client.js'
import { AccountTypeFilter } from '#root/lib/firefly/generated/model/account-type-filter.js'
import type { AccountRead } from '#root/lib/firefly/generated/model/account-read.js'

export interface FireflyService {
  getCurrentUser(): Promise<{ email: string } | null>
  listAccounts(type: AccountTypeFilter, date?: string): Promise<AccountRead[]>
  getAccount(id: string): Promise<AccountRead>
}

export type FireflyServiceFactory = (settings: UserSettings) => FireflyService

export function createFireflyService(settings: UserSettings): FireflyService {
  const clients = () =>
    createFireflyClients({ fireflyApiUrl: settings.fireflyApiUrl, fireflyAccessToken: settings.fireflyAccessToken })

  return {
    async getCurrentUser() {
      const res = await clients().About.getCurrentUser()
      const user = res.data.data
      return user ? { email: user.attributes.email } : null
    },
    async listAccounts(type, date = dayjs().format('YYYY-MM-DD')) {
      const res = await clients().Accounts.listAccount(
        undefined, 100, 1, undefined, undefined, undefined, date, type,
      )
      return filterActiveAccounts(res.data.data ?? [])
    },
    async getAccount(id) {
      const res = await clients().Accounts.getAccount(id)
      return res.data.data
    },
  }
}

// Ported verbatim from legacy/composers/helpers.ts:21-23 — keep v1 semantics.
function filterActiveAccounts<T extends { attributes: { active?: boolean } }>(accounts: T[]): T[] {
  return accounts.filter(acc => acc.attributes.active !== false)
}
