import type { DutyCadenceMode, DutyScope, DutyType, DutyVariant, PersonTag } from '../types'
import { isPersonTag } from '../types'
import { uid } from './id'
import { osTaxonomyDutySeed } from './seedOsCategories'

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
  const children = Array.isArray(v.children)
    ? v.children.filter(Boolean).map(normalizeVariant)
    : undefined
  return {
    id: v.id || uid(),
    name: v.name || 'Підпункт',
    short: (v.short || 'ПП').slice(0, 8),
    points: Number(v.points) || 0,
    defaultSlots: Math.max(1, Math.floor(Number(v.defaultSlots) || 1)),
    ...(children && children.length > 0 ? { children } : {}),
  }
}

/** Листки дерева підпунктів (призначення лише на них). */
export function leafVariants(variants: DutyVariant[] | undefined): DutyVariant[] {
  const out: DutyVariant[] = []
  for (const v of variants ?? []) {
    if (v.children && v.children.length > 0) out.push(...leafVariants(v.children))
    else out.push(v)
  }
  return out
}

/** Знайти підпункт на будь-якій глибині. */
export function findVariantDeep(
  variants: DutyVariant[] | undefined,
  variantId?: string | null,
): DutyVariant | undefined {
  if (!variantId) return undefined
  for (const v of variants ?? []) {
    if (v.id === variantId) return v
    const nested = findVariantDeep(v.children, variantId)
    if (nested) return nested
  }
  return undefined
}

/** Шлях назв до підпункту (для підказів). */
export function variantPathLabel(
  variants: DutyVariant[] | undefined,
  variantId?: string | null,
): string {
  return variantPath(variants, variantId)
    .map((v) => v.short || v.name)
    .join(' › ')
}

/** Ланцюжок підпунктів від кореня до листа. */
export function variantPath(
  variants: DutyVariant[] | undefined,
  variantId?: string | null,
): DutyVariant[] {
  if (!variantId) return []
  const walk = (list: DutyVariant[], trail: DutyVariant[]): DutyVariant[] | null => {
    for (const v of list) {
      const next = [...trail, v]
      if (v.id === variantId) return next
      if (v.children?.length) {
        const hit = walk(v.children, next)
        if (hit) return hit
      }
    }
    return null
  }
  return walk(variants ?? [], []) ?? []
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
    short: (d.short || d.name.slice(0, 3)).trim().slice(0, 8).toUpperCase() || 'Н',
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
  const leaves = leafVariants(duty.variants)
  if (leaves.length > 0) {
    return leaves.reduce((sum, v) => sum + Math.max(1, Math.floor(Number(v.defaultSlots) || 1)), 0)
  }
  return Math.max(1, (duty.defaultSlots || 1) + (duty.allowExtraPerson ? 1 : 0))
}

export function findVariant(duty: DutyType | undefined, variantId?: string | null): DutyVariant | undefined {
  if (!duty || !variantId) return undefined
  return findVariantDeep(duty.variants, variantId)
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
  const path = variantPathLabel(duty.variants, variantId)
  const parts = [duty.name]
  if (path) parts.push(path)
  if (duty.isMainDuty) parts.push('0 б.')
  else parts.push(`${points} б.`)
  if (note) parts.push(note)
  return parts.join(' · ')
}

const DUTY_SEED: Array<Omit<DutyType, 'id' | 'archived' | 'order' | 'color'>> = osTaxonomyDutySeed()

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
  const children = partial?.children?.map((c) => newVariant(c))
  return {
    id: partial?.id ?? uid(),
    name: partial?.name ?? 'Підпункт',
    short: (partial?.short ?? 'ПП').slice(0, 8).toUpperCase(),
    points: Number(partial?.points ?? 1) || 0,
    defaultSlots: Math.max(1, Math.floor(Number(partial?.defaultSlots ?? 1) || 1)),
    ...(children && children.length > 0 ? { children } : {}),
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
