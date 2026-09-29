import type { DutyCadenceMode, DutyScope, DutyType, DutyVariant, PersonTag } from '../types'
import { isPersonTag } from '../types'
import { uid } from './id'

function normalizeTagList(raw: unknown): PersonTag[] {
  if (!Array.isArray(raw)) return []
  const out: PersonTag[] = []
  for (const t of raw) {
    if (isPersonTag(t) && !out.includes(t)) out.push(t)
  }
  return out
}

/** Палітра кольорів для видів нарядів. */
export const DUTY_COLORS = [
  '#2563eb',
  '#1d4ed8',
  '#0891b2',
  '#0e7490',
  '#16a34a',
  '#15803d',
  '#65a30d',
  '#4d7c0f',
  '#d97706',
  '#b45309',
  '#ea580c',
  '#c2410c',
  '#dc2626',
  '#b91c1c',
  '#db2777',
  '#be185d',
  '#7c3aed',
  '#6d28d9',
  '#9333ea',
  '#475569',
  '#334155',
  '#78716c',
  '#0f766e',
  '#155e75',
]

function normalizeScope(v: unknown): DutyScope {
  return v === 'myropil' ? 'myropil' : 'duties'
}

function normalizeCadenceMode(v: unknown): DutyCadenceMode {
  return v === 'maxStreak' ? 'maxStreak' : 'minGap'
}

function normalizeVariant(v: DutyVariant): DutyVariant {
  return {
    id: v.id || uid(),
    name: v.name || 'Підпункт',
    short: (v.short || 'ПП').slice(0, 5),
    points: Number(v.points) || 0,
  }
}

/** Старий шаблонний «підпункт цілодобова» — більше не потрібен (є прапорець на виді). */
function isLegacyFullDayVariant(v: DutyVariant): boolean {
  if (v.blocksFullDay) return true
  const n = (v.name || '').trim().toLowerCase()
  const s = (v.short || '').trim().toUpperCase()
  return n === 'цілодобова зайнятість' || s === 'ЦІЛ'
}

export function normalizeDuty(d: DutyType): DutyType {
  const isMainDuty = Boolean(d.isMainDuty)
  const rawVariants = Array.isArray(d.variants) ? d.variants : []
  const hadLegacyFullDay = rawVariants.some(isLegacyFullDayVariant)
  const variants = rawVariants.filter((v) => !isLegacyFullDayVariant(v)).map(normalizeVariant)
  return {
    ...d,
    excludeTags: normalizeTagList(d.excludeTags),
    requireTags: normalizeTagList(d.requireTags),
    variants,
    allowExtraPerson: Boolean(d.allowExtraPerson),
    scope: normalizeScope(d.scope),
    cadenceMode: normalizeCadenceMode(d.cadenceMode),
    cadenceDays: Math.max(0, Number(d.cadenceDays) || 0),
    periodicityDays: Math.max(0, Number(d.periodicityDays) || 0),
    group: typeof d.group === 'string' ? d.group : '',
    isMainDuty,
    points: isMainDuty ? 0 : Number(d.points) || 0,
    durationDays: Math.max(1, Math.floor(Number(d.durationDays) || 1)),
    blocksFullDay:
      typeof d.blocksFullDay === 'boolean' ? d.blocksFullDay : hadLegacyFullDay,
  }
}

export function effectiveSlots(duty: DutyType): number {
  const variants = duty.variants ?? []
  if (variants.length > 0) return variants.length
  return Math.max(1, (duty.defaultSlots || 1) + (duty.allowExtraPerson ? 1 : 0))
}

export function findVariant(duty: DutyType | undefined, variantId?: string | null): DutyVariant | undefined {
  if (!duty || !variantId) return undefined
  return (duty.variants ?? []).find((v) => v.id === variantId)
}

export function dutyBasePoints(duty: DutyType, variantId?: string | null): number {
  if (duty.isMainDuty) return 0
  const v = findVariant(duty, variantId)
  if (v) return v.points
  return duty.points
}

export function dutyShortLabel(duty: DutyType | undefined, _variantId?: string | null): string {
  return duty?.short ?? '—'
}

export function dutyHoverTitle(
  duty: DutyType | undefined,
  points: number,
  variantId?: string | null,
  note?: string,
): string {
  if (!duty) return '—'
  const v = findVariant(duty, variantId)
  const parts = [duty.name]
  if (v) parts.push(v.name)
  if (duty.isMainDuty) parts.push('0 б.')
  else parts.push(`${points} б.`)
  if (note) parts.push(note)
  return parts.join(' · ')
}

