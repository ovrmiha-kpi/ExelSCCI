import Dexie, { type Table } from 'dexie'
import type { AppData, Assignment, DutyType, ISODate, Person, PersonStatRow, Settings } from './types'
import { isConductKind, normalizeJournalId, normalizePersonTags } from './types'
import { defaultDutyTypes, normalizeDuty } from './lib/defaults'
import { createC55People, isPlaceholderRoster, tagsForKnownName } from './lib/groupC55'
import { applyAddToStat, emptyStatRow, isRatingAssignment, statRowFromAssignments } from './lib/stats'
import { addDaysISO, assignmentOverlapsRange, todayISO } from './lib/dates'
import { normalizeSettings } from './lib/myropil'
import { uid } from './lib/id'

/**
 * IndexedDB: окремі таблиці + індекси.
 * Журнал участі (assignments) ніколи не читається цілком у UI —
 * лише діапазон дат або історія однієї людини. Рейтинг бере personStats.
 */
class DutyRankDB extends Dexie {
  people!: Table<Person, string>
  dutyTypes!: Table<DutyType, string>
  assignments!: Table<Assignment, string>
  personStats!: Table<PersonStatRow, string>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('dutyrank')
    this.version(1).stores({
      people: 'id, name, group, status',
      dutyTypes: 'id, order, archived',
      assignments: 'id, date, personId, dutyTypeId, [date+personId], [personId+date], [dutyTypeId+date]',
      meta: 'key',
    })
    this.version(2)
      .stores({
        people: 'id, name, group, status',
        dutyTypes: 'id, order, archived',
        assignments: 'id, date, personId, dutyTypeId, [date+personId], [personId+date], [dutyTypeId+date]',
        personStats: 'personId, lastDate',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const assignments = await tx.table('assignments').toArray()
        const byPerson = new Map<string, Assignment[]>()
        for (const a of assignments as Assignment[]) {
          const list = byPerson.get(a.personId)
          if (list) list.push(a)
          else byPerson.set(a.personId, [a])
        }
        const people = await tx.table('people').toArray()
        const rows: PersonStatRow[] = (people as Person[]).map((p) =>
          statRowFromAssignments(p.id, byPerson.get(p.id) ?? []),
        )
        if (rows.length) await tx.table('personStats').bulkPut(rows)
      })
    this.version(3)
      .stores({
        people: 'id, name, group, status',
        dutyTypes: 'id, order, archived',
        assignments:
          'id, date, personId, dutyTypeId, journalId, [journalId+date], [date+personId], [personId+date], [dutyTypeId+date]',
        personStats: 'personId, lastDate',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const table = tx.table('assignments')
        const all = (await table.toArray()) as Assignment[]
        const asOf = todayISO()
        for (const a of all) {
          await table.put({ ...a, journalId: normalizeJournalId(a.journalId) })
        }
        // Перерахунок lastDate без майбутніх планів.
        const byPerson = new Map<string, Assignment[]>()
        const refreshed = (await table.toArray()) as Assignment[]
        for (const a of refreshed) {
          const list = byPerson.get(a.personId)
          if (list) list.push(a)
          else byPerson.set(a.personId, [a])
        }
        const people = await tx.table('people').toArray()
        const rows: PersonStatRow[] = (people as Person[]).map((p) =>
          statRowFromAssignments(p.id, byPerson.get(p.id) ?? [], asOf),
        )
        if (rows.length) await tx.table('personStats').bulkPut(rows)
      })
    this.version(4).upgrade(async (tx) => {
      const table = tx.table('assignments')
      const all = (await table.toArray()) as Array<Assignment & { journalId?: string }>
      for (const a of all) {
        const raw = a.journalId as string | undefined
        if (raw === 'penalties' || raw === 'rewards') {
          await table.put({
            ...a,
            journalId: 'conduct',
            dutyTypeId: isConductKind(a.dutyTypeId)
              ? a.dutyTypeId
              : raw === 'rewards'
                ? 'reward'
                : 'penalty',
          })
        } else if (raw === 'conduct' && !isConductKind(a.dutyTypeId)) {
          await table.put({
            ...a,
            journalId: 'conduct',
            dutyTypeId: a.points < 0 ? 'penalty' : 'reward',
          })
        } else {
          await table.put({ ...a, journalId: normalizeJournalId(a.journalId) })
        }
      }
    })
    // Стягнення/заохочення тепер входять у бали рейтингу — перерахунок personStats.
    this.version(5).upgrade(async (tx) => {
      const assignments = (await tx.table('assignments').toArray()) as Assignment[]
      const byPerson = new Map<string, Assignment[]>()
      for (const a of assignments) {
        const list = byPerson.get(a.personId)
        if (list) list.push(a)
        else byPerson.set(a.personId, [a])
      }
      const people = (await tx.table('people').toArray()) as Person[]
      const asOf = todayISO()
      const rows: PersonStatRow[] = people.map((p) =>
        statRowFromAssignments(p.id, byPerson.get(p.id) ?? [], asOf),
      )
      await tx.table('personStats').clear()
      if (rows.length) await tx.table('personStats').bulkPut(rows)
    })
    // Груповий скоуп dutyTypes + spanDays на assignments.
    this.version(6)
      .stores({
        people: 'id, name, group, status',
        dutyTypes: 'id, order, archived, group',
        assignments:
          'id, date, personId, dutyTypeId, journalId, [journalId+date], [date+personId], [personId+date], [dutyTypeId+date]',
        personStats: 'personId, lastDate',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const duties = (await tx.table('dutyTypes').toArray()) as DutyType[]
        for (const d of duties) {
          await tx.table('dutyTypes').put(normalizeDuty({ ...d, group: d.group ?? '' }))
        }
        const assigns = (await tx.table('assignments').toArray()) as Assignment[]
        for (const a of assigns) {
          await tx.table('assignments').put({
            ...a,
            journalId: normalizeJournalId(a.journalId),
            variantId: a.variantId ?? null,
            spanDays: Math.max(1, Math.floor(Number(a.spanDays) || 1)),
          })
        }
      })
  }
}

