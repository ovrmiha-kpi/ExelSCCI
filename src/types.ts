/** Дата у форматі YYYY-MM-DD (локальна). */
export type ISODate = string

export type PersonStatus = 'active' | 'sick' | 'leave' | 'excluded'

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  active: 'У строю',
  sick: 'Хворіє',
  leave: 'Відпустка / звільнення',
  excluded: 'Не призначати',
}

export interface Person {
  id: string
  name: string
  /** Підрозділ / група (взвод, відділення). Довільний текст. */
  group: string
  status: PersonStatus
  /**
   * Початкові бали (наприклад, перенесені зі старої Excel-таблиці).
   * Враховуються в загальному рейтингу, але не прив'язані до конкретних нарядів.
   */
  basePoints: number
  note: string
  createdAt: number
}

export interface DutyType {
  id: string
  name: string
  /** Коротке позначення для вузьких колонок таблиці. */
  short: string
  /** Скільки балів дає одне залучення. */
  points: number
  /** Скільки людей потрібно за замовчуванням при автопризначенні. */
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
  /** Бали на момент призначення (щоб зміна вартості наряду не переписувала історію). */
  points: number
  note: string
  source: 'auto' | 'manual'
  createdAt: number
}

export interface Settings {
  /**
   * Мінімальна перерва між нарядами (у днях) при автопризначенні.
   * 0 — можна хоч щодня, 1 — не два дні поспіль, і т.д.
   */
  cooldownDays: number
  /** Розбивати нічиї випадково (інакше — за алфавітом). */
  randomTies: boolean
  /** Намагатися не ставити одну людину на той самий вид наряду поспіль. */
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
