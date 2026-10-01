import type {
  AppData,
  Assignment,
  DutyType,
  ISODate,
  JournalId,
  Person,
  PersonStatRow,
  PersonTag,
} from '../types'
import { normalizeJournalId } from '../types'
import { dutyBasePoints, findVariant, leafVariants } from './defaults'
import { addDaysISO, diffDays, dutyPointsForDate, todayISO } from './dates'
import { isDutyHistoryAssignment, isRatingAssignment } from './stats'
import { personInMyropilOn } from './myropil'
import { uid } from './id'

export interface DutyRequest {
  dutyTypeId: string
  /** Кількість місць (якщо немає підпунктів). */
  slots: number
  /**
   * Скільки людей на кожен підпункт (variantId → count).
   * Якщо задано — ігнорує `slots` і ставить рівно стільки на кожен підпункт.
   */
  variantSlots?: Record<string, number>
  /** Кого не брати на цей наряд за тегом (ж / к). Якщо не задано — з налаштувань виду наряду. */
  excludeTags?: PersonTag[]
  /** Кого брати лише з тегом. Якщо не задано — з налаштувань виду наряду. */
  requireTags?: PersonTag[]
}

export interface PlanRequest {
  /** Дати, на які складаємо план (за зростанням). */
  dates: ISODate[]
  duties: DutyRequest[]
  /** Обмежити вибір вказаними групами (порожньо — усі). */
  groups?: string[]
  /** Вручну виключені з цього плану люди. */
  excludePersonIds?: string[]
  /** Якщо задано — брати лише цих людей (напр. обрані відділення). Порожній масив = нікого. */
  onlyPersonIds?: string[]
  /** Журнал запису (звичайні / миропіль). */
  journalId?: JournalId
}

export interface Proposal {
  key: string
  date: ISODate
  dutyTypeId: string
  /** Підпункт наряду (якщо є). */
  variantId: string | null
  /** null — не вистачило людей. */
  personId: string | null
  /** Бали людини до призначення (для пояснення вибору). */
  pointsBefore: number
  /** Днів з останнього наряду до цієї дати (null — не ходив). */
  restDays: number | null
  /** Пояснення, чому обрано (або чому не вдалося). */
  note: string
}

export interface PlanResult {
  proposals: Proposal[]
  warnings: string[]
}

/** Віртуальний стан людини під час планування. */
interface VState {
  person: Person
  points: number
  /** Усього призначень (наряди / миропіль). */
  totalCount: number
  /** Номер у списку групи (1-based), для розвʼязання нічиїх. */
  groupNo: number
  /** Усі дні з будь-яким нарядум (для перерви / cooldown). */
  dates: ISODate[]
  /** Дні з цілодобовою зайнятістю — інші наряди заборонені. */
  exclusiveDates: ISODate[]
  dutyDates: Record<string, ISODate[]>
  lastDate: ISODate | null
  lastDutyTypeId: string | null
  countByDuty: Record<string, number>
}

/** Номер у групі: порядок додавання (createdAt), далі за ПІБ. */
function buildGroupNumbers(people: Person[]): Map<string, number> {
  const byGroup = new Map<string, Person[]>()
  for (const p of people) {
    const g = p.group || ''
    const list = byGroup.get(g) ?? []
    list.push(p)
    byGroup.set(g, list)
  }
  const out = new Map<string, number>()
  for (const list of byGroup.values()) {
    list.sort(
      (a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name, 'uk'),
    )
    list.forEach((p, i) => out.set(p.id, i + 1))
  }
  return out
}

function sumCounts(byDuty: Record<string, number>): number {
  let n = 0
  for (const v of Object.values(byDuty)) n += v
  return n
}

/**
 * Східчасте порівняння кандидатів (звичайні наряди):
 * 1) менше балів → раніше
 * 2) менше призначень → раніше
 * 3) менший номер у групі → раніше
 */
