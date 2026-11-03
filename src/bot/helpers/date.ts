// Month label for report/category titles and month-nav buttons: 'MMMM, YYYY'
// with the first letter capitalized (dayjs has no locale-aware case hook).
import dayjs from 'dayjs'

export function monthLabel(date: dayjs.Dayjs): string {
  return date.format('MMMM, YYYY').replace(/^./, (c) => c.toLocaleUpperCase())
}