export const db = new DutyRankDB()

const SETTINGS_KEY = 'settings'
const SETTINGS_GROUP_PREFIX = 'settings:'
const ROSTER_KEY = 'rosterId'
const ROSTER_C55 = 'c55-v1'
const LEGACY_LS_KEY = 'dutyrank:data:v1'

export function settingsKeyForGroup(group: string | null | undefined): string {
  if (group && group.trim()) return SETTINGS_GROUP_PREFIX + group.trim()
  return SETTINGS_KEY
}

function withTags(p: Person): Person {
  const existing = normalizePersonTags(p.tags)
  const known = tagsForKnownName(p.name)
  return {
    ...p,
    tags: existing.length ? existing : (known ?? []),
    excludedDutyIds: Array.isArray(p.excludedDutyIds) ? p.excludedDutyIds : [],
  }
}

/** Сіє групу С-55 один раз (порожній або демо-склад). Далі лише підставляє теги ж/к за ПІБ. */
export async function ensureC55Roster(): Promise<void> {
  const [people, rosterRow] = await Promise.all([db.people.toArray(), db.meta.get(ROSTER_KEY)])
  const already = rosterRow?.value === ROSTER_C55
  if (!already && (people.length === 0 || isPlaceholderRoster(people))) {
    const roster = createC55People()
    const stats = roster.map((p) => emptyStatRow(p.id))
    await db.transaction('rw', db.people, db.assignments, db.personStats, db.meta, async () => {
      await db.people.clear()
      await db.assignments.clear()
      await db.personStats.clear()
      await db.people.bulkPut(roster)
      await db.personStats.bulkPut(stats)
      await db.meta.put({ key: ROSTER_KEY, value: ROSTER_C55 })
    })
    return
  }
  const next = people.map(withTags)
  const dirty = next.some((p, i) => JSON.stringify(p.tags) !== JSON.stringify(people[i].tags ?? []))
  if (dirty) await db.people.bulkPut(next)
  if (!already) await db.meta.put({ key: ROSTER_KEY, value: ROSTER_C55 })
}

export async function loadCore(group?: string | null): Promise<{
  people: Person[]
  dutyTypes: DutyType[]
  settings: Settings
  stats: PersonStatRow[]
}> {
  const [people, dutyTypes, globalSettingsRow, groupSettingsRow, stats] = await Promise.all([
    db.people.toArray(),
    db.dutyTypes.toArray(),
    db.meta.get(SETTINGS_KEY),
    group ? db.meta.get(settingsKeyForGroup(group)) : Promise.resolve(undefined),
    db.personStats.toArray(),
  ])
  const settingsSrc =
    (groupSettingsRow?.value as Partial<Settings> | undefined) ??
    (globalSettingsRow?.value as Partial<Settings> | undefined)
  const normalized = dutyTypes.map(normalizeDuty)
  const g = group && group.trim() ? group.trim() : null
  const scoped = g ? normalized.filter((d) => d.group === g) : []
  return {
    people,
    dutyTypes: scoped,
    settings: normalizeSettings(settingsSrc),
    stats,
  }
}