function compareCandidates(
  a: VState,
  b: VState,
  opts?: {
    randomTies?: boolean
    tieKey?: Map<string, number>
    avoidRepeatDuty?: boolean
    dutyId?: string
  },
): number {
  if (a.points !== b.points) return a.points - b.points
  if (a.totalCount !== b.totalCount) return a.totalCount - b.totalCount
  if (a.groupNo !== b.groupNo) return a.groupNo - b.groupNo
  if (opts?.avoidRepeatDuty && opts.dutyId) {
    const ar = a.lastDutyTypeId === opts.dutyId ? 1 : 0
    const br = b.lastDutyTypeId === opts.dutyId ? 1 : 0
    if (ar !== br) return ar - br
  }
  if (opts?.randomTies && opts.tieKey) {
    return (opts.tieKey.get(a.person.id) ?? 0) - (opts.tieKey.get(b.person.id) ?? 0)
  }
  return a.person.name.localeCompare(b.person.name, 'uk')
}

/** Головне чергування: кількість саме цього наряду → алфавіт. */
function compareMainDuty(a: VState, b: VState, dutyId: string): number {
  const ca = a.countByDuty[dutyId] ?? 0
  const cb = b.countByDuty[dutyId] ?? 0
  if (ca !== cb) return ca - cb
  return a.person.name.localeCompare(b.person.name, 'uk')
}

function spanDates(start: ISODate, spanDays: number): ISODate[] {
  const n = Math.max(1, Math.floor(spanDays) || 1)
  const out: ISODate[] = []
  for (let i = 0; i < n; i++) out.push(addDaysISO(start, i))
  return out
}

function markDates(s: VState, dates: ISODate[], dutyId: string) {
  for (const d of dates) {
    if (!s.dates.includes(d)) s.dates.push(d)
    const dd = s.dutyDates[dutyId] ?? (s.dutyDates[dutyId] = [])
    if (!dd.includes(d)) dd.push(d)
  }
}

function markExclusive(s: VState, dates: ISODate[]) {
  for (const d of dates) {
    if (!s.exclusiveDates.includes(d)) s.exclusiveDates.push(d)
  }
}

function isDutyLikeJournal(journalId: unknown): boolean {
  const j = normalizeJournalId(journalId)
  return j === 'duties' || j === 'myropil'
}

function buildVirtualState(data: AppData, stats?: PersonStatRow[]): Map<string, VState> {
  const map = new Map<string, VState>()
  const byId = stats ? new Map(stats.map((r) => [r.personId, r])) : null
  const dutyById = new Map(data.dutyTypes.map((d) => [d.id, d]))
  const groupNo = buildGroupNumbers(data.people)
  const asOf = todayISO()
  for (const p of data.people) {
    const row = byId?.get(p.id)
    const lastDate = row?.lastDate && row.lastDate <= asOf ? row.lastDate : null
    const countByDuty = { ...(row?.countByDuty ?? {}) }
    map.set(p.id, {
      person: p,
      points: p.basePoints + (row?.earnedPoints ?? 0),
      totalCount: sumCounts(countByDuty),
      groupNo: groupNo.get(p.id) ?? 9999,
      dates: [],
      exclusiveDates: [],
      dutyDates: {},
      lastDate,
      lastDutyTypeId: lastDate ? (row?.lastDutyTypeId ?? null) : null,
      countByDuty,
    })
    if (lastDate) map.get(p.id)!.dates.push(lastDate)
  }
  for (const a of data.assignments) {
    const s = map.get(a.personId)
    if (!s) continue
    if (isDutyLikeJournal(a.journalId)) {
      const span = Math.max(1, Math.floor(Number(a.spanDays) || 1))
      const days = spanDates(a.date, span)
      markDates(s, days, a.dutyTypeId)
      const duty = dutyById.get(a.dutyTypeId)
      if (duty?.blocksFullDay) markExclusive(s, days)
    }
    if (byId) continue
    if (!isRatingAssignment(a)) continue
    const duty = dutyById.get(a.dutyTypeId)
    if (!duty?.isMainDuty) s.points += a.points
    if (!isDutyHistoryAssignment(a)) continue
    s.countByDuty[a.dutyTypeId] = (s.countByDuty[a.dutyTypeId] ?? 0) + 1
    s.totalCount += 1
    if (a.date <= asOf && (!s.lastDate || a.date > s.lastDate)) {
      s.lastDate = a.date
      s.lastDutyTypeId = a.dutyTypeId
    }
  }
  return map
}

