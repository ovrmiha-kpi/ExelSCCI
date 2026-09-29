import type { ISODate, MyropilStay, Person, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { normalizeSquadRanges } from './squads'
import { uid } from './id'

export function newMyropilStay(partial?: Partial<MyropilStay>): MyropilStay {
  return {
    id: uid(),
    from: partial?.from ?? '',
    to: partial?.to ?? '',
    groups: Array.isArray(partial?.groups) ? [...partial.groups] : [],
  }
}

export function normalizeMyropilStays(raw: unknown): MyropilStay[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s) => {
      if (!s || typeof s !== 'object') return null
      const o = s as Partial<MyropilStay>
      if (typeof o.from !== 'string' || typeof o.to !== 'string') return null
      return {
        id: typeof o.id === 'string' && o.id ? o.id : uid(),
        from: o.from,
        to: o.to >= o.from ? o.to : o.from,
        groups: Array.isArray(o.groups) ? o.groups.filter((g): g is string => typeof g === 'string') : [],
      }
    })
    .filter((s): s is MyropilStay => !!s)
}

/** Перебування, що покриває дату (groups порожні = усі групи). */
export function stayForDate(date: ISODate, stays: MyropilStay[]): MyropilStay | null {
  for (const s of stays) {
    if (!s.from || !s.to) continue
    if (date >= s.from && date <= s.to) return s
  }
  return null
}

export function isMyropilDate(date: ISODate, stays: MyropilStay[]): boolean {
  return stayForDate(date, stays) !== null
}

export function personInMyropilOn(
  person: Person,
  date: ISODate,
  stays: MyropilStay[],
): boolean {
  return groupInMyropilOn(person.group, date, stays)
}

/** Чи група в Мирополі в цю дату (порожні groups у періоді = усі групи). */
export function groupInMyropilOn(group: string, date: ISODate, stays: MyropilStay[]): boolean {
  const stay = stayForDate(date, stays)
  if (!stay) return false
  if (stay.groups.length === 0) return true
  return stay.groups.includes(group)
}

/** Маска дат видимого діапазону: true = комірка в Мирополі для цієї групи. */
export function myropilCoveredMask(
  group: string,
  dates: ISODate[],
  stays: MyropilStay[],
): boolean[] {
  return dates.map((d) => groupInMyropilOn(group, d, stays))
}

/** Чи є хоч один день Мирополю для групи у видимому діапазоні. */
export function groupTouchesMyropil(group: string, dates: ISODate[], stays: MyropilStay[]): boolean {
  return dates.some((d) => groupInMyropilOn(group, d, stays))
}

/** Групи, що хоч один день у Мирополі в цьому діапазоні. */
export function groupsTouchingMyropil(
  allGroups: string[],
  dates: ISODate[],
  stays: MyropilStay[],
): string[] {
  return allGroups.filter((g) => groupTouchesMyropil(g, dates, stays))
}

/** Чи дата входить у будь-який період Мирополю (незалежно від груп). */
export function dateInAnyMyropilStay(date: ISODate, stays: MyropilStay[]): boolean {
  return isMyropilDate(date, stays)
}

export type MyropilPlanMode = 'duties' | 'myropil' | 'mixed'

export function resolveMyropilPlanMode(
  dates: ISODate[],
  stays: MyropilStay[],
): { mode: MyropilPlanMode; groups: string[] } {
  if (dates.length === 0) return { mode: 'duties', groups: [] }
  let myro = 0
  const groupSet = new Set<string>()
  for (const d of dates) {
    const stay = stayForDate(d, stays)
    if (stay) {
      myro++
      for (const g of stay.groups) groupSet.add(g)
    }
  }
  if (myro === 0) return { mode: 'duties', groups: [] }
  if (myro === dates.length) return { mode: 'myropil', groups: [...groupSet].sort((a, b) => a.localeCompare(b, 'uk')) }
  return { mode: 'mixed', groups: [...groupSet] }
}

export function settingsWithMyropil(settings: Settings): Settings {
  return {
    ...settings,
    myropilStays: normalizeMyropilStays(settings.myropilStays),
    squadRanges: normalizeSquadRanges(settings.squadRanges),
  }
}

export function normalizeSettings(partial?: Partial<Settings> | null): Settings {
  return settingsWithMyropil({ ...DEFAULT_SETTINGS, ...(partial ?? {}) })
}
