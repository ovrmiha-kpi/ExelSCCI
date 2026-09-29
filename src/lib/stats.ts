import type { Assignment, DutyScope, DutyType, ISODate, Person, PersonStatRow } from '../types'
import { JOURNAL_META, normalizeJournalId } from '../types'
import { diffDays, todayISO } from './dates'

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

/** Записи, що змінюють сумарні бали людини (наряди + стягнення/заохочення). */
export function isRatingAssignment(a: Assignment): boolean {
  const id = normalizeJournalId(a.journalId)
  return JOURNAL_META[id]?.affectsRating !== false
}

/** Записи, що впливають на відпочинок і лічильник нарядів (лише журнал нарядів). */
export function isDutyHistoryAssignment(a: Assignment): boolean {
  return normalizeJournalId(a.journalId) === 'duties'
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
  const restAsOf = asOf ?? todayISO()

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
    if (!isRatingAssignment(a)) continue
    const s = map.get(a.personId)
    if (!s) continue

    const isDuty = isDutyHistoryAssignment(a)

    // Відпочинок — лише за нарядами, що вже були (не майбутні плани).
    if (isDuty && a.date <= restAsOf) {
      if (!s.lastDate || a.date > s.lastDate) {
        s.lastDate = a.date
        s.lastDutyTypeId = a.dutyTypeId
      }
    }

    if (!inPeriod(a, period)) continue
    s.points += a.points
    s.earnedPoints += a.points
    if (!isDuty) continue
    s.count += 1
    s.countByDuty[a.dutyTypeId] = (s.countByDuty[a.dutyTypeId] ?? 0) + 1
    s.pointsByDuty[a.dutyTypeId] = (s.pointsByDuty[a.dutyTypeId] ?? 0) + a.points
  }

  if (asOf) {
    for (const s of map.values()) {
      s.daysSinceLast = s.lastDate ? Math.max(0, diffDays(asOf, s.lastDate)) : null
    }
  }

  return map
}

export function activeDutyTypes(dutyTypes: DutyType[], scope?: DutyScope): DutyType[] {
  return dutyTypes
    .filter((d) => !d.archived && (scope ? (d.scope ?? 'duties') === scope : true))
    .sort((a, b) => a.order - b.order)
}

export function sortedDutyTypes(dutyTypes: DutyType[], scope?: DutyScope): DutyType[] {
  return [...dutyTypes]
    .filter((d) => (scope ? (d.scope ?? 'duties') === scope : true))
    .sort((a, b) => a.order - b.order)
}

export function emptyStatRow(personId: string): PersonStatRow {
  return {
    personId,
    earnedPoints: 0,
    count: 0,
    lastDate: null,
    lastDutyTypeId: null,
    countByDuty: {},
    pointsByDuty: {},
  }
}

/** Агрегат з сирих записів однієї людини. */
export function statRowFromAssignments(
  personId: string,
  list: Assignment[],
  asOf: ISODate = todayISO(),
): PersonStatRow {
  const row = emptyStatRow(personId)
  for (const a of list) {
    if (!isRatingAssignment(a)) continue
    row.earnedPoints += a.points
    if (!isDutyHistoryAssignment(a)) continue
    row.count += 1
    row.countByDuty[a.dutyTypeId] = (row.countByDuty[a.dutyTypeId] ?? 0) + 1
    row.pointsByDuty[a.dutyTypeId] = (row.pointsByDuty[a.dutyTypeId] ?? 0) + a.points
    if (a.date <= asOf && (!row.lastDate || a.date > row.lastDate)) {
      row.lastDate = a.date
      row.lastDutyTypeId = a.dutyTypeId
    }
  }
  return row
}

export function applyAddToStat(row: PersonStatRow, a: Assignment, asOf: ISODate = todayISO()): PersonStatRow {
  if (!isRatingAssignment(a)) return row
  if (!isDutyHistoryAssignment(a)) {
    return { ...row, earnedPoints: row.earnedPoints + a.points }
  }
  const countByDuty = { ...row.countByDuty, [a.dutyTypeId]: (row.countByDuty[a.dutyTypeId] ?? 0) + 1 }
  const pointsByDuty = { ...row.pointsByDuty, [a.dutyTypeId]: (row.pointsByDuty[a.dutyTypeId] ?? 0) + a.points }
  const pastOrToday = a.date <= asOf
  const prevLast =
    row.lastDate && row.lastDate > asOf ? null : row.lastDate
  const newer = pastOrToday && (!prevLast || a.date >= prevLast)
  return {
    ...row,
    earnedPoints: row.earnedPoints + a.points,
    count: row.count + 1,
    countByDuty,
    pointsByDuty,
    lastDate: newer ? a.date : prevLast,
    lastDutyTypeId: newer ? a.dutyTypeId : prevLast ? row.lastDutyTypeId : null,
  }
}

/** Рейтинг «весь час» з таблиці агрегатів — без скану журналу. */
export function statsFromRows(
  people: Person[],
  rows: PersonStatRow[],
  asOf?: ISODate,
): Map<string, PersonStats> {
  const byId = new Map(rows.map((r) => [r.personId, r]))
  const map = new Map<string, PersonStats>()
  const asOfDate = asOf ?? todayISO()
  for (const person of people) {
    const r = byId.get(person.id) ?? emptyStatRow(person.id)
    const lastDate = r.lastDate && r.lastDate <= asOfDate ? r.lastDate : null
    map.set(person.id, {
      person,
      points: person.basePoints + r.earnedPoints,
      earnedPoints: r.earnedPoints,
      count: r.count,
      countByDuty: r.countByDuty,
      pointsByDuty: r.pointsByDuty,
      lastDate,
      lastDutyTypeId: lastDate ? r.lastDutyTypeId : null,
      daysSinceLast: lastDate ? Math.max(0, diffDays(asOfDate, lastDate)) : null,
    })
  }
  return map
}