function applyVirtual(
  s: VState,
  date: ISODate,
  duty: DutyType,
  weekendMultiplier: number,
  variantId: string | null = null,
  spanDays = 1,
) {
  const span = Math.max(1, Math.floor(spanDays) || 1)
  const days = spanDates(date, span)
  if (!duty.isMainDuty) {
    s.points += dutyPointsForDate(dutyBasePoints(duty, variantId), date, weekendMultiplier)
  }
  markDates(s, days, duty.id)
  if (duty.blocksFullDay) markExclusive(s, days)
  s.countByDuty[duty.id] = (s.countByDuty[duty.id] ?? 0) + 1
  s.totalCount += 1
  if (!s.lastDate || date >= s.lastDate) {
    s.lastDate = date
    s.lastDutyTypeId = duty.id
  }
}

function busyOn(s: VState, date: ISODate): boolean {
  return s.dates.includes(date)
}

function exclusiveBusyOn(s: VState, date: ISODate): boolean {
  return s.exclusiveDates.includes(date)
}

function busyOnSpan(s: VState, start: ISODate, spanDays: number): boolean {
  return spanDates(start, spanDays).some((d) => busyOn(s, d))
}

function exclusiveBusyOnSpan(s: VState, start: ISODate, spanDays: number): boolean {
  return spanDates(start, spanDays).some((d) => exclusiveBusyOn(s, d))
}

/** Конфлікт зайнятості: цілодобовий наряд потребує повністю вільних днів; звичайний — лише без цілодобових. */
function conflictsOccupation(s: VState, start: ISODate, spanDays: number, duty: DutyType): boolean {
  if (duty.blocksFullDay) return busyOnSpan(s, start, spanDays)
  return exclusiveBusyOnSpan(s, start, spanDays)
}

function violatesCooldown(s: VState, date: ISODate, cooldownDays: number): boolean {
  if (cooldownDays <= 0) return false
  for (const d of s.dates) {
    if (d === date) continue
    if (Math.abs(diffDays(date, d)) <= cooldownDays) return true
  }
  return false
}

function violatesCooldownSpan(s: VState, start: ISODate, spanDays: number, cooldownDays: number): boolean {
  if (cooldownDays <= 0) return false
  return spanDates(start, spanDays).some((d) => violatesCooldown(s, d, cooldownDays))
}

/** Обмеження частоти саме цього наряду (між однаковими, не між усіма). */
function violatesDutyCadence(s: VState, date: ISODate, duty: DutyType): boolean {
  const n = Math.max(0, Number(duty.cadenceDays) || 0)
  if (n <= 0) return false
  const dates = s.dutyDates[duty.id] ?? []
  const mode = duty.cadenceMode ?? 'minGap'
  if (mode === 'minGap') {
    // n = днів відпочинку: після понеділка при n=4 наступне не раніше суботи (diff > n).
    for (const d of dates) {
      if (d === date) continue
      if (Math.abs(diffDays(date, d)) <= n) return true
    }
    return false
  }
  // maxStreak: скільки днів підряд уже було до цієї дати
  let streak = 0
  for (let i = 1; i <= n + 1; i++) {
    if (dates.includes(addDaysISO(date, -i))) streak++
    else break
  }
  return streak + 1 > n
}

function violatesDutyCadenceSpan(
  s: VState,
  start: ISODate,
  spanDays: number,
  duty: DutyType,
): boolean {
  if (Math.max(0, Number(duty.cadenceDays) || 0) <= 0) return false
  return spanDates(start, spanDays).some((d) => violatesDutyCadence(s, d, duty))
}

/** Чи настав час ставити наступне призначення цього наряду (глобальна періодичність між днями). */
function dueByPeriodicity(lastStartDate: ISODate | null, date: ISODate, period: number): boolean {
  if (period <= 0) return true
  if (!lastStartDate) return true
  // Той самий день: інтервал не обмежує кількість місць / людей одночасно
  if (lastStartDate === date) return true
  return diffDays(date, lastStartDate) >= period
}

function lastDutyDateFromState(state: Map<string, VState>, dutyId: string): ISODate | null {
  let last: ISODate | null = null
  for (const s of state.values()) {
    for (const d of s.dutyDates[dutyId] ?? []) {
      if (!last || d > last) last = d
    }
  }
  return last
}

