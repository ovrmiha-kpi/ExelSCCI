import type { Assignment, ISODate } from '../types'
import { addDaysISO, assignmentEndDate, assignmentSpanDays } from './dates'

export interface AssignmentIndex {
  /** personId|date → записи */
  byPersonDate: Map<string, Assignment[]>
  /** dutyTypeId|date → записи */
  byDutyDate: Map<string, Assignment[]>
  /** date → записи */
  byDate: Map<ISODate, Assignment[]>
}

export const key2 = (a: string, b: string) => `${a}|${b}`

/**
 * Індекси в пам'яті для сітки журналу: будуються один раз на зміну списку
 * і дають O(1) доступ до комірки замість фільтрації всього масиву.
 * Багатоденні assignment розгортаються на всі дні span (для зайнятості);
 * у UI блок малюється лише зі стартової дати.
 */
export function buildAssignmentIndex(assignments: Assignment[], from?: ISODate, to?: ISODate): AssignmentIndex {
  const byPersonDate = new Map<string, Assignment[]>()
  const byDutyDate = new Map<string, Assignment[]>()
  const byDate = new Map<ISODate, Assignment[]>()
  for (const a of assignments) {
    const span = assignmentSpanDays(a)
    const end = assignmentEndDate(a)
    if (to && a.date > to) continue
    if (from && end < from) continue
    for (let i = 0; i < span; i++) {
      const day = i === 0 ? a.date : addDaysISO(a.date, i)
      if (from && day < from) continue
      if (to && day > to) continue
      push(byPersonDate, key2(a.personId, day), a)
      push(byDutyDate, key2(a.dutyTypeId, day), a)
      push(byDate, day, a)
    }
  }
  return { byPersonDate, byDutyDate, byDate }
}

function push<K>(m: Map<K, Assignment[]>, k: K, a: Assignment) {
  const arr = m.get(k)
  if (arr) arr.push(a)
  else m.set(k, [a])
}
