/** Дата у форматі YYYY-MM-DD (локальна). */
export type ISODate = string

export type PersonStatus = 'active' | 'sick' | 'leave' | 'excluded'

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  active: 'В наяв.',
  sick: 'Хворіє',
  leave: 'Відпустка / звільнення',
  excluded: 'Не призначати',
}

export type ThemeId = 'light' | 'dark' | 'midnight'

export const THEME_META: Record<ThemeId, { label: string; hint: string }> = {
  light: { label: 'Світла', hint: 'Світлий фон' },
  dark: { label: 'Темна', hint: 'Поточна синя темна' },
  midnight: { label: 'Чорна', hint: 'Глибша, майже чорна' },
}

export type PersonTag = 'female' | 'kyiv' | 'commander' | 'groupCommander'

/** Режим фільтра тега на наряді: без обмеження / заборона / лише з тегом. */
export type TagFilterMode = 'off' | 'exclude' | 'require'

export const TAG_FILTER_MODE_META: Record<
  TagFilterMode,
  { label: string; hint: string }
> = {
  off: { label: 'Без обмеження', hint: 'Тег не впливає на цей наряд' },
  exclude: { label: 'Не брати', hint: 'Людей з цим тегом не призначати' },
  require: { label: 'Лише ці', hint: 'Призначати тільки людей з цим тегом' },
}

export function nextTagFilterMode(mode: TagFilterMode): TagFilterMode {
  if (mode === 'off') return 'exclude'
  if (mode === 'exclude') return 'require'
  return 'off'
}

export function tagFilterModeOf(
  tag: PersonTag,
  excludeTags: PersonTag[] | undefined,
  requireTags: PersonTag[] | undefined,
): TagFilterMode {
  if ((requireTags ?? []).includes(tag)) return 'require'
  if ((excludeTags ?? []).includes(tag)) return 'exclude'
  return 'off'
}

export function setTagFilterMode(
  tag: PersonTag,
  mode: TagFilterMode,
  excludeTags: PersonTag[] | undefined,
  requireTags: PersonTag[] | undefined,
): { excludeTags: PersonTag[]; requireTags: PersonTag[] } {
  const exclude = (excludeTags ?? []).filter((t) => t !== tag)
  const require = (requireTags ?? []).filter((t) => t !== tag)
  if (mode === 'exclude') exclude.push(tag)
  if (mode === 'require') require.push(tag)
  return { excludeTags: exclude, requireTags: require }
}

export const PERSON_TAG_META: Record<PersonTag, { short: string; label: string; className: string }> = {
  female: { short: 'ж', label: 'Жінка', className: 'bg-tint-fuchsia/20 text-tint-fuchsia' },
  kyiv: { short: 'к', label: 'Киянин / киянка', className: 'bg-tint-sky/20 text-tint-sky' },
  commander: { short: 'кв', label: 'Командир відділення', className: 'bg-tint-amber/20 text-tint-amber' },
  groupCommander: {
    short: 'кг',
    label: 'Командир групи',
    className: 'bg-tint-orange/20 text-tint-orange',
  },
}

export const PERSON_TAGS = Object.keys(PERSON_TAG_META) as PersonTag[]

/** Теги командирів — у фільтрах призначення один пункт «ком». */
export const COMMANDER_TAGS: PersonTag[] = ['commander', 'groupCommander']

/** Чіпи фільтра тегів: ж / к / ком (кв+кг разом). */
export const TAG_FILTER_CHIPS: Array<{
  id: string
  short: string
  label: string
  tags: PersonTag[]
}> = [
  { id: 'female', short: 'ж', label: PERSON_TAG_META.female.label, tags: ['female'] },
  { id: 'kyiv', short: 'к', label: PERSON_TAG_META.kyiv.label, tags: ['kyiv'] },
  {
    id: 'commander',
    short: 'ком',
    label: 'Командири (відділення / групи)',
    tags: [...COMMANDER_TAGS],
  },
]

export function tagChipFilterMode(
  tags: PersonTag[],
  excludeTags: PersonTag[] | undefined,
  requireTags: PersonTag[] | undefined,
): TagFilterMode {
  const modes = tags.map((t) => tagFilterModeOf(t, excludeTags, requireTags))
  if (modes.every((m) => m === 'require')) return 'require'
  if (modes.every((m) => m === 'exclude')) return 'exclude'
  if (modes.every((m) => m === 'off')) return 'off'
  if (modes.some((m) => m === 'require')) return 'require'
  if (modes.some((m) => m === 'exclude')) return 'exclude'
  return 'off'
}

export function setTagChipFilterMode(
  tags: PersonTag[],
  mode: TagFilterMode,
  excludeTags: PersonTag[] | undefined,
  requireTags: PersonTag[] | undefined,
): { excludeTags: PersonTag[]; requireTags: PersonTag[] } {
  let exclude = excludeTags ?? []
  let require = requireTags ?? []
  for (const tag of tags) {
    const next = setTagFilterMode(tag, mode, exclude, require)
    exclude = next.excludeTags
    require = next.requireTags
  }
  return { excludeTags: exclude, requireTags: require }
}

