/** Дата в формате YYYY-MM-DD (локальная). */
export type ISODate = string

export type PersonStatus = 'active' | 'sick' | 'leave' | 'excluded'

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  active: 'В строю',
  sick: 'Болеет',
  leave: 'Отпуск / увольнение',
  excluded: 'Не назначать',
}

export interface Person {
  id: string
  name: string
  /** Подразделение / группа (взвод, отделение). Свободный текст. */
  group: string
  status: PersonStatus
  /**
   * Начальные баллы (например, перенесённые из старой Excel-таблицы).
   * Учитываются в общем рейтинге, но не привязаны к конкретным нарядам.
   */
  basePoints: number
  note: string
  createdAt: number
}

export interface DutyType {
  id: string
  name: string
  /** Короткое обозначение для узких колонок таблицы. */
  short: string
  /** Сколько баллов даёт одно задействие. */
  points: number
  /** Сколько человек нужно по умолчанию при автоназначении. */
  defaultSlots: number
  color: string
  archived: boolean
  order: number
}

export interface Assignment {
  id: string
  date: ISODate
  dutyTypeId: string
  personId: string
  /** Баллы на момент назначения (чтобы изменение стоимости наряда не переписывало историю). */
  points: number
  note: string
  source: 'auto' | 'manual'
  createdAt: number
}

export interface Settings {
  /**
   * Минимальный перерыв между нарядами (в днях) при автоназначении.
   * 0 — можно хоть каждый день, 1 — не два дня подряд, и т.д.
   */
  cooldownDays: number
  /** Разбивать ничьи случайно (иначе — по алфавиту). */
  randomTies: boolean
  /** Стараться не ставить одного человека на один и тот же вид наряда подряд. */
  avoidRepeatDuty: boolean
}

export interface AppData {
  people: Person[]
  dutyTypes: DutyType[]
  assignments: Assignment[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  cooldownDays: 1,
  randomTies: true,
  avoidRepeatDuty: true,
}
