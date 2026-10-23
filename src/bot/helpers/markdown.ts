// Legacy-Markdown (parse_mode: 'Markdown') metachars. User-controlled values
// (token mask, URLs, account names…) interpolated into Markdown-parsed
// messages MUST go through this — a lone '_' in a Firefly PAT tail once made
// Telegram reject the whole settings screen with "can't parse entities".
export function escapeMarkdown(value: string): string {
  return value.replace(/([_*`[])/g, '\\$1')
}
