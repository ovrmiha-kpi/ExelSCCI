import { addDays, differenceInCalendarDays, format, parseISO, isValid } from 'date-fns'
import { uk } from 'date-fns/locale'
import type { ISODate } from '../types'

export function todayISO(): ISODate {
  return format(new Date(), 'yyyy-MM-dd')
}

export function toISO(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd')
}

export function parseISODate(iso: ISODate): Date {
  return parseISO(iso)
}

export function isValidISO(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && isValid(parseISO(iso))
}

export function addDaysISO(iso: ISODate, n: number): ISODate {
  return toISO(addDays(parseISO(iso), n))
}

/** Різниця в календарних днях: a - b. */
export function diffDays(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(parseISO(a), parseISO(b))
}

export function formatShort(iso: ISODate): string {
  return format(parseISO(iso), 'dd.MM.yyyy')
}

export function formatHuman(iso: ISODate): string {
  return format(parseISO(iso), 'd MMM, EEEEEE', { locale: uk })
}

/** Усі дати від from до to включно. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  let cur = from
  let guard = 0
  while (cur <= to && guard < 400) {
    out.push(cur)
    cur = addDaysISO(cur, 1)
    guard++
  }
  return out
}

/** Українська множина: one / few / many. */
function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

export function pointsLabel(n: number): string {
  return `${n} ${plural(n, 'бал', 'бали', 'балів')}`
}

export function daysLabel(n: number): string {
  return `${n} ${plural(n, 'день', 'дні', 'днів')}`
}

export function daysAgoLabel(days: number): string {
  if (days === 0) return 'сьогодні'
  if (days === 1) return 'вчора'
  return `${daysLabel(days)} тому`
}