/** Днів вільного відпочинку перед `date` (проміжок між нарядами мінус 1). */
function restBefore(s: VState, date: ISODate): number | null {
  let last: ISODate | null = null
  for (const d of s.dates) {
    if (d < date && (!last || d > last)) last = d
  }
  if (!last) return null
  return Math.max(0, diffDays(date, last) - 1)
}

function dutyExcludeTags(duty: DutyType, override?: PersonTag[]): Set<PersonTag> {
  return new Set(override ?? duty.excludeTags ?? [])
}

function dutyRequireTags(duty: DutyType, override?: PersonTag[]): Set<PersonTag> {
  return new Set(override ?? duty.requireTags ?? [])
}

function personBlockedByExcludeTags(person: Person, tags: Set<PersonTag>): boolean {
  if (tags.size === 0) return false
  return (person.tags ?? []).some((t) => tags.has(t))
}

function personBlockedByRequireTags(person: Person, tags: Set<PersonTag>): boolean {
  if (tags.size === 0) return false
  const have = new Set(person.tags ?? [])
  const commanderReq = [...tags].filter((t) => t === 'commander' || t === 'groupCommander')
  const otherReq = [...tags].filter((t) => t !== 'commander' && t !== 'groupCommander')
  for (const t of otherReq) {
    if (!have.has(t)) return true
  }
  // «ком»: достатньо будь-якого з кв / кг
  if (commanderReq.length > 0 && !commanderReq.some((t) => have.has(t))) return true
  return false
}

function personBlockedByDuty(person: Person, dutyTypeId: string): boolean {
  return (person.excludedDutyIds ?? []).includes(dutyTypeId)
}

function personBlockedForDuty(
  person: Person,
  duty: DutyType,
  excludeOverride?: PersonTag[],
  requireOverride?: PersonTag[],
): boolean {
  if (personBlockedByDuty(person, duty.id)) return true
  if (personBlockedByExcludeTags(person, dutyExcludeTags(duty, excludeOverride))) return true
  if (personBlockedByRequireTags(person, dutyRequireTags(duty, requireOverride))) return true
  return false
}

function seededRandom(seed: number) {
  let x = seed || 123456789
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return ((x >>> 0) % 100000) / 100000
  }
}

/**
 * Жадібний планувальник: для кожної дати, починаючи з найдорожчих нарядів,
 * обирає людину східчасто: менше балів → менше призначень → менший номер у групі.
 */
