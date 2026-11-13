// Thin Bot API 10.4 (Nov 9, 2026) bridge for HTML widgets, until grammY ships
// types for sendWidget/answerWidgetQuery/editMessageWidgetData. The bot long-
// polls without allowed_updates, so widget_query updates already arrive on
// ctx.update — only the method types are missing. Delete this file when the
// pinned grammy version gains Bot API 10.4 support and inline the calls.
import type { Update, User, Chat } from '@grammyjs/types'
import type { Api } from 'grammy'

/** Bot API 10.4 Update.widget_query — a request from a widget we sent. */
export interface WidgetQuery {
  id: string
  from: User
  /** Present for originals in the bot's chats; absent for inline sends. */
  chat?: Chat
  message_id?: number
  chat_instance?: string
  /** Present when the widget was sent with is_shared. */
  widget_id?: string
  /** Untrusted 1–64 bytes from the widget — same discipline as callback_data. */
  data: string
}

export interface SendWidgetParams {
  chat_id: number
  /** One HTML document: ≤32768 B raw, ≤4096 B after server zlib-9. */
  html: string
  caption?: string
  /** Size anchors in CSS pixels; 0 = automatic (per axis). */
  width?: number
  height?: number
  /** Per-message state the widget reads as TelegramWidget.chatData (≤1024 B). */
  chat_data?: string
  public_data?: string
  /** Without it every request to this widget is refused everywhere. */
  allow_queries?: boolean
  is_shared?: boolean
}

interface WidgetRawApi {
  sendWidget: (p: SendWidgetParams) => Promise<unknown>
  answerWidgetQuery: (p: { widget_query_id: string; data?: string }) => Promise<unknown>
  editMessageWidgetData: (p: {
    chat_id: number
    message_id: number
    chat_data?: string
    public_data?: string
  }) => Promise<unknown>
}

const raw = (api: Api): WidgetRawApi => api.raw as unknown as WidgetRawApi

export function widgetQueryOf(update: Update): WidgetQuery | undefined {
  return (update as Update & { widget_query?: WidgetQuery }).widget_query
}

export function sendWidget(api: Api, p: SendWidgetParams) {
  return raw(api).sendWidget(p)
}

/** Must be called for EVERY widget query within 15 s, success or failure. */
export function answerWidgetQuery(api: Api, widgetQueryId: string, data?: string) {
  return raw(api).answerWidgetQuery({
    widget_query_id: widgetQueryId,
    ...(data === undefined ? {} : { data }),
  })
}

export function editMessageWidgetData(
  api: Api,
  p: { chat_id: number; message_id: number; chat_data?: string; public_data?: string },
) {
  return raw(api).editMessageWidgetData(p)
}
