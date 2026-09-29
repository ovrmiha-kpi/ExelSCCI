import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
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

/** «Пн», «Вт»… */
export function weekdayShort(iso: ISODate): string {
  const s = format(parseISO(iso), 'EEEEEE', { locale: uk })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function dayOfMonth(iso: ISODate): number {
  return parseISO(iso).getDate()
}

export function isWeekend(iso: ISODate): boolean {
  const d = parseISO(iso).getDay()
  return d === 0 || d === 6
}

/** Бали наряду з урахуванням множника вихідних (сб/нд). */
export function dutyPointsForDate(basePoints: number, date: ISODate, weekendMultiplier = 1.33): number {
  const mult = Number(weekendMultiplier)
  if (!isWeekend(date) || !Number.isFinite(mult) || mult === 1) return basePoints
  return Math.round(basePoints * mult * 100) / 100
}

/** «вересень 2026» */
export function formatMonthTitle(iso: ISODate): string {
  return format(parseISO(iso), 'LLLL yyyy', { locale: uk })
}

/** Початок тижня (понеділок) для дати. */
export function startOfWeekISO(iso: ISODate): ISODate {
  return toISO(startOfWeek(parseISO(iso), { weekStartsOn: 1 }))
}

export function startOfMonthISO(iso: ISODate): ISODate {
  return toISO(startOfMonth(parseISO(iso)))
}

export function endOfMonthISO(iso: ISODate): ISODate {
  return toISO(endOfMonth(parseISO(iso)))
}

export function addMonthsISO(iso: ISODate, n: number): ISODate {
  return toISO(addMonths(parseISO(iso), n))
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
  if (days < 0) return 'заплановано'
  if (days === 0) return 'сьогодні'
  if (days === 1) return 'вчора'
  return `${daysLabel(days)} тому`
}

/** Кількість днів span призначення (мін. 1). */
export function assignmentSpanDays(a: { spanDays?: number | null }): number {
  return Math.max(1, Math.floor(Number(a.spanDays) || 1))
}

/** Останній день включно. */
export function assignmentEndDate(a: { date: ISODate; spanDays?: number | null }): ISODate {
  const n = assignmentSpanDays(a)
  return n <= 1 ? a.date : addDaysISO(a.date, n - 1)
}

export function assignmentCoversDate(
  a: { date: ISODate; spanDays?: number | null },
  d: ISODate,
): boolean {
  return a.date <= d && assignmentEndDate(a) >= d
}

export function assignmentOverlapsRange(
  a: { date: ISODate; spanDays?: number | null },
  from: ISODate,
  to: ISODate,
): boolean {
  return a.date <= to && assignmentEndDate(a) >= from
}
