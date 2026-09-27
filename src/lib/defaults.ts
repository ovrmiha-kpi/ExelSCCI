import type { DutyType } from '../types'
import { uid } from './id'

export const DUTY_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
  '#ea580c', // orange
  '#475569', // slate
]

export function defaultDutyTypes(): DutyType[] {
  const base: Array<Omit<DutyType, 'id' | 'archived' | 'order' | 'color'>> = [
    { name: 'Дневальный', short: 'ДН', points: 2, defaultSlots: 2 },
    { name: 'Дежурный по роте', short: 'ДЖ', points: 3, defaultSlots: 1 },
    { name: 'ПГД', short: 'ПГД', points: 1, defaultSlots: 1 },
    { name: 'Наряд по столовой', short: 'СТ', points: 2, defaultSlots: 2 },
    { name: 'Уборка территории', short: 'УТ', points: 1, defaultSlots: 2 },
    { name: 'Хозработы', short: 'ХР', points: 1, defaultSlots: 1 },
  ]
  return base.map((d, i) => ({
    ...d,
    id: uid(),
    color: DUTY_COLORS[i % DUTY_COLORS.length],
    archived: false,
    order: i,
  }))
}