const DUTY_SEED: Array<Omit<DutyType, 'id' | 'archived' | 'order' | 'color'>> = [
  {
    name: 'Днювальний',
    short: 'ДН',
    points: 2,
    defaultSlots: 2,
    allowExtraPerson: false,
    excludeTags: [],
    requireTags: [],
    variants: [],
    scope: 'duties',
    cadenceMode: 'minGap',
    cadenceDays: 0,
    periodicityDays: 0,
    group: '',
    isMainDuty: false,
    durationDays: 1,
    blocksFullDay: false,
  },
  {
    name: 'Черговий роти',
    short: 'ЧР',
    points: 3,
    defaultSlots: 1,
    allowExtraPerson: false,
    excludeTags: [],
    requireTags: [],
    variants: [],
    scope: 'duties',
    cadenceMode: 'minGap',
    cadenceDays: 0,
    periodicityDays: 0,
    group: '',
    isMainDuty: false,
    durationDays: 1,
    blocksFullDay: false,
  },
  {
    name: 'ПГД',
    short: 'ПГД',
    points: 1,
    defaultSlots: 1,
    allowExtraPerson: false,
    excludeTags: [],
    requireTags: [],
    variants: [],
    scope: 'duties',
    cadenceMode: 'minGap',
    cadenceDays: 0,
    periodicityDays: 0,
    group: '',
    isMainDuty: false,
    durationDays: 1,
    blocksFullDay: false,
  },
  {
    name: 'Наряд по їдальні',
    short: 'ЇД',
    points: 2,
    defaultSlots: 2,
    allowExtraPerson: true,
    excludeTags: [],
    requireTags: [],
    variants: [],
    scope: 'duties',
    cadenceMode: 'minGap',
    cadenceDays: 0,
    periodicityDays: 0,
    group: '',
    isMainDuty: false,
    durationDays: 1,
    blocksFullDay: false,
  },
  {
    name: 'Прибирання території',
    short: 'ПТ',
    points: 1,
    defaultSlots: 2,
    allowExtraPerson: false,
    excludeTags: [],
    requireTags: [],
    variants: [],
    scope: 'duties',
    cadenceMode: 'minGap',
    cadenceDays: 0,
    periodicityDays: 0,
    group: '',
    isMainDuty: false,
    durationDays: 1,
    blocksFullDay: false,
  },
  {
    name: 'Госпроботи',
    short: 'ГР',
    points: 1,
    defaultSlots: 1,
    allowExtraPerson: false,
    excludeTags: [],
    requireTags: [],
    variants: [],
    scope: 'duties',
    cadenceMode: 'minGap',
    cadenceDays: 0,
    periodicityDays: 0,
    group: '',
    isMainDuty: false,
    durationDays: 1,
    blocksFullDay: false,
  },
  {
    name: 'Черговий (Миропіль)',
    short: 'ЧМ',
    points: 2,
    defaultSlots: 1,
    allowExtraPerson: false,
    excludeTags: [],
    requireTags: [],
    variants: [],
    scope: 'myropil',
    cadenceMode: 'maxStreak',
    cadenceDays: 2,
    periodicityDays: 0,
    group: '',
    isMainDuty: false,
    durationDays: 1,
    blocksFullDay: false,
  },
  {
    name: 'Днювальний (Миропіль)',
    short: 'ДМ',
    points: 2,
    defaultSlots: 2,
    allowExtraPerson: false,
    excludeTags: [],
    requireTags: [],
    variants: [],
    scope: 'myropil',
    cadenceMode: 'minGap',
    cadenceDays: 1,
    periodicityDays: 0,
    group: '',
    isMainDuty: false,
    durationDays: 1,
    blocksFullDay: false,
  },
]

export function defaultDutyTypes(group = ''): DutyType[] {
  return DUTY_SEED.map((d, i) =>
    normalizeDuty({
      ...d,
      group,
      id: uid(),
      color: DUTY_COLORS[i % DUTY_COLORS.length],
      archived: false,
      order: i,
    }),
  )
}

export function newVariant(partial?: Partial<DutyVariant>): DutyVariant {
  return {
    id: uid(),
    name: partial?.name ?? 'Підпункт',
    short: (partial?.short ?? 'ПП').slice(0, 5).toUpperCase(),
    points: Number(partial?.points ?? 1) || 0,
  }
}

/** Відфільтрувати види нарядів для робочої групи. */
export function dutiesForGroup(list: DutyType[], group: string | null): DutyType[] {
  if (!group) return list.map(normalizeDuty)
  return list
    .map(normalizeDuty)
    .filter((d) => d.group === group || d.group === '')
    .sort((a, b) => {
      // Спочатку «свої» для групи, потім спільні шаблони.
      const ag = a.group === group ? 0 : 1
      const bg = b.group === group ? 0 : 1
      return ag - bg || a.order - b.order
    })
}