export function planAssignments(data: AppData, req: PlanRequest, stats?: PersonStatRow[]): PlanResult {
  const warnings: string[] = []
  const proposals: Proposal[] = []
  const state = buildVirtualState(data, stats)
  const dutyById = new Map(data.dutyTypes.map((d) => [d.id, d]))
  const excluded = new Set(req.excludePersonIds ?? [])
  const groups = new Set((req.groups ?? []).filter(Boolean))
  const onlyPeople = req.onlyPersonIds != null ? new Set(req.onlyPersonIds) : null
  const rnd = seededRandom(Date.now() & 0x7fffffff)
  const { cooldownDays, randomTies, avoidRepeatDuty, weekendMultiplier, myropilStays } = data.settings
  const journalId = req.journalId ?? 'duties'
  const stays = myropilStays ?? []

  const dates = [...req.dates].sort()
  /** Робочі місця: для підпунктів — стільки, скільки вказано в variantSlots (за замовч. 1). */
  type WorkItem = {
    duty: DutyType
    excludeTags?: PersonTag[]
    requireTags?: PersonTag[]
    variantId: string | null
    slotPoints: number
  }
  const workItems: WorkItem[] = []
  for (const r of req.duties) {
    const duty = dutyById.get(r.dutyTypeId)
    if (!duty) continue
    const variants = leafVariants(duty.variants)
    if (variants.length > 0) {
      for (const v of variants) {
        const n = Math.max(
          0,
          Math.floor(Number(r.variantSlots?.[v.id] ?? v.defaultSlots ?? 1) || 0),
        )
        for (let i = 0; i < n; i++) {
          workItems.push({
            duty,
            excludeTags: r.excludeTags,
            requireTags: r.requireTags,
            variantId: v.id,
            slotPoints: duty.isMainDuty ? 0 : v.points,
          })
        }
      }
    } else if (r.slots > 0) {
      for (let slot = 0; slot < r.slots; slot++) {
        workItems.push({
          duty,
          excludeTags: r.excludeTags,
          requireTags: r.requireTags,
          variantId: null,
          slotPoints: duty.isMainDuty ? 0 : duty.points,
        })
      }
    }
  }
  if (workItems.length === 0) {
    warnings.push('Не обрано жодного місця для призначення.')
  }
  // Порядок `req.duties` = пріоритет користувача (зверху → першим). Не пересортовуємо за балами.

  const eligibleBase = [...state.values()].filter((s) => {
    if (s.person.status !== 'active') return false
    if (excluded.has(s.person.id)) return false
    if (groups.size > 0 && !groups.has(s.person.group)) return false
    if (onlyPeople && !onlyPeople.has(s.person.id)) return false
    return true
  })

  if (eligibleBase.length === 0) {
    warnings.push('Немає жодної людини, доступної для призначення.')
  }

  /** Остання дата призначення кожного наряду (будь-ким) — для періодичності. */
  const lastByDuty = new Map<string, ISODate>()
  for (const d of data.dutyTypes) {
    const last = lastDutyDateFromState(state, d.id)
    if (last) lastByDuty.set(d.id, last)
  }

  for (const date of dates) {
    const tieKey = new Map<string, number>()
    for (const s of eligibleBase) tieKey.set(s.person.id, rnd())

    const dayPool = eligibleBase.filter((s) => {
      const inMyro = personInMyropilOn(s.person, date, stays)
      if (journalId === 'myropil') return inMyro
      return !inMyro
    })

    for (const item of workItems) {
      const { duty, variantId, slotPoints } = item
      const spanDays = Math.max(1, Math.floor(Number(duty.durationDays) || 1))
      const period = Math.max(0, Number(duty.periodicityDays) || 0)
      if (!dueByPeriodicity(lastByDuty.get(duty.id) ?? null, date, period)) {
        // Ще не час наступного призначення цього наряду.
        continue
      }
      const free = dayPool.filter(
        (s) =>
          !conflictsOccupation(s, date, spanDays, duty) &&
          !personBlockedForDuty(s.person, duty, item.excludeTags, item.requireTags) &&
          // Відпочинок цієї людини на цей наряд — жорстко.
          !violatesDutyCadenceSpan(s, date, spanDays, duty),
      )
      // Глобальну перерву між будь-якими нарядами можна послабити, якщо інакше порожньо.
      let pool = free.filter((s) => !violatesCooldownSpan(s, date, spanDays, cooldownDays))
      let relaxed = false
      if (pool.length === 0 && free.length > 0) {
        pool = free
        relaxed = true
      }

      if (pool.length === 0) {
        proposals.push({
          key: uid(),
          date,
          dutyTypeId: duty.id,
          variantId,
          personId: null,
          pointsBefore: 0,
          restDays: null,
          note: 'Не вистачило людей (відпочинок наряду / зайнятість)',
        })
        continue
      }

      if (duty.isMainDuty) {
        pool.sort((a, b) => compareMainDuty(a, b, duty.id))
      } else {
        pool.sort((a, b) =>
          compareCandidates(a, b, { randomTies, tieKey, avoidRepeatDuty, dutyId: duty.id }),
        )
      }

      const chosen = pool[0]
      const rest = restBefore(chosen, date)
      const vName = variantId ? findVariant(duty, variantId)?.name : null
      const parts: string[] = duty.isMainDuty
        ? [`${chosen.countByDuty[duty.id] ?? 0}× ${duty.short || duty.name}`]
        : [`${chosen.points} б.`, `${chosen.totalCount} призн.`, `№${chosen.groupNo}`]
      if (vName) parts.push(vName)
      if (spanDays > 1) parts.push(`${spanDays} дн.`)
      if (rest === null) parts.push('ще не ходив')
      if (relaxed) parts.push('⚠ порушено глобальну перерву')
      if (!duty.isMainDuty) {
        parts.push(`+${dutyPointsForDate(slotPoints, date, weekendMultiplier)} б.`)
      } else {
        parts.push('0 б.')
      }

      proposals.push({
        key: uid(),
        date,
        dutyTypeId: duty.id,
        variantId,
        personId: chosen.person.id,
        pointsBefore: chosen.points,
        restDays: rest,
        note: parts.join(' · '),
      })
      applyVirtual(chosen, date, duty, weekendMultiplier, variantId, spanDays)
      // Періодичність рахуємо від дати старту; кілька слотів того ж дня лишаються дозволеними.
      lastByDuty.set(duty.id, date)
    }
  }

  const missing = proposals.filter((p) => !p.personId).length
  if (missing > 0) {
    warnings.push(`Не вдалося заповнити ${missing} місць — бракує вільних людей з урахуванням відпочинку наряду.`)
  }
  const relaxedCount = proposals.filter((p) => p.note.includes('порушено глобальну перерву')).length
  if (relaxedCount > 0) {
    warnings.push(
      `Для ${relaxedCount} призначень довелося порушити глобальну перерву між нарядами — людей не вистачило.`,
    )
  }

  return { proposals, warnings }
}

