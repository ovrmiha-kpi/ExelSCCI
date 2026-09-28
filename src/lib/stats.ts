import type { Assignment, DutyType, ISODate, Person } from '../types'
import { diffDays } from './dates'

export interface PeriodFilter {
  from?: ISODate
  to?: ISODate
}

export interface PersonStats {
  person: Person
  /** Сумарні бали (за період + початкові бали, якщо період не обмежений). */
  points: number
  /** Бали тільки за залучення (без початкових). */
  earnedPoints: number
  /** Кількість залучень усього. */
  count: number
  /** Кількість залучень за кожним видом наряду. */
  countByDuty: Record<string, number>
  /** Бали за кожним видом наряду. */
  pointsByDuty: Record<string, number>
  /** Дата останнього залучення (за всю історію — використовується для «скільки днів відпочивав»). */
  lastDate: ISODate | null
  /** Вид останнього наряду. */
  lastDutyTypeId: string | null
  /** Днів з останнього залучення відносно `asOf`. null — не ходив узагалі. */
  daysSinceLast: number | null
}

export function inPeriod(a: Assignment, p: PeriodFilter): boolean {
  if (p.from && a.date < p.from) return false
  if (p.to && a.date > p.to) return false
  return true
}

/**
 * Рахує статистику за кожною людиною.
 * @param asOf дата, відносно якої рахуємо «днів з останнього наряду» (зазвичай сьогодні).
 */
export function computeStats(
  people: Person[],
  assignments: Assignment[],
  period: PeriodFilter = {},
  asOf?: ISODate,
): Map<string, PersonStats> {
  const map = new Map<string, PersonStats>()
  const unbounded = !period.from && !period.to

  for (const person of people) {
    map.set(person.id, {
      person,
      points: unbounded ? person.basePoints : 0,
      earnedPoints: 0,
      count: 0,
      countByDuty: {},
      pointsByDuty: {},
      lastDate: null,
      lastDutyTypeId: null,
      daysSinceLast: null,
    })
  }

  for (const a of assignments) {
    const s = map.get(a.personId)
    if (!s) continue

    // Останнє залучення — за всією історією, але не пізніше asOf (майбутні плани не вважаємо «відпочинком»).
    if (!asOf || a.date <= asOf) {
      if (!s.lastDate || a.date > s.lastDate) {
        s.lastDate = a.date
        s.lastDutyTypeId = a.dutyTypeId
      }
    }

    if (!inPeriod(a, period)) continue
    s.points += a.points
    s.earnedPoints += a.points
    s.count += 1
    s.countByDuty[a.dutyTypeId] = (s.countByDuty[a.dutyTypeId] ?? 0) + 1
    s.pointsByDuty[a.dutyTypeId] = (s.pointsByDuty[a.dutyTypeId] ?? 0) + a.points
  }

  if (asOf) {
    for (const s of map.values()) {
      s.daysSinceLast = s.lastDate ? diffDays(asOf, s.lastDate) : null
    }
  }

  return map
}

export function activeDutyTypes(dutyTypes: DutyType[]): DutyType[] {
  return dutyTypes.filter((d) => !d.archived).sort((a, b) => a.order - b.order)
}

export function sortedDutyTypes(dutyTypes: DutyType[]): DutyType[] {
  return [...dutyTypes].sort((a, b) => a.order - b.order)
}
