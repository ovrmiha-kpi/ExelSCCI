import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Assignment, ISODate, JournalId } from '../types'

/** Записи журналу лише за видимий діапазон дат (+ опційно журнал). */
export function useAssignmentsRange(
  from: ISODate,
  to: ISODate,
  journalId?: JournalId,
): Assignment[] {
  return (
    useLiveQuery(async () => {
      if (!from || !to) return []
      if (journalId) {
        return db.assignments
          .where('[journalId+date]')
          .between([journalId, from], [journalId, to], true, true)
          .toArray()
      }
      return db.assignments.where('date').between(from, to, true, true).toArray()
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
      const list = await db.assignments.where('[personId+date]').equals([personId, date]).toArray()
      return journalId ? list.filter((a) => (a.journalId ?? 'duties') === journalId) : list
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
      const list = await db.assignments.where('date').equals(date).toArray()
      return journalId ? list.filter((a) => (a.journalId ?? 'duties') === journalId) : list
    }, [date, journalId]) ?? []
  )
}

export function useAssignmentCount(): number {
  return useLiveQuery(() => db.assignments.count()) ?? 0
}

export function useRangeLoading(from: ISODate, to: ISODate): boolean {
  const data = useLiveQuery(
    () => db.assignments.where('date').between(from, to, true, true).toArray(),
    [from, to],
  )
  return data === undefined
}
