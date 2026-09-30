import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Assignment, ISODate, JournalId } from '../types'
import { addDaysISO, assignmentOverlapsRange } from './dates'

/** Записи журналу за видимий діапазон (+ наряди, що почались раніше, але ще тривають). */
export function useAssignmentsRange(
  from: ISODate,
  to: ISODate,
  journalId?: JournalId,
): Assignment[] {
  return (
    useLiveQuery(async () => {
      if (!from || !to) return []
      // Span може початися раніше from (напр. кінець попереднього місяця).
      const lookFrom = addDaysISO(from, -90)
      const raw = journalId
        ? await db.assignments
            .where('[journalId+date]')
            .between([journalId, lookFrom], [journalId, to], true, true)
            .toArray()
        : await db.assignments.where('date').between(lookFrom, to, true, true).toArray()
      return raw.filter((a) => assignmentOverlapsRange(a, from, to))
    }, [from, to, journalId]) ?? []
  )
}

export function usePersonDayAssignments(
  personId: string,
  date: ISODate,
  journalId?: JournalId,
): Assignment[] {
  return (
    useLiveQuery(async () => {
      const lookFrom = addDaysISO(date, -90)
      const raw = await db.assignments
        .where('[personId+date]')
        .between([personId, lookFrom], [personId, date], true, true)
        .toArray()
      const overlapping = raw.filter((a) => assignmentOverlapsRange(a, date, date))
      return journalId
        ? overlapping.filter((a) => (a.journalId ?? 'duties') === journalId)
        : overlapping
    }, [personId, date, journalId]) ?? []
  )
}

export function usePersonAssignments(personId: string | null): Assignment[] {
  return (
    useLiveQuery(
      () => (personId ? db.assignments.where('personId').equals(personId).toArray() : []),
      [personId],
    ) ?? []
  )
}

export function useAssignmentsOnDate(date: ISODate, journalId?: JournalId): Assignment[] {
  return (
    useLiveQuery(async () => {
      const lookFrom = addDaysISO(date, -90)
      const raw = await db.assignments.where('date').between(lookFrom, date, true, true).toArray()
      const overlapping = raw.filter((a) => assignmentOverlapsRange(a, date, date))
      return journalId
        ? overlapping.filter((a) => (a.journalId ?? 'duties') === journalId)
        : overlapping
    }, [date, journalId]) ?? []
  )
}

export function useAssignmentCount(): number {
  return useLiveQuery(() => db.assignments.count()) ?? 0
}

export function useRangeLoading(from: ISODate, to: ISODate): boolean {
  const data = useLiveQuery(async () => {
    if (!from || !to) return []
    const lookFrom = addDaysISO(from, -90)
    return db.assignments.where('date').between(lookFrom, to, true, true).toArray()
  }, [from, to])
  return data === undefined
}
