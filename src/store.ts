import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppData, Assignment, DutyType, Person, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'
import { uid } from './lib/id'
import { defaultDutyTypes, DUTY_COLORS } from './lib/defaults'
import { toISO } from './lib/dates'

export const STORAGE_KEY = 'dutyrank:data:v1'

type PersonInput = Omit<Person, 'id' | 'createdAt'>
type DutyTypeInput = Omit<DutyType, 'id' | 'order' | 'archived'>
type AssignmentInput = Omit<Assignment, 'id' | 'createdAt'>

interface Actions {
  addPerson: (p: Partial<PersonInput> & { name: string }) => Person
  addPeopleBulk: (rows: Array<Partial<PersonInput> & { name: string }>) => number
  updatePerson: (id: string, patch: Partial<PersonInput>) => void
  removePerson: (id: string) => void

  addDutyType: (d: Partial<DutyTypeInput> & { name: string }) => DutyType
  updateDutyType: (id: string, patch: Partial<Omit<DutyType, 'id'>>) => void
  removeDutyType: (id: string) => void
  moveDutyType: (id: string, dir: -1 | 1) => void

  addAssignment: (a: AssignmentInput) => Assignment
  addAssignments: (list: Assignment[]) => void
  updateAssignment: (id: string, patch: Partial<AssignmentInput>) => void
  removeAssignment: (id: string) => void
  removeAssignmentsByDate: (date: string) => void

  updateSettings: (patch: Partial<Settings>) => void

  replaceAll: (data: AppData) => void
  resetAll: () => void
  loadDemo: () => void
}

export type Store = AppData & Actions

