import type { AppData, Assignment, DutyType, ISODate, Person } from '../types'
import { diffDays } from './dates'
import { uid } from './id'

export interface DutyRequest {
  dutyTypeId: string
  slots: number
}

export interface PlanRequest {
  /** Даты, на которые составляем план (по возрастанию). */
  dates: ISODate[]
  duties: DutyRequest[]
  /** Ограничить выбор указанными группами (пусто — все). */
  groups?: string[]
  /** Вручную исключённые на этот план люди. */
  excludePersonIds?: string[]
}

export interface Proposal {
  key: string
  date: ISODate
  dutyTypeId: string
  /** null — не хватило людей. */
  personId: string | null
  /** Баллы человека до назначения (для объяснения выбора). */
  pointsBefore: number
  /** Дней с последнего наряда до этой даты (null — не ходил). */
  restDays: number | null
  /** Пояснение, почему выбран (или почему не удалось). */
  note: string
}

export interface PlanResult {
  proposals: Proposal[]
  warnings: string[]
}

/** Виртуальное состояние человека во время планирования. */
interface VState {
  person: Person
  points: number
  dates: ISODate[]
  lastDate: ISODate | null
  lastDutyTypeId: string | null
  countByDuty: Record<string, number>
}

function buildVirtualState(data: AppData): Map<string, VState> {
  const map = new Map<string, VState>()
  for (const p of data.people) {
    map.set(p.id, {
      person: p,
      points: p.basePoints,
      dates: [],
      lastDate: null,
      lastDutyTypeId: null,
      countByDuty: {},
    })
  }
  for (const a of data.assignments) {
    const s = map.get(a.personId)
    if (!s) continue
    s.points += a.points
    s.dates.push(a.date)
    s.countByDuty[a.dutyTypeId] = (s.countByDuty[a.dutyTypeId] ?? 0) + 1
    if (!s.lastDate || a.date > s.lastDate) {
      s.lastDate = a.date
      s.lastDutyTypeId = a.dutyTypeId
    }
  }
  return map
}

function applyVirtual(s: VState, date: ISODate, duty: DutyType) {
  s.points += duty.points
  s.dates.push(date)
  s.countByDuty[duty.id] = (s.countByDuty[duty.id] ?? 0) + 1
  if (!s.lastDate || date >= s.lastDate) {
    s.lastDate = date
    s.lastDutyTypeId = duty.id
  }
}

function busyOn(s: VState, date: ISODate): boolean {
  return s.dates.includes(date)
}

function violatesCooldown(s: VState, date: ISODate, cooldownDays: number): boolean {
  if (cooldownDays <= 0) return false
  for (const d of s.dates) {
    if (d === date) continue
    if (Math.abs(diffDays(date, d)) <= cooldownDays) return true
  }
  return false
}

