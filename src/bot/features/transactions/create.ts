import type { TxnAccount, TxnDraft } from '#root/bot/context.js'
import type { AccountRead, FireflyService, TransactionSplitStore } from '#root/lib/firefly/service.js'
import type { UserSettings } from '#root/lib/settings-store.js'
import { AccountTypeFilter, TransactionTypeProperty } from '#root/lib/firefly/service.js'

/** Map a Firefly account onto the session-draft shape (v1 AccountAttributes). */
export function toRef(acc: AccountRead | undefined): TxnAccount | null {
  if (!acc)
    return null
  return {
    id: acc.id,
    name: acc.attributes.name,
    type: String(acc.attributes.type),
    currencyId: acc.attributes.currency_id ?? undefined,
    currencySymbol: acc.attributes.currency_symbol ?? undefined,
  }
}

// Port of v1 getDefaultSourceAccount/getDefaultDestinationAccount: stored
// default wins; otherwise first active account of the type (listAccounts
// already filters active + date). The discovery is NOT persisted (v1 parity).
export async function resolveDefaultAccounts(
  settings: UserSettings | undefined,
  firefly: FireflyService,
): Promise<{ source: TxnAccount | null, destination: TxnAccount | null }> {
  const source = settings?.defaultSourceAccount.name
    ? { ...settings.defaultSourceAccount }
    : toRef((await firefly.listAccounts(AccountTypeFilter.Asset))[0])
  const destination = settings?.defaultDestinationAccount.name
    ? { ...settings.defaultDestinationAccount }
    : toRef((await firefly.listAccounts(AccountTypeFilter.CashAccount))[0])
  return { source, destination }
}

// Port of v1 createFireflyTransaction's payload builder. Without an explicit
// type it mimics Firefly's account-type rules (v1 verbatim). Uses draft.date —
// v1 re-read ctx.message.date at click time, which in callback context is the
// BOT's menu message date (folded fix, see plan decision 7).
export function buildSplit(draft: TxnDraft, type?: TransactionTypeProperty): TransactionSplitStore {
  const sourceType = draft.sourceAccount?.type
  const destType = draft.destAccount?.type
  // attributes.type is singular ('liability'); v1 checked the plural filter
  // string verbatim — dead at runtime. Both accepted, so the mimicked Firefly
  // rule (asset→liability = withdrawal) actually fires.
  const isLiability = (t?: string) => t === 'liability' || t === 'liabilities'
  let trType = type
  if (!trType) {
    if (sourceType === 'asset' && isLiability(destType))
      trType = TransactionTypeProperty.Withdrawal
    else if (isLiability(sourceType) || sourceType === 'revenue')
      trType = TransactionTypeProperty.Deposit
    else if (sourceType === 'asset' || destType === 'asset')
      trType = TransactionTypeProperty.Transfer
    else
      trType = TransactionTypeProperty.Withdrawal
  }
  const split: TransactionSplitStore = {
    type: trType,
    date: draft.date,
    description: draft.description || 'N/A',
    source_id: draft.sourceAccount?.id ?? '',
    amount: draft.amount,
    category_id: draft.categoryId || '', // v1 sent '' — Firefly treats as absent
    destination_id: draft.destAccount?.id,
  }
  // Firefly rejects foreign_currency_id without foreign_amount (v1 note)
  if (trType === TransactionTypeProperty.Transfer && draft.foreignAmount) {
    split.foreign_amount = draft.foreignAmount
    split.foreign_currency_id = draft.destAccount?.currencyId
  }
  return split
}