function initialData(): AppData {
  return {
    people: [],
    dutyTypes: defaultDutyTypes(),
    assignments: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialData(),

      addPerson: (p) => {
        const person: Person = {
          id: uid(),
          name: p.name.trim(),
          group: (p.group ?? '').trim(),
          status: p.status ?? 'active',
          basePoints: Number(p.basePoints ?? 0) || 0,
          note: p.note ?? '',
          createdAt: Date.now(),
        }
        set((s) => ({ people: [...s.people, person] }))
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
            createdAt: now,
          })
        }
        if (fresh.length) set((s) => ({ people: [...s.people, ...fresh] }))
        return fresh.length
      },

      updatePerson: (id, patch) =>
        set((s) => ({
          people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removePerson: (id) =>
        set((s) => ({
          people: s.people.filter((p) => p.id !== id),
          assignments: s.assignments.filter((a) => a.personId !== id),
        })),

      addDutyType: (d) => {
        const list = get().dutyTypes
        const duty: DutyType = {
          id: uid(),
          name: d.name.trim(),
          short: (d.short ?? d.name.slice(0, 3)).trim().toUpperCase(),
          points: Number(d.points ?? 1) || 0,
          defaultSlots: Math.max(1, Number(d.defaultSlots ?? 1) || 1),
          color: d.color ?? DUTY_COLORS[list.length % DUTY_COLORS.length],
          archived: false,
          order: list.length ? Math.max(...list.map((x) => x.order)) + 1 : 0,
        }
        set((s) => ({ dutyTypes: [...s.dutyTypes, duty] }))
        return duty
      },

      updateDutyType: (id, patch) =>
        set((s) => ({
          dutyTypes: s.dutyTypes.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),

      removeDutyType: (id) =>
        set((s) => ({
          dutyTypes: s.dutyTypes.filter((d) => d.id !== id),
          assignments: s.assignments.filter((a) => a.dutyTypeId !== id),
        })),

      moveDutyType: (id, dir) =>
        set((s) => {
          const sorted = [...s.dutyTypes].sort((a, b) => a.order - b.order)
          const idx = sorted.findIndex((d) => d.id === id)
          const j = idx + dir
          if (idx < 0 || j < 0 || j >= sorted.length) return {}
          ;[sorted[idx], sorted[j]] = [sorted[j], sorted[idx]]
          return { dutyTypes: sorted.map((d, i) => ({ ...d, order: i })) }
        }),

      addAssignment: (a) => {
        const item: Assignment = { ...a, id: uid(), createdAt: Date.now() }
        set((s) => ({ assignments: [...s.assignments, item] }))
        return item
      },

      addAssignments: (list) => set((s) => ({ assignments: [...s.assignments, ...list] })),

      updateAssignment: (id, patch) =>
        set((s) => ({
          assignments: s.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      removeAssignment: (id) =>
        set((s) => ({ assignments: s.assignments.filter((a) => a.id !== id) })),

      removeAssignmentsByDate: (date) =>
        set((s) => ({ assignments: s.assignments.filter((a) => a.date !== date) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      replaceAll: (data) =>
        set({
          people: data.people,
          dutyTypes: data.dutyTypes,
          assignments: data.assignments,
          settings: { ...DEFAULT_SETTINGS, ...data.settings },
        }),

      resetAll: () => set(initialData()),

      loadDemo: () => {
        const data = initialData()
        const names = [
          'Иванов И.И.',
          'Петров П.П.',
          'Сидоров С.С.',
          'Кузнецов К.К.',
          'Смирнов А.А.',
          'Попов Д.Д.',
          'Васильев В.В.',
          'Новиков Н.Н.',
          'Морозов М.М.',
          'Волков О.О.',
          'Лебедев Л.Л.',
          'Козлов Е.Е.',
        ]
        const now = Date.now()
        data.people = names.map((name, i) => ({
          id: uid(),
          name,
          group: i < 6 ? '1 взвод' : '2 взвод',
          status: i === 7 ? 'sick' : 'active',
          basePoints: 0,
          note: '',
          createdAt: now,
        }))
        // немного истории за последние 2 недели
        const duties = data.dutyTypes
        const today = new Date()
        for (let back = 14; back >= 1; back--) {
          const d = new Date(today)
          d.setDate(d.getDate() - back)
          const iso = toISO(d)
          const dn = duties[0]
          const pgd = duties[2]
          const pick = (k: number) => data.people[(back * 3 + k) % data.people.length]
          data.assignments.push(
            {
              id: uid(),
              date: iso,
              dutyTypeId: dn.id,
              personId: pick(0).id,
              points: dn.points,
              note: '',
              source: 'manual',
              createdAt: now,
            },
            {
              id: uid(),
              date: iso,
              dutyTypeId: dn.id,
              personId: pick(1).id,
              points: dn.points,
              note: '',
              source: 'manual',
              createdAt: now,
            },
            {
              id: uid(),
              date: iso,
              dutyTypeId: pgd.id,
              personId: pick(2).id,
              points: pgd.points,
              note: '',
              source: 'manual',
              createdAt: now,
            },
          )
        }
        set(data)
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (s) => ({
        people: s.people,
        dutyTypes: s.dutyTypes,
        assignments: s.assignments,
        settings: s.settings,
      }),
    },
  ),
)

export function exportData(): AppData {
  const s = useStore.getState()
  return {
    people: s.people,
    dutyTypes: s.dutyTypes,
    assignments: s.assignments,
    settings: s.settings,
  }
}

/** Проверка и нормализация импортируемого JSON. Бросает ошибку с понятным текстом. */
export function parseImportedData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Файл не похож на резервную копию DutyRank.')
  const o = raw as Partial<AppData>
  if (!Array.isArray(o.people) || !Array.isArray(o.dutyTypes) || !Array.isArray(o.assignments)) {
    throw new Error('В файле нет обязательных разделов (people, dutyTypes, assignments).')
  }
  return {
    people: o.people,
    dutyTypes: o.dutyTypes,
    assignments: o.assignments,
    settings: { ...DEFAULT_SETTINGS, ...(o.settings ?? {}) },
  }
}