export async function loadAll(): Promise<AppData> {
  const [people, dutyTypes, assignments, settingsRow] = await Promise.all([
    db.people.toArray(),
    db.dutyTypes.toArray(),
    db.assignments.toArray(),
    db.meta.get(SETTINGS_KEY),
  ])
  return {
    people,
    dutyTypes: dutyTypes.map(normalizeDuty),
    assignments: assignments.map(normalizeAssignment),
    settings: normalizeSettings(settingsRow?.value as Partial<Settings> | undefined),
  }
}

export function normalizeAssignment(a: Assignment): Assignment {
  return {
    ...a,
    journalId: normalizeJournalId(a.journalId),
    variantId: a.variantId ?? null,
    spanDays: Math.max(1, Math.floor(Number(a.spanDays) || 1)),
  }
}

export async function assignmentsBetween(from: ISODate, to: ISODate): Promise<Assignment[]> {
  // Span може початися раніше from — дивимось до 90 днів назад.
  const lookFrom = addDaysISO(from, -90)
  const raw = await db.assignments.where('date').between(lookFrom, to, true, true).toArray()
  return raw.map(normalizeAssignment).filter((a) => assignmentOverlapsRange(a, from, to))
}

export async function assignmentsForPerson(personId: string): Promise<Assignment[]> {
  return (await db.assignments.where('personId').equals(personId).toArray()).map(normalizeAssignment)
}

export async function assignmentsOnDate(date: ISODate): Promise<Assignment[]> {
  const lookFrom = addDaysISO(date, -90)
  const raw = await db.assignments.where('date').between(lookFrom, date, true, true).toArray()
  return raw.map(normalizeAssignment).filter((a) => assignmentOverlapsRange(a, date, date))
}

export async function assignmentCount(): Promise<number> {
  return db.assignments.count()
}

export async function saveAll(data: AppData): Promise<void> {
  const stats = rebuildStatsFrom(data.people, data.assignments)
  await db.transaction('rw', db.people, db.dutyTypes, db.assignments, db.personStats, db.meta, async () => {
    await Promise.all([
      db.people.clear(),
      db.dutyTypes.clear(),
      db.assignments.clear(),
      db.personStats.clear(),
    ])
    await Promise.all([
      db.people.bulkPut(data.people),
      db.dutyTypes.bulkPut(data.dutyTypes),
      data.assignments.length ? db.assignments.bulkPut(data.assignments) : Promise.resolve(),
      stats.length ? db.personStats.bulkPut(stats) : Promise.resolve(),
      db.meta.put({ key: SETTINGS_KEY, value: data.settings }),
    ])
  })
}

export async function saveSettings(settings: Settings, group?: string | null): Promise<void> {
  await db.meta.put({ key: settingsKeyForGroup(group), value: settings })
  // Дублюємо в глобальний ключ, щоб старі шляхи / експорт не ламались.
  if (!group) await db.meta.put({ key: SETTINGS_KEY, value: settings })
}

/** Записати bundle групи з сервера в IndexedDB (локальний кеш) і повернути стан. */
export async function applyServerBundle(
  group: string,
  bundle: {
    people?: Person[]
    dutyTypes?: DutyType[]
    assignments?: Assignment[]
    settings?: Partial<Settings> | null
  },
): Promise<{
  people: Person[]
  dutyTypes: DutyType[]
  settings: Settings
  stats: PersonStatRow[]
}> {
  const g = group.trim()
  const people = (bundle.people ?? []).map((p) =>
    withTags({ ...p, group: p.group || g, tags: p.tags ?? [], excludedDutyIds: p.excludedDutyIds ?? [] }),
  )
  const dutyTypes = (bundle.dutyTypes ?? []).map((d) => normalizeDuty({ ...d, group: d.group || g }))
  const assignments = (bundle.assignments ?? []).map(normalizeAssignment)
  const settings = normalizeSettings(bundle.settings ?? undefined)

  const oldPeople = await db.people.where('group').equals(g).toArray()
  const oldIds = oldPeople.map((p) => p.id)

  await db.transaction('rw', db.people, db.dutyTypes, db.assignments, db.personStats, db.meta, async () => {
    await db.people.where('group').equals(g).delete()
    const allDuties = await db.dutyTypes.toArray()
    const toDel = allDuties.filter((d) => (d.group || '') === g).map((d) => d.id)
    if (toDel.length) await db.dutyTypes.bulkDelete(toDel)
    for (const id of oldIds) {
      await db.assignments.where('personId').equals(id).delete()
      await db.personStats.delete(id)
    }
    if (people.length) await db.people.bulkPut(people)
    if (dutyTypes.length) await db.dutyTypes.bulkPut(dutyTypes)
    if (assignments.length) await db.assignments.bulkPut(assignments)
    await saveSettings(settings, g)
    const stats = rebuildStatsFrom(people, assignments)
    if (stats.length) await db.personStats.bulkPut(stats)
  })

  const allPeople = await db.people.toArray()
  const stats = await db.personStats.toArray()
  return {
    people: allPeople,
    dutyTypes,
    settings,
    stats,
  }
}

