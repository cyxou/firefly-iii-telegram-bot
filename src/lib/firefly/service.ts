import type { AccountRead } from '#root/lib/firefly/generated/model/account-read.js'
import type { CategoryRead } from '#root/lib/firefly/generated/model/category-read.js'
import type { InsightTotal } from '#root/lib/firefly/generated/model/insight-total.js'
import type { TransactionRead } from '#root/lib/firefly/generated/model/transaction-read.js'
import type { TransactionSplitStore } from '#root/lib/firefly/generated/model/transaction-split-store.js'
import type { TransactionSplitUpdate } from '#root/lib/firefly/generated/model/transaction-split-update.js'
import type { UserSettings } from '#root/lib/settings-store.js'
import dayjs from 'dayjs'
import { createFireflyClients } from '#root/lib/firefly/client.js'
import { AccountTypeFilter } from '#root/lib/firefly/generated/model/account-type-filter.js'
import { TransactionTypeFilter } from '#root/lib/firefly/generated/model/transaction-type-filter.js'
import { TransactionTypeProperty } from '#root/lib/firefly/generated/model/transaction-type-property.js'

// Features (and tests) import firefly types HERE, never from generated/ —
// lint-tested in __tests__/lint/architecture.test.ts.
export { AccountTypeFilter, TransactionTypeFilter, TransactionTypeProperty }
export type {
  AccountRead,
  CategoryRead,
  TransactionRead,
  TransactionSplitStore,
  TransactionSplitUpdate,
}

export interface CategoryExpenseSummary {
  currency: string
  difference: number
}

export interface CurrencyTotal {
  currency: string
  /** Signed as the API returns it: expenses negative, income positive. */
  amount: number
}

export interface CategoryExpense {
  name: string
  currency: string
  /** Absolute expense amount. */
  amount: number
}

export interface FireflyService {
  getCurrentUser: () => Promise<{ email: string } | null>
  listAccounts: (type: AccountTypeFilter, date?: string) => Promise<AccountRead[]>
  getAccount: (id: string) => Promise<AccountRead>
  listCategories: () => Promise<CategoryRead[]>
  getCategory: (id: string) => Promise<CategoryRead>
  storeCategory: (name: string) => Promise<void>
  updateCategory: (id: string, name: string) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  listTransactionsByCategory: (id: string, start: string, end: string) => Promise<TransactionRead[]>
  listTransactions: (
    type: TransactionTypeFilter,
    start: string,
    end: string,
  ) => Promise<TransactionRead[]>
  storeTransaction: (split: TransactionSplitStore) => Promise<TransactionRead>
  getTransaction: (id: string) => Promise<TransactionRead>
  updateTransaction: (id: string, split: TransactionSplitUpdate) => Promise<TransactionRead>
  deleteTransaction: (id: string) => Promise<void>
  insightExpenseForCategory: (
    start: string,
    end: string,
    categoryId: number,
  ) => Promise<CategoryExpenseSummary[]>
  insightExpenseTotal: (start: string, end: string) => Promise<CurrencyTotal[]>
  insightIncomeTotal: (start: string, end: string) => Promise<CurrencyTotal[]>
  insightExpenseByCategory: (start: string, end: string) => Promise<CategoryExpense[]>
}

export type FireflyServiceFactory = (settings: UserSettings) => FireflyService

export function createFireflyService(settings: UserSettings): FireflyService {
  const clients = () =>
    createFireflyClients({
      fireflyApiUrl: settings.fireflyApiUrl,
      fireflyAccessToken: settings.fireflyAccessToken,
    })

  return {
    async getCurrentUser() {
      const res = await clients().About.getCurrentUser()
      const user = res.data.data
      return user ? { email: user.attributes.email } : null
    },
    async listAccounts(type, date = dayjs().format('YYYY-MM-DD')) {
      const res = await clients().Accounts.listAccount(
        undefined,
        100,
        1,
        undefined,
        undefined,
        undefined,
        date,
        type,
      )
      return filterActiveAccounts(res.data.data ?? [])
    },
    async getAccount(id) {
      const res = await clients().Accounts.getAccount(id)
      return res.data.data
    },
    // ponytail: 500-category cap (v1 ceiling); the add-flow picker slices
    // client-side (txnFlow.categoryPage) — real pagination only if a category
    // list ever outgrows it.
    async listCategories() {
      const res = await clients().Categories.listCategory(undefined, 500)
      return res.data.data ?? []
    },
    async getCategory(id) {
      const res = await clients().Categories.getCategory(id)
      return res.data.data
    },
    async storeCategory(name) {
      await clients().Categories.storeCategory({ name })
    },
    async updateCategory(id, name) {
      await clients().Categories.updateCategory(id, { name })
    },
    async deleteCategory(id) {
      await clients().Categories.deleteCategory(id)
    },
    // ponytail: 100-transaction single page (v1 ceiling) — same ceiling as the
    // day view below; a month with >100 txns truncates like v1.
    async listTransactionsByCategory(id, start, end) {
      const res = await clients().Categories.listTransactionByCategory(
        id,
        undefined,
        100,
        1,
        start,
        end,
      )
      return res.data.data ?? []
    },
    // ponytail: 100-transaction single page per day view (v1 ceiling); prev/next
    // navigates DAYS, not pages — a day with >100 txns truncates like v1.
    async listTransactions(type, start, end) {
      const res = await clients().Transactions.listTransaction(undefined, 100, 1, start, end, type)
      return res.data.data ?? []
    },
    async storeTransaction(split) {
      const res = await clients().Transactions.storeTransaction({
        transactions: [split],
      })
      return res.data.data
    },
    async getTransaction(id) {
      const res = await clients().Transactions.getTransaction(id)
      return res.data.data
    },
    async updateTransaction(id, split) {
      const res = await clients().Transactions.updateTransaction(id, {
        transactions: [split],
      })
      return res.data.data
    },
    async deleteTransaction(id) {
      await clients().Transactions.deleteTransaction(id)
    },
    async insightExpenseForCategory(start, end, categoryId) {
      const res = await clients().Insight.insightExpenseCategory(start, end, undefined, [
        categoryId,
      ])
      return (res.data ?? []).map((item) => ({
        currency: item.currency_code ?? '',
        difference: item.difference_float ?? 0,
      }))
    },
    async insightExpenseTotal(start, end) {
      const res = await clients().Insight.insightExpenseTotal(start, end)
      return toCurrencyTotals(res.data)
    },
    async insightIncomeTotal(start, end) {
      const res = await clients().Insight.insightIncomeTotal(start, end)
      return toCurrencyTotals(res.data)
    },
    async insightExpenseByCategory(start, end) {
      const res = await clients().Insight.insightExpenseCategory(start, end)
      return (res.data ?? []).map((item) => ({
        name: item.name ?? '',
        currency: item.currency_code ?? '',
        amount: Math.abs(item.difference_float ?? 0),
      }))
    },
  }
}

// Ported verbatim from legacy/composers/helpers.ts:21-23 — keep v1 semantics.
function filterActiveAccounts<T extends { attributes: { active?: boolean } }>(accounts: T[]): T[] {
  return accounts.filter((acc) => acc.attributes.active !== false)
}

function toCurrencyTotals(data: InsightTotal | undefined): CurrencyTotal[] {
  return (data ?? []).map((item) => ({
    currency: item.currency_code ?? '',
    amount: item.difference_float ?? 0,
  }))
}
