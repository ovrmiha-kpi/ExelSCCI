import type { Person, PersonTag } from '../types'
import { uid } from './id'

/** Група С-55 з таблиці обліку чергувань: теги ж / к як у Excel. */
export const C55_GROUP = 'С-55'

export const C55_ROSTER: Array<{ name: string; tags: PersonTag[] }> = [
  { name: 'Александрова А.С.', tags: ['female'] },
  { name: 'Ботвинко З.Ю.', tags: ['kyiv'] },
  { name: 'Возний Д.В.', tags: ['kyiv'] },
  { name: 'Дмітрієва Д.Д.', tags: ['female'] },
  { name: 'Загородній І.С.', tags: ['kyiv'] },
  { name: 'Зеляк П.І.', tags: ['female'] },
  { name: 'Кніжницький І.І.', tags: [] },
  { name: 'Колесов О.Ю.', tags: [] },
  { name: 'Макаров С.Є.', tags: [] },
  { name: 'Масяченко М.Р.', tags: [] },
  { name: 'Мурило А.В.', tags: ['kyiv'] },
  { name: 'Немченко Н.С.', tags: ['kyiv'] },
  { name: 'Оврашко М.С.', tags: [] },
  { name: 'Ожарівська О.Р.', tags: ['female'] },
  { name: 'Олицький М.О.', tags: [] },
  { name: 'Петрів О.Є.', tags: [] },
  { name: 'Прохоров Б.М.', tags: ['kyiv'] },
  { name: 'Синицький О.В.', tags: [] },
  { name: 'Сураєв-Харитончук В.І.', tags: ['kyiv'] },
  { name: 'Тимчук Ю.С.', tags: ['female'] },
  { name: 'Тищенко В.І.', tags: [] },
  { name: 'Хоміцький Б.А.', tags: ['kyiv'] },
  { name: 'Чашурін В.А.', tags: [] },
  { name: 'Черненко М.О.', tags: [] },
  { name: 'Шевцов І.А.', tags: [] },
]

export function createC55People(): Person[] {
  const now = Date.now()
  return C55_ROSTER.map((r) => ({
    id: uid(),
    name: r.name,
    group: C55_GROUP,
    status: 'active',
    basePoints: 0,
    note: '',
    tags: [...r.tags],
    excludedDutyIds: [],
    createdAt: now,
  }))
}

export function normalizePersonName(name: string): string {
  return name
    .replace(/[()]/g, ' ')
    .replace(/\b(ж|к)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const TAGS_BY_NORM = new Map(C55_ROSTER.map((r) => [normalizePersonName(r.name), r.tags]))

export function tagsForKnownName(name: string): PersonTag[] | undefined {
  return TAGS_BY_NORM.get(normalizePersonName(name))
}

export function parseNameAndTags(raw: string): { name: string; tags: PersonTag[] } {
  const tags: PersonTag[] = []
  let name = raw.trim()
  const mark = /\((ж|к|кв|км|кг)\)/gi
  name = name.replace(mark, (_, t: string) => {
    const v = t.toLowerCase()
    if (v === 'ж' && !tags.includes('female')) tags.push('female')
    if (v === 'к' && !tags.includes('kyiv')) tags.push('kyiv')
    if ((v === 'кв' || v === 'км') && !tags.includes('commander')) tags.push('commander')
    if (v === 'кг' && !tags.includes('groupCommander')) tags.push('groupCommander')
    return ''
  })
  name = name.replace(/\s+/g, ' ').trim()
  const known = tagsForKnownName(name)
  return { name, tags: tags.length ? tags : (known ?? []) }
}

export function isPlaceholderRoster(people: Person[]): boolean {
  if (people.length === 0) return true
  const demo = people.some((p) => p.name === 'Шевченко Т.Г.' || p.name === 'Коваленко О.В.')
  const c55 = people.some((p) => normalizePersonName(p.name).startsWith('александрова'))
  return demo && !c55
}