/** Дней отдыха перед `date` (учитываются только задействия строго до этой даты). */
function restBefore(s: VState, date: ISODate): number | null {
  let last: ISODate | null = null
  for (const d of s.dates) {
    if (d < date && (!last || d > last)) last = d
  }
  return last ? diffDays(date, last) : null
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
 * Жадный планировщик: для каждой даты, начиная с самых «дорогих» нарядов,
 * ставит человека с минимальным рейтингом. Ничьи — по времени отдыха,
 * количеству таких же нарядов, затем случайно или по алфавиту.
 */
export function planAssignments(data: AppData, req: PlanRequest): PlanResult {
  const warnings: string[] = []
  const proposals: Proposal[] = []
  const state = buildVirtualState(data)
  const dutyById = new Map(data.dutyTypes.map((d) => [d.id, d]))
  const excluded = new Set(req.excludePersonIds ?? [])
  const groups = new Set((req.groups ?? []).filter(Boolean))
  const rnd = seededRandom(Date.now() & 0x7fffffff)
  const { cooldownDays, randomTies, avoidRepeatDuty } = data.settings

  const dates = [...req.dates].sort()
  const duties = req.duties
    .map((r) => ({ req: r, duty: dutyById.get(r.dutyTypeId) }))
    .filter((x): x is { req: DutyRequest; duty: DutyType } => !!x.duty && x.req.slots > 0)
    .sort((a, b) => b.duty.points - a.duty.points || a.duty.order - b.duty.order)

  const eligibleBase = [...state.values()].filter(
    (s) =>
      s.person.status === 'active' &&
      !excluded.has(s.person.id) &&
      (groups.size === 0 || groups.has(s.person.group)),
  )

  if (eligibleBase.length === 0) {
    warnings.push('Нет ни одного человека, доступного для назначения.')
  }

  for (const date of dates) {
    // случайные ключи фиксируем на день, чтобы сортировка была стабильной
    const tieKey = new Map<string, number>()
    for (const s of eligibleBase) tieKey.set(s.person.id, rnd())

    for (const { req: r, duty } of duties) {
      for (let slot = 0; slot < r.slots; slot++) {
        const free = eligibleBase.filter((s) => !busyOn(s, date))
        let pool = free.filter((s) => !violatesCooldown(s, date, cooldownDays))
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
            personId: null,
            pointsBefore: 0,
            restDays: null,
            note: 'Не хватило людей',
          })
          continue
        }

        pool.sort((a, b) => {
          if (a.points !== b.points) return a.points - b.points
          if (avoidRepeatDuty) {
            const ar = a.lastDutyTypeId === duty.id ? 1 : 0
            const br = b.lastDutyTypeId === duty.id ? 1 : 0
            if (ar !== br) return ar - br
          }
          const ra = restBefore(a, date)
          const rb = restBefore(b, date)
          const va = ra === null ? Number.POSITIVE_INFINITY : ra
          const vb = rb === null ? Number.POSITIVE_INFINITY : rb
          if (va !== vb) return vb - va
          const ca = a.countByDuty[duty.id] ?? 0
          const cb = b.countByDuty[duty.id] ?? 0
          if (ca !== cb) return ca - cb
          if (randomTies) return (tieKey.get(a.person.id) ?? 0) - (tieKey.get(b.person.id) ?? 0)
          return a.person.name.localeCompare(b.person.name, 'ru')
        })

        const chosen = pool[0]
        const rest = restBefore(chosen, date)
        const parts: string[] = [`${chosen.points} б.`]
        parts.push(rest === null ? 'ещё не ходил' : `отдых ${rest} дн.`)
        if (relaxed) parts.push('⚠ нарушен перерыв')

        proposals.push({
          key: uid(),
          date,
          dutyTypeId: duty.id,
          personId: chosen.person.id,
          pointsBefore: chosen.points,
          restDays: rest,
          note: parts.join(' · '),
        })
        applyVirtual(chosen, date, duty)
      }
    }
  }

  const missing = proposals.filter((p) => !p.personId).length
  if (missing > 0) {
    warnings.push(`Не удалось заполнить ${missing} мест — не хватает свободных людей.`)
  }
  const relaxedCount = proposals.filter((p) => p.note.includes('нарушен перерыв')).length
  if (relaxedCount > 0) {
    warnings.push(
      `Для ${relaxedCount} назначений пришлось нарушить минимальный перерыв (${cooldownDays} дн.) — людей не хватило.`,
    )
  }

  return { proposals, warnings }
}

export interface Candidate {
  person: Person
  points: number
  restDays: number | null
  busy: boolean
  available: boolean
}

/**
 * Список всех людей для ручной замены в предпросмотре — отсортирован как в автоназначении.
 * `plannedDates` — даты, уже занятые в текущем плане по каждому человеку.
 */
export function rankCandidates(
  data: AppData,
  date: ISODate,
  plannedByPerson: Map<string, ISODate[]>,
): Candidate[] {
  const state = buildVirtualState(data)
  for (const [pid, dates] of plannedByPerson) {
    const s = state.get(pid)
    if (s) s.dates.push(...dates)
  }
  const out: Candidate[] = []
  for (const s of state.values()) {
    out.push({
      person: s.person,
      points: s.points,
      restDays: restBefore(s, date),
      busy: busyOn(s, date),
      available: s.person.status === 'active',
    })
  }
  out.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1
    if (a.busy !== b.busy) return a.busy ? 1 : -1
    if (a.points !== b.points) return a.points - b.points
    return a.person.name.localeCompare(b.person.name, 'ru')
  })
  return out
}

export function proposalsToAssignments(
  proposals: Proposal[],
  dutyTypes: DutyType[],
): Assignment[] {
  const byId = new Map(dutyTypes.map((d) => [d.id, d]))
  const now = Date.now()
  const out: Assignment[] = []
  for (const p of proposals) {
    if (!p.personId) continue
    const duty = byId.get(p.dutyTypeId)
    if (!duty) continue
    out.push({
      id: uid(),
      date: p.date,
      dutyTypeId: p.dutyTypeId,
      personId: p.personId,
      points: duty.points,
      note: '',
      source: 'auto',
      createdAt: now,
    })
  }
  return out
}