export function isPersonTag(v: unknown): v is PersonTag {
  return typeof v === 'string' && v in PERSON_TAG_META
}

export function normalizePersonTags(raw: unknown): PersonTag[] {
  if (!Array.isArray(raw)) return []
  const out: PersonTag[] = []
  for (const t of raw) {
    if (isPersonTag(t) && !out.includes(t)) out.push(t)
  }
  return out
}

export interface Person {
  id: string
  name: string
  /** Підрозділ / група (взвод, відділення). Довільний текст. */
  group: string
  status: PersonStatus
  /**
   * Початкові бали (наприклад, перенесене зі старої Excel-таблиці).
   * Враховуються в загальному рейтингу, але не прив'язані до конкретних нарядів.
   */
  basePoints: number
  note: string
  /** Позначки: ж, к, кв (командир відділення), кг (командир групи). */
  tags: PersonTag[]
  /** Види нарядів, на які людина за замовчуванням не йде (автопризначення пропускає). */
  excludedDutyIds: string[]
  createdAt: number
}

export interface DutyVariant {
  id: string
  name: string
  short: string
  /** Бали саме цього підпункту. */
  points: number
  /**
   * @deprecated перенесено на DutyType.blocksFullDay; лишається для міграції старих даних.
   */
  blocksFullDay?: boolean
}

/** Журнал, до якого належить вид наряду. */
export type DutyScope = 'duties' | 'myropil'

export const DUTY_SCOPE_META: Record<DutyScope, { label: string; hint: string }> = {
  duties: { label: 'Звичайні', hint: 'Основний журнал нарядів' },
  myropil: { label: 'Миропіль', hint: 'Окремі пункти для журналу Миропіль' },
}

/**
 * Обмеження частоти саме цього наряду (взаємозамінні режими).
 * - minGap — мінімум днів між двома призначеннями на цей наряд (як «раз на N днів»).
 * - maxStreak — максимум днів підряд на цей наряд.
 */
export type DutyCadenceMode = 'minGap' | 'maxStreak'

export const DUTY_CADENCE_META: Record<
  DutyCadenceMode,
  { label: string; hint: string; unit: string }
> = {
  minGap: {
    label: 'Відпочинок',
    hint: 'Скільки днів має пройти, перш ніж ТА САМА людина знову може піти на цей самий наряд. 0 — без ліміту; 1 — не два дні поспіль; 4 — після пн та сама людина не раніше сб.',
    unit: 'днів відпочинку',
  },
  maxStreak: {
    label: 'Макс. підряд',
    hint: 'Скільки днів підряд максимум людина може йти саме на цей наряд. 0 — без ліміту.',
    unit: 'макс. днів підряд',
  },
}

export interface DutyType {
  id: string
  name: string
  /** Коротке позначення для вузьких колонок таблиці. */
  short: string
  /** Скільки балів дає одне залучення (якщо без підпункту). Головне чергування — завжди 0. */
  points: number
  /** Скільки людей потрібно за замовчуванням при автопризначенні. */
  defaultSlots: number
  /** Дозволити +1 особу понад defaultSlots (ще одного на той самий наряд). */
  allowExtraPerson: boolean
  color: string
  archived: boolean
  order: number
  /** Теги (ж / к), яких не призначати саме на цей вид наряду. */
  excludeTags: PersonTag[]
  /** Теги (ж / к), без яких на цей наряд не ставити (лише з тегом). */
  requireTags: PersonTag[]
  /** Підпункти наряду з власними балами (напр. основний / помічник). */
  variants: DutyVariant[]
  /** Звичайні наряди або пункти Мирополю. */
  scope: DutyScope
  /** Режим частоти / відпочинку саме цієї людини на цей наряд. */
  cadenceMode: DutyCadenceMode
  /** Значення для cadenceMode (див. DUTY_CADENCE_META). 0 — вимкнено. */
  cadenceDays: number
  /**
   * Періодичність наряду: через скільки днів після останнього призначення цього наряду
   * (будь-ким) автоза ставить уже наступну людину. 0 — щодня (якщо наряд у плані).
   * Приклад: 4 → після пн наступне призначення не раніше пт.
   */
  periodicityDays: number
  /**
   * Група, до якої привʼязаний вид наряду.
   * Порожній рядок — legacy / шаблон до міграції.
   */
  group: string
  /** Головне чергування: 0 балів; автоза — за кількістю цього наряду, далі алфавіт. */
  isMainDuty: boolean
  /** Скільки календарних днів займає одне призначення (мін. 1). */
  durationDays: number
  /**
   * Цілодобова зайнятість: людина на цьому наряді не може отримати інший наряд
   * у ті самі дні (і навпаки — якщо день уже зайнятий, цей наряд не ставити).
   */
  blocksFullDay: boolean
}