/** Переконатись, що для групи є settings і види нарядів. */
export async function ensureGroupContext(group: string): Promise<void> {
  const g = group.trim()
  if (!g) return
  const key = settingsKeyForGroup(g)
  const existing = await db.meta.get(key)
  if (!existing) {
    const global = await db.meta.get(SETTINGS_KEY)
    await db.meta.put({
      key,
      value: normalizeSettings(global?.value as Partial<Settings> | undefined),
    })
  }
  const duties = (await db.dutyTypes.toArray()).map(normalizeDuty)
  const forGroup = duties.filter((d) => d.group === g)
  if (forGroup.length > 0) return

  const templates = duties.filter((d) => !d.group || d.group === '')
  const anyScoped = duties.some((d) => d.group && d.group !== '')

  if (templates.length > 0 && !anyScoped) {
    // Старі дані без групового скоупу — привʼязати до цієї групи (ті самі id → журнал не ламається).
    await db.dutyTypes.bulkPut(templates.map((d) => normalizeDuty({ ...d, group: g })))
    return
  }
  if (templates.length > 0) {
    const clones = templates.map((d, i) =>
      normalizeDuty({
        ...d,
        id: uid(),
        group: g,
        order: i,
      }),
    )
    await db.dutyTypes.bulkPut(clones)
    return
  }
  await db.dutyTypes.bulkPut(defaultDutyTypes(g))
}

export function rebuildStatsFrom(people: Person[], assignments: Assignment[]): PersonStatRow[] {
  const byPerson = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const list = byPerson.get(a.personId)
    if (list) list.push(a)
    else byPerson.set(a.personId, [a])
  }
  return people.map((p) => statRowFromAssignments(p.id, byPerson.get(p.id) ?? []))
}

export async function rebuildPersonStat(personId: string): Promise<PersonStatRow> {
  const list = await db.assignments.where('personId').equals(personId).toArray()
  const row = statRowFromAssignments(personId, list)
  await db.personStats.put(row)
  return row
}

export async function bumpStatOnAdd(a: Assignment): Promise<PersonStatRow> {
  if (!isRatingAssignment(a)) {
    return (await db.personStats.get(a.personId)) ?? emptyStatRow(a.personId)
  }
  const prev = (await db.personStats.get(a.personId)) ?? emptyStatRow(a.personId)
  const next = applyAddToStat(prev, a)
  await db.personStats.put(next)
  return next
}

export async function isEmpty(): Promise<boolean> {
  const [p, d, a] = await Promise.all([db.people.count(), db.dutyTypes.count(), db.assignments.count()])
  return p + d + a === 0
}

export function readLegacyLocalStorage(): AppData | null {
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: Partial<AppData> }
    const s = parsed.state
    if (!s || !Array.isArray(s.people) || !Array.isArray(s.dutyTypes) || !Array.isArray(s.assignments)) return null
    return {
      people: s.people,
      dutyTypes: s.dutyTypes,
      assignments: s.assignments,
      settings: normalizeSettings(s.settings),
    }
  } catch {
    return null
  }
}

export function clearLegacyLocalStorage() {
  try {
    localStorage.removeItem(LEGACY_LS_KEY)
  } catch {
    /* ignore */
  }
}

export function freshData(): AppData {
  return {
    people: [],
    dutyTypes: defaultDutyTypes(),
    assignments: [],
    settings: normalizeSettings(),
  }
}

export async function bootstrap(): Promise<{
  people: Person[]
  dutyTypes: DutyType[]
  settings: Settings
  stats: PersonStatRow[]
}> {
  if (await isEmpty()) {
    const legacy = readLegacyLocalStorage()
    const data = legacy ?? freshData()
    await saveAll(data)
    if (legacy) clearLegacyLocalStorage()
  }

  await ensureC55Roster()

  const core = await loadCore()
  if (core.people.length > 0 && core.stats.length === 0) {
    const assignments = await db.assignments.toArray()
    const stats = rebuildStatsFrom(core.people, assignments)
    if (stats.length) await db.personStats.bulkPut(stats)
    return { ...core, stats }
  }
  return core
}