export interface Candidate {
  person: Person
  points: number
  totalCount: number
  /** Кількість призначень саме на цей вид наряду (для головного чергування). */
  dutyCount: number
  groupNo: number
  restDays: number | null
  busy: boolean
  available: boolean
  /** Людина за замовчуванням не йде на цей вид наряду. */
  dutyBlocked: boolean
}

/**
 * Список усіх людей для ручної заміни в попередньому перегляді — відсортований як в автопризначенні.
 * `plannedByPerson` — дати, вже зайняті в поточному плані за кожною людиною.
 */
export function rankCandidates(
  data: AppData,
  date: ISODate,
  plannedByPerson: Map<string, ISODate[]>,
  stats?: PersonStatRow[],
  dutyTypeId?: string,
): Candidate[] {
  const state = buildVirtualState(data, stats)
  for (const [pid, dates] of plannedByPerson) {
    const s = state.get(pid)
    if (s) s.dates.push(...dates)
  }
  const out: Candidate[] = []
  const duty = dutyTypeId ? data.dutyTypes.find((d) => d.id === dutyTypeId) : undefined
  const main = Boolean(duty?.isMainDuty)
  for (const s of state.values()) {
    const dutyBlocked = duty ? personBlockedForDuty(s.person, duty) : false
    out.push({
      person: s.person,
      points: s.points,
      totalCount: s.totalCount,
      dutyCount: dutyTypeId ? (s.countByDuty[dutyTypeId] ?? 0) : 0,
      groupNo: s.groupNo,
      restDays: restBefore(s, date),
      busy: busyOn(s, date),
      available: s.person.status === 'active',
      dutyBlocked,
    })
  }
  out.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1
    if (a.dutyBlocked !== b.dutyBlocked) return a.dutyBlocked ? 1 : -1
    if (a.busy !== b.busy) return a.busy ? 1 : -1
    if (main) {
      if (a.dutyCount !== b.dutyCount) return a.dutyCount - b.dutyCount
      return a.person.name.localeCompare(b.person.name, 'uk')
    }
    if (a.points !== b.points) return a.points - b.points
    if (a.totalCount !== b.totalCount) return a.totalCount - b.totalCount
    if (a.groupNo !== b.groupNo) return a.groupNo - b.groupNo
    return a.person.name.localeCompare(b.person.name, 'uk')
  })
  return out
}

export function proposalsToAssignments(
  proposals: Proposal[],
  dutyTypes: DutyType[],
  weekendMultiplier = 1.33,
  journalId: JournalId = 'duties',
): Assignment[] {
  const byId = new Map(dutyTypes.map((d) => [d.id, d]))
  const now = Date.now()
  const out: Assignment[] = []
  for (const p of proposals) {
    if (!p.personId) continue
    const duty = byId.get(p.dutyTypeId)
    if (!duty) continue
    const spanDays = Math.max(1, Math.floor(Number(duty.durationDays) || 1))
    out.push({
      id: uid(),
      journalId,
      date: p.date,
      dutyTypeId: p.dutyTypeId,
      personId: p.personId,
      variantId: p.variantId ?? null,
      points: duty.isMainDuty
        ? 0
        : dutyPointsForDate(dutyBasePoints(duty, p.variantId), p.date, weekendMultiplier),
      note: '',
      source: 'auto',
      createdAt: now,
      spanDays,
    })
  }
  return out
}
