import type { Assignment, DutyType, ISODate, Person } from '../types'
import { diffDays } from './dates'

export interface PeriodFilter {
  from?: ISODate
  to?: ISODate
}

export interface PersonStats {
  person: Person
  /** Суммарные баллы (за период + начальные баллы, если период не ограничен). */
  points: number
  /** Баллы только за задействия (без начальных). */
  earnedPoints: number
  /** Количество задействий всего. */
  count: number
  /** Количество задействий по каждому виду наряда. */
  countByDuty: Record<string, number>
  /** Баллы по каждому виду наряда. */
  pointsByDuty: Record<string, number>
  /** Дата последнего задействия (в любом периоде — используется для «сколько дней отдыхал»). */
  lastDate: ISODate | null
  /** Вид последнего наряда. */
  lastDutyTypeId: string | null
  /** Дней с последнего задействия относительно `asOf`. null — не ходил вообще. */
  daysSinceLast: number | null
}

export function inPeriod(a: Assignment, p: PeriodFilter): boolean {
  if (p.from && a.date < p.from) return false
  if (p.to && a.date > p.to) return false
  return true
}

/**
 * Считает статистику по каждому человеку.
 * @param asOf дата, относительно которой считаем «дней с последнего наряда» (обычно сегодня).
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

    // Последнее задействие — по всей истории, но не позже asOf (будущие планы не считаем «отдыхом»).
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
