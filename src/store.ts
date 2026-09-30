import { create } from 'zustand'
import type { AppData, Assignment, DutyType, Person, PersonStatRow, PersonTag, Settings } from './types'
import { DEFAULT_SETTINGS, normalizeJournalId, normalizePersonTags } from './types'
import { normalizeSettings } from './lib/myropil'
import { uid } from './lib/id'
import { DUTY_COLORS, normalizeDuty } from './lib/defaults'
import { toISO } from './lib/dates'
import { createC55People } from './lib/groupC55'
import { applyAddToStat, emptyStatRow } from './lib/stats'
import { applyTheme, isThemeId, readStoredTheme } from './lib/theme'
import {
  bootstrap,
  bumpStatOnAdd,
  db,
  ensureGroupContext,
  applyServerBundle,
  freshData,
  loadAll,
  loadCore,
  rebuildPersonStat,
  rebuildStatsFrom,
  saveAll,
  saveSettings,
  normalizeAssignment,
} from './db'
import { apiGetBundle, apiPutBundle, detectApiMode, isApiMode } from './lib/api'

type PersonInput = Omit<Person, 'id' | 'createdAt'>
type DutyTypeInput = Omit<DutyType, 'id' | 'order' | 'archived'>
type AssignmentInput = Omit<Assignment, 'id' | 'createdAt' | 'spanDays'> & { spanDays?: number }

interface Actions {
  hydrated: boolean
  dbError: string | null
  stats: PersonStatRow[]
  hydrate: () => Promise<void>

  addPerson: (p: Partial<PersonInput> & { name: string }) => Person
  addPeopleBulk: (rows: Array<Partial<PersonInput> & { name: string }>) => number
  updatePerson: (id: string, patch: Partial<PersonInput>) => void
  removePerson: (id: string) => void

  addDutyType: (d: Partial<DutyTypeInput> & { name: string }) => DutyType
  updateDutyType: (id: string, patch: Partial<Omit<DutyType, 'id'>>) => void
  removeDutyType: (id: string) => void
  moveDutyType: (id: string, dir: -1 | 1) => void
  reorderDutyTypes: (orderedIds: string[]) => void

  addAssignment: (a: AssignmentInput) => Assignment
  addAssignments: (list: Assignment[]) => void
  updateAssignment: (id: string, patch: Partial<AssignmentInput>) => void
  removeAssignment: (id: string) => void
  removeAssignments: (ids: string[]) => void
  removeAssignmentsByDate: (date: string) => void

  updateSettings: (patch: Partial<Settings>) => void

  /** Робоча група канцелярії — перезавантажує settings/dutyTypes. */
  workspaceGroup: string | null
  setWorkspaceGroup: (group: string | null) => Promise<void>

  replaceAll: (data: AppData) => void
  resetAll: () => void
  loadDemo: () => void
  loadGroupC55: () => void
}

export type Store = {
  people: Person[]
  dutyTypes: DutyType[]
  settings: Settings
  stats: PersonStatRow[]
  workspaceGroup: string | null
} & Actions

function persist(op: () => Promise<unknown>) {
  op()
    .then(() => scheduleServerSync())
    .catch((e: unknown) => {
      console.error('[db]', e)
      useStore.setState({ dbError: e instanceof Error ? e.message : String(e) })
    })
}

let syncTimer: ReturnType<typeof setTimeout> | null = null

async function pushGroupBundleToServer() {
  if (!isApiMode()) return
  const group = useStore.getState().workspaceGroup
  if (!group) return
  const state = useStore.getState()
  const people = state.people.filter((p) => p.group === group)
  const dutyTypes = state.dutyTypes.filter((d) => (d.group || '') === group)
  const personIds = new Set(people.map((p) => p.id))
  const allA = await db.assignments.toArray()
  const assignments = allA
    .filter((a) => personIds.has(a.personId))
    .map(normalizeAssignment)
  await apiPutBundle(group, {
    people,
    dutyTypes,
    assignments,
    settings: state.settings,
  })
}

function scheduleServerSync() {
  if (!isApiMode()) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    pushGroupBundleToServer().catch((e: unknown) => {
      console.error('[api]', e)
      useStore.setState({ dbError: e instanceof Error ? e.message : String(e) })
    })
  }, 450)
}

function patchStat(stats: PersonStatRow[], row: PersonStatRow): PersonStatRow[] {
  const i = stats.findIndex((s) => s.personId === row.personId)
  if (i < 0) return [...stats, row]
  const next = stats.slice()
  next[i] = row
  return next
}