/** Період перебування груп у Мирополі. */
export interface MyropilStay {
  id: string
  from: ISODate
  to: ISODate
  /** Які групи в Мирополі в цей період (порожньо — усі групи). */
  groups: string[]
}

/**
 * Відділення всередині групи: діапазон людей у списку (за порядком № у групі).
 * fromPersonId / toPersonId — включно.
 */
export interface SquadRange {
  id: string
  /** Назва, напр. «1», «2-ге», «Відділення 1». */
  name: string
  fromPersonId: string
  toPersonId: string
  /** Командир відділення (кв) — обирається вручну. */
  commanderPersonId: string | null
}

export interface Assignment {
  id: string
  /** Який журнал: наряди / стягнення / заохочення / миропіль. */
  journalId: JournalId
  /** Перший день призначення. */
  date: ISODate
  dutyTypeId: string
  personId: string
  /** Обраний підпункт (якщо є). */
  variantId: string | null
  /** Бали на момент призначення (щоб зміна вартості наряду не переписувала історію). */
  points: number
  note: string
  source: 'auto' | 'manual'
  createdAt: number
  /** Скільки днів займає запис (мін. 1). Лічильник нарядів +1 незалежно від span. */
  spanDays: number
}

/** Окремі журнали обліку. */
export type JournalId = 'duties' | 'conduct' | 'myropil'

/** Тип запису в журналі стягнень / заохочень. */
export type ConductKind = 'penalty' | 'reward'

export const CONDUCT_KIND_META: Record<ConductKind, { label: string; short: string; color: string }> = {
  penalty: { label: 'Стягнення', short: 'Стягн.', color: '#b91c1c' },
  reward: { label: 'Заохочення', short: 'Заохоч.', color: '#15803d' },
}

export function isConductKind(v: unknown): v is ConductKind {
  return v === 'penalty' || v === 'reward'
}

export const JOURNAL_META: Record<
  JournalId,
  { label: string; short: string; hint: string; affectsRating: boolean }
> = {
  duties: {
    label: 'Наряди',
    short: 'Наряди',
    hint: 'Основний журнал нарядів і робіт',
    affectsRating: true,
  },
  conduct: {
    label: 'Стягнення та заохочення',
    short: 'Стягн. / Заохоч.',
    hint: 'Один журнал: стягнення й заохочення з балами та причиною',
    /** Бали ± додаються до рейтингу; відпочинок / лічильник нарядів — ні. */
    affectsRating: true,
  },
  myropil: {
    label: 'Миропіль',
    short: 'Миропіль',
    hint: 'Окремий журнал нарядів під час перебування в Мирополі',
    affectsRating: false,
  },
}

export const JOURNAL_IDS = Object.keys(JOURNAL_META) as JournalId[]

/** Нормалізація journalId зі старих назв penalties/rewards. */
export function normalizeJournalId(v: unknown): JournalId {
  if (v === 'penalties' || v === 'rewards') return 'conduct'
  if (typeof v === 'string' && v in JOURNAL_META) return v as JournalId
  return 'duties'
}

export function isJournalId(v: unknown): v is JournalId {
  return typeof v === 'string' && v in JOURNAL_META
}

export interface Settings {
  /**
   * Глобальна перерва між будь-якими нарядами (у днях).
   * 0 — не обмежує; відпочинок між однаковими нарядами задається в кожному виді наряду.
   */
  cooldownDays: number
  /** Розбивати нічиї випадково (інакше — за алфавітом). */
  randomTies: boolean
  /** Намагатися не ставити одну людину на той самий вид наряду поспіль. */
  avoidRepeatDuty: boolean
  /**
   * Множник балів за наряд у суботу та неділю.
   * 1 — без надбавки, 1.33 — +33% у вихідні.
   */
  weekendMultiplier: number
  /** Тема оформлення: світла / темна / чорна. */
  theme: ThemeId
  /** Періоди перебування в Мирополі (дати + групи). */
  myropilStays: MyropilStay[]
  /** Відділення поточної групи: діапазони людей у списку. */
  squadRanges: SquadRange[]
}

export interface AppData {
  people: Person[]
  dutyTypes: DutyType[]
  assignments: Assignment[]
  settings: Settings
}

/**
 * Матеріалізована статистика людини (таблиця personStats у IndexedDB).
 * Рейтинг читає це, а не сканує всі записи журналу.
 */
export interface PersonStatRow {
  personId: string
  earnedPoints: number
  count: number
  lastDate: ISODate | null
  lastDutyTypeId: string | null
  countByDuty: Record<string, number>
  pointsByDuty: Record<string, number>
}

export const DEFAULT_SETTINGS: Settings = {
  cooldownDays: 0,
  randomTies: true,
  avoidRepeatDuty: true,
  weekendMultiplier: 1.33,
  theme: 'dark',
  myropilStays: [],
  squadRanges: [],
}