function dropStat(stats: PersonStatRow[], personId: string): PersonStatRow[] {
  return stats.filter((s) => s.personId !== personId)
}

export const useStore = create<Store>()((set, get) => ({
  people: [],
  dutyTypes: [],
  settings: { ...DEFAULT_SETTINGS },
  stats: [],
  workspaceGroup: null,
  hydrated: false,
  dbError: null,

  hydrate: async () => {
    try {
      await detectApiMode()
      const data = await bootstrap()
      const theme = isThemeId(data.settings.theme)
        ? data.settings.theme
        : (readStoredTheme() ?? DEFAULT_SETTINGS.theme)
      const settings = { ...data.settings, theme }
      applyTheme(theme)
      set({
        people: data.people,
        dutyTypes: data.dutyTypes.map(normalizeDuty),
        settings,
        stats: data.stats,
        hydrated: true,
      })
    } catch (e) {
      console.error('[db] bootstrap', e)
      const fallback = freshData()
      applyTheme(fallback.settings.theme)
      set({
        people: fallback.people,
        dutyTypes: fallback.dutyTypes.map(normalizeDuty),
        settings: fallback.settings,
        stats: [],
        hydrated: true,
        dbError: e instanceof Error ? e.message : String(e),
      })
    }
  },

  setWorkspaceGroup: async (group) => {
    const g = group && group.trim() ? group.trim() : null
    try {
      if (g && isApiMode()) {
        const bundle = await apiGetBundle(g)
        const isEmptyBundle =
          (!bundle.people || bundle.people.length === 0) &&
          (!bundle.dutyTypes || bundle.dutyTypes.length === 0) &&
          (!bundle.assignments || bundle.assignments.length === 0) &&
          (!bundle.settings || Object.keys(bundle.settings as object).length === 0)
        if (isEmptyBundle) {
          await ensureGroupContext(g)
          const core = await loadCore(g)
          await apiPutBundle(g, {
            people: core.people.filter((p) => p.group === g),
            dutyTypes: core.dutyTypes,
            assignments: (await db.assignments.toArray())
              .filter((a) => core.people.some((p) => p.id === a.personId && p.group === g))
              .map(normalizeAssignment),
            settings: core.settings,
          })
          const again = await apiGetBundle(g)
          const applied = await applyServerBundle(g, {
            people: again.people as Person[],
            dutyTypes: again.dutyTypes as DutyType[],
            assignments: again.assignments as Assignment[],
            settings: again.settings as Partial<Settings> | null,
          })
          const theme = isThemeId(applied.settings.theme)
            ? applied.settings.theme
            : (get().settings.theme ?? DEFAULT_SETTINGS.theme)
          applyTheme(theme)
          set({
            workspaceGroup: g,
            people: applied.people,
            dutyTypes: applied.dutyTypes.map(normalizeDuty),
            settings: { ...applied.settings, theme },
            stats: applied.stats,
          })
          return
        }
        const applied = await applyServerBundle(g, {
          people: bundle.people as Person[],
          dutyTypes: bundle.dutyTypes as DutyType[],
          assignments: bundle.assignments as Assignment[],
          settings: bundle.settings as Partial<Settings> | null,
        })
        const theme = isThemeId(applied.settings.theme)
          ? applied.settings.theme
          : (get().settings.theme ?? DEFAULT_SETTINGS.theme)
        applyTheme(theme)
        set({
          workspaceGroup: g,
          people: applied.people,
          dutyTypes: applied.dutyTypes.map(normalizeDuty),
          settings: { ...applied.settings, theme },
          stats: applied.stats,
        })
        return
      }

      if (g) await ensureGroupContext(g)
      const core = await loadCore(g)
      const theme = isThemeId(core.settings.theme)
        ? core.settings.theme
        : (get().settings.theme ?? DEFAULT_SETTINGS.theme)
      const settings = g
        ? { ...core.settings, theme }
        : normalizeSettings({
            ...DEFAULT_SETTINGS,
            theme,
            myropilStays: core.settings.myropilStays ?? [],
            squadRanges: core.settings.squadRanges ?? [],
          })
      applyTheme(theme)
      set({
        workspaceGroup: g,
        dutyTypes: g ? core.dutyTypes.map(normalizeDuty) : [],
        settings,
        people: core.people,
        stats: core.stats,
      })
    } catch (e) {
      console.error('[workspace]', e)
      set({ dbError: e instanceof Error ? e.message : String(e) })
    }
  },

  addPerson: (p) => {
    const person: Person = {
      id: uid(),
      name: p.name.trim(),
      group: (p.group ?? '').trim(),
      status: p.status ?? 'active',
      basePoints: Number(p.basePoints ?? 0) || 0,
      note: p.note ?? '',
      tags: normalizePersonTags(p.tags),
      excludedDutyIds: [...(p.excludedDutyIds ?? [])],
      createdAt: Date.now(),
    }
    const row = emptyStatRow(person.id)
    set((s) => ({ people: [...s.people, person], stats: [...s.stats, row] }))
    persist(async () => {
      await db.people.put(person)
      await db.personStats.put(row)
    })
    return person
  },

  addPeopleBulk: (rows) => {
    const now = Date.now()
    const existing = new Set(get().people.map((p) => p.name.trim().toLowerCase()))
    const fresh: Person[] = []
    for (const r of rows) {
      const name = r.name.trim()
      if (!name || existing.has(name.toLowerCase())) continue
      existing.add(name.toLowerCase())
      fresh.push({
        id: uid(),
        name,
        group: (r.group ?? '').trim(),
        status: r.status ?? 'active',
        basePoints: Number(r.basePoints ?? 0) || 0,
        note: r.note ?? '',
        tags: normalizePersonTags(r.tags),
        excludedDutyIds: [...(r.excludedDutyIds ?? [])],
        createdAt: now,
      })
    }
    if (fresh.length) {
      const statRows = fresh.map((p) => emptyStatRow(p.id))
      set((s) => ({ people: [...s.people, ...fresh], stats: [...s.stats, ...statRows] }))
      persist(async () => {
        await db.people.bulkPut(fresh)
        await db.personStats.bulkPut(statRows)
      })
    }
    return fresh.length
  },

  updatePerson: (id, patch) => {
    set((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
    persist(() => db.people.update(id, patch))
  },

  removePerson: (id) => {
    set((s) => ({
      people: s.people.filter((p) => p.id !== id),
      stats: dropStat(s.stats, id),
    }))
    persist(() =>
      db.transaction('rw', db.people, db.assignments, db.personStats, async () => {
        await db.people.delete(id)
        await db.assignments.where('personId').equals(id).delete()
        await db.personStats.delete(id)
      }),
    )
  },

  addDutyType: (d) => {
    const list = get().dutyTypes
    const group = get().workspaceGroup ?? d.group ?? ''
    const isMainDuty = Boolean(d.isMainDuty)
    const duty = normalizeDuty({
      id: uid(),
      name: d.name.trim(),
      short: (d.short ?? d.name.slice(0, 3)).trim().toUpperCase(),
      points: isMainDuty ? 0 : Number(d.points ?? 1) || 0,
      defaultSlots: Math.max(1, Number(d.defaultSlots ?? 1) || 1),
      color: d.color ?? DUTY_COLORS[list.length % DUTY_COLORS.length],
      archived: false,
      order: list.length ? Math.max(...list.map((x) => x.order)) + 1 : 0,
      excludeTags: [...(d.excludeTags ?? [])],
      requireTags: [...(d.requireTags ?? [])],
      allowExtraPerson: Boolean(d.allowExtraPerson),
      variants: [...(d.variants ?? [])],
      scope: d.scope === 'myropil' ? 'myropil' : 'duties',
      cadenceMode: d.cadenceMode === 'maxStreak' ? 'maxStreak' : 'minGap',
      cadenceDays: Math.max(0, Number(d.cadenceDays) || 0),
      periodicityDays: Math.max(0, Number(d.periodicityDays) || 0),
      group,
      isMainDuty,
      durationDays: Math.max(1, Math.floor(Number(d.durationDays) || 1)),
      blocksFullDay: typeof d.blocksFullDay === 'boolean' ? Boolean(d.blocksFullDay) : false,
    })
    set((s) => ({ dutyTypes: [...s.dutyTypes, duty] }))
    persist(() => db.dutyTypes.put(duty))
    return duty
  },

  updateDutyType: (id, patch) => {
    const group = get().workspaceGroup
    set((s) => ({
      dutyTypes: s.dutyTypes.map((d) => {
        if (d.id !== id) return d
        const next = normalizeDuty({
          ...d,
          ...patch,
          group: group ?? d.group ?? '',
        })
        if (next.isMainDuty) next.points = 0
        return next
      }),
    }))
    persist(async () => {
      const cur = await db.dutyTypes.get(id)
      if (!cur) return
      const next = normalizeDuty({
        ...cur,
        ...patch,
        group: group ?? cur.group ?? '',
      })
      if (next.isMainDuty) next.points = 0
      await db.dutyTypes.put(next)
    })
  },

  removeDutyType: (id) => {
    const people = get().people
    set((s) => ({ dutyTypes: s.dutyTypes.filter((d) => d.id !== id) }))
    persist(async () => {
      await db.transaction('rw', db.dutyTypes, db.assignments, db.personStats, async () => {
        await db.dutyTypes.delete(id)
        await db.assignments.where('dutyTypeId').equals(id).delete()
      })
      const assignments = await db.assignments.toArray()
      const stats = rebuildStatsFrom(people, assignments)
      await db.personStats.clear()
      if (stats.length) await db.personStats.bulkPut(stats)
      useStore.setState({ stats })
    })
  },

  moveDutyType: (id, dir) => {
    const sorted = [...get().dutyTypes].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((d) => d.id === id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= sorted.length) return
    ;[sorted[idx], sorted[j]] = [sorted[j], sorted[idx]]
    const reordered = sorted.map((d, i) => ({ ...d, order: i }))
    set({ dutyTypes: reordered })
    persist(() => db.dutyTypes.bulkPut(reordered))
  },

  reorderDutyTypes: (orderedIds) => {
    const byId = new Map(get().dutyTypes.map((d) => [d.id, d]))
    const reordered = orderedIds
      .map((id, i) => {
        const d = byId.get(id)
        return d ? { ...d, order: i } : null
      })
      .filter((d): d is DutyType => !!d)
    const missing = get().dutyTypes.filter((d) => !orderedIds.includes(d.id))
    const rest = missing.map((d, i) => ({ ...d, order: reordered.length + i }))
    const next = [...reordered, ...rest]
    set({ dutyTypes: next })
    persist(() => db.dutyTypes.bulkPut(next))
  },

  addAssignment: (a) => {
    const item: Assignment = {
      ...a,
      journalId: a.journalId ?? 'duties',
      spanDays: Math.max(1, Math.floor(Number(a.spanDays) || 1)),
      id: uid(),
      createdAt: Date.now(),
    }
    const row = applyAddToStat(
      get().stats.find((s) => s.personId === item.personId) ?? emptyStatRow(item.personId),
      item,
    )
    set((s) => ({ stats: patchStat(s.stats, row) }))
    persist(async () => {
      await db.assignments.put(item)
      await bumpStatOnAdd(item)
    })
    return item
  },

  addAssignments: (list) => {
    if (!list.length) return
    const normalized = list.map((a) => ({
      ...a,
      journalId: a.journalId ?? 'duties',
      spanDays: Math.max(1, Math.floor(Number(a.spanDays) || 1)),
    }))
    set((s) => {
      let stats = s.stats
      for (const a of normalized) {
        const prev = stats.find((r) => r.personId === a.personId) ?? emptyStatRow(a.personId)
        stats = patchStat(stats, applyAddToStat(prev, a))
      }
      return { stats }
    })
    persist(async () => {
      await db.assignments.bulkPut(normalized)
      const ids = [...new Set(normalized.map((a) => a.personId))]
      const rows = await Promise.all(ids.map((id) => rebuildPersonStat(id)))
      useStore.setState((s) => {
        let stats = s.stats
        for (const row of rows) stats = patchStat(stats, row)
        return { stats }
      })
    })
  },

  updateAssignment: (id, patch) => {
    persist(async () => {
      const prev = await db.assignments.get(id)
      await db.assignments.update(id, patch)
      const personId = patch.personId ?? prev?.personId
      if (personId) {
        const row = await rebuildPersonStat(personId)
        if (prev && patch.personId && patch.personId !== prev.personId) {
          const oldRow = await rebuildPersonStat(prev.personId)
          useStore.setState((s) => ({ stats: patchStat(patchStat(s.stats, row), oldRow) }))
        } else {
          useStore.setState((s) => ({ stats: patchStat(s.stats, row) }))
        }
      }
    })
  },

  removeAssignment: (id) => {
    persist(async () => {
      const prev = await db.assignments.get(id)
      await db.assignments.delete(id)
      if (prev) {
        const row = await rebuildPersonStat(prev.personId)
        useStore.setState((s) => ({ stats: patchStat(s.stats, row) }))
      }
    })
  },

  removeAssignments: (ids) => {
    const unique = [...new Set(ids.filter(Boolean))]
    if (unique.length === 0) return
    persist(async () => {
      const prevList = await db.assignments.bulkGet(unique)
      const personIds = [
        ...new Set(prevList.filter(Boolean).map((a) => a!.personId)),
      ]
      await db.assignments.bulkDelete(unique)
      const rows = await Promise.all(personIds.map((id) => rebuildPersonStat(id)))
      useStore.setState((s) => {
        let stats = s.stats
        for (const row of rows) stats = patchStat(stats, row)
        return { stats }
      })
    })
  },

  removeAssignmentsByDate: (date) => {
    persist(async () => {
      const list = await db.assignments.where('date').equals(date).toArray()
      await db.assignments.where('date').equals(date).delete()
      const ids = [...new Set(list.map((a) => a.personId))]
      const rows = await Promise.all(ids.map((id) => rebuildPersonStat(id)))
      useStore.setState((s) => {
        let stats = s.stats
        for (const row of rows) stats = patchStat(stats, row)
        return { stats }
      })
    })
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    if (patch.theme) applyTheme(patch.theme)
    set({ settings })
    const group = get().workspaceGroup
    if (!group) return
    persist(() => saveSettings(settings, group))
  },

  replaceAll: (data) => {
    const stats = rebuildStatsFrom(data.people, data.assignments)
    const settings = normalizeSettings(data.settings)
    if (isThemeId(settings.theme)) applyTheme(settings.theme)
    set({
      people: data.people,
      dutyTypes: data.dutyTypes,
      settings,
      stats,
    })
    persist(() => saveAll({ ...data, settings }))
  },

  resetAll: () => {
    const next = freshData()
    applyTheme(next.settings.theme)
    set({
      people: next.people,
      dutyTypes: next.dutyTypes,
      settings: next.settings,
      stats: [],
    })
    persist(() => saveAll(next))
  },

  loadDemo: () => {
    const data = freshData()
    const names = [
      'Шевченко Т.Г.',
      'Коваленко О.В.',
      'Бондаренко І.М.',
      'Ткаченко А.С.',
      'Кравченко Д.П.',
      'Мельник В.О.',
      'Поліщук Р.І.',
      'Лисенко М.А.',
      'Романенко Ю.В.',
      'Савченко Б.О.',
      'Марченко Н.Д.',
      'Козак Є.Є.',
    ]
    const now = Date.now()
    data.people = names.map((name, i) => ({
      id: uid(),
      name,
      group: i < 6 ? '1 взвод' : '2 взвод',
      status: i === 7 ? 'sick' : 'active',
      basePoints: 0,
      note: '',
      tags: [] as PersonTag[],
      excludedDutyIds: [],
      createdAt: now,
    }))
    const duties = data.dutyTypes
    const today = new Date()
    for (let back = 14; back >= 1; back--) {
      const d = new Date(today)
      d.setDate(d.getDate() - back)
      const iso = toISO(d)
      const dn = duties[0]
      const pgd = duties[2]
      const pick = (k: number) => data.people[(back * 3 + k) % data.people.length]
      const mk = (duty: DutyType, person: Person): Assignment => ({
        id: uid(),
        journalId: 'duties',
        date: iso,
        dutyTypeId: duty.id,
        personId: person.id,
        variantId: null,
        points: duty.points,
        note: '',
        source: 'manual',
        spanDays: 1,
        createdAt: now,
      })
      data.assignments.push(mk(dn, pick(0)), mk(dn, pick(1)), mk(pgd, pick(2)))
    }
    get().replaceAll(data)
  },

  loadGroupC55: () => {
    const current = get()
    get().replaceAll({
      people: createC55People(),
      dutyTypes: current.dutyTypes.length ? current.dutyTypes : freshData().dutyTypes,
      assignments: [],
      settings: current.settings,
    })
  },
}))

export async function exportData(): Promise<AppData> {
  return loadAll()
}

export function parseImportedData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Файл не схожий на резервну копію ExelSCCI.')
  const o = raw as Partial<AppData>
  if (!Array.isArray(o.people) || !Array.isArray(o.dutyTypes) || !Array.isArray(o.assignments)) {
    throw new Error('У файлі немає обов’язкових розділів (people, dutyTypes, assignments).')
  }
  return {
    people: o.people.map((p) => ({
      ...p,
      tags: normalizePersonTags(p.tags),
      excludedDutyIds: Array.isArray(p.excludedDutyIds) ? p.excludedDutyIds : [],
    })),
    dutyTypes: o.dutyTypes.map((d) => normalizeDuty(d as DutyType)),
    assignments: o.assignments.map((a) => ({
      ...a,
      journalId: normalizeJournalId(a.journalId),
      variantId: a.variantId ?? null,
    })),
    settings: normalizeSettings(o.settings),
  }
}
