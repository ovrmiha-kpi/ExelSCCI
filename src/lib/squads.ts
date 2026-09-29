import type { Person, SquadRange } from '../types'
import { uid } from './id'

/** Порядок людей у групі — як № у автопризначенні (createdAt → імʼя). */
export function sortPeopleInGroup(people: Person[]): Person[] {
  return [...people].sort(
    (a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name, 'uk'),
  )
}

export function peopleOfGroup(people: Person[], group: string | null | undefined): Person[] {
  if (!group) return []
  return sortPeopleInGroup(people.filter((p) => p.group === group))
}

export function normalizeSquadRanges(raw: unknown): SquadRange[] {
  if (!Array.isArray(raw)) return []
  const out: SquadRange[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id ? o.id : uid()
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const fromPersonId = typeof o.fromPersonId === 'string' ? o.fromPersonId : ''
    const toPersonId = typeof o.toPersonId === 'string' ? o.toPersonId : ''
    const commanderPersonId =
      typeof o.commanderPersonId === 'string' && o.commanderPersonId ? o.commanderPersonId : null
    if (!name || !fromPersonId || !toPersonId) continue
    out.push({ id, name, fromPersonId, toPersonId, commanderPersonId })
  }
  return out
}

export function newSquadRange(partial?: Partial<SquadRange>): SquadRange {
  return {
    id: uid(),
    name: partial?.name ?? '',
    fromPersonId: partial?.fromPersonId ?? '',
    toPersonId: partial?.toPersonId ?? '',
    commanderPersonId: partial?.commanderPersonId ?? null,
  }
}

/** Індекси from/to у впорядкованому списку (включно). null — якщо id не знайдено. */
export function squadIndexRange(
  ordered: Person[],
  squad: SquadRange,
): { from: number; to: number } | null {
  const iFrom = ordered.findIndex((p) => p.id === squad.fromPersonId)
  const iTo = ordered.findIndex((p) => p.id === squad.toPersonId)
  if (iFrom < 0 || iTo < 0) return null
  return { from: Math.min(iFrom, iTo), to: Math.max(iFrom, iTo) }
}

export function peopleInSquad(ordered: Person[], squad: SquadRange): Person[] {
  const r = squadIndexRange(ordered, squad)
  if (!r) return []
  return ordered.slice(r.from, r.to + 1)
}

/** Id людей, що входять хоча б в одне з обраних відділень. */
export function personIdsInSquads(
  ordered: Person[],
  squads: SquadRange[],
  selectedSquadIds: Iterable<string>,
): Set<string> {
  const want = new Set([...selectedSquadIds].filter(Boolean))
  const ids = new Set<string>()
  if (want.size === 0) return ids
  for (const s of squads) {
    if (!want.has(s.id)) continue
    for (const p of peopleInSquad(ordered, s)) ids.add(p.id)
  }
  return ids
}

export function squadLabel(squad: SquadRange, ordered: Person[]): string {
  const members = peopleInSquad(ordered, squad)
  if (members.length === 0) return `${squad.name} (порожнє)`
  const a = members[0]?.name ?? '?'
  const b = members[members.length - 1]?.name ?? '?'
  return `${squad.name}: ${a} — ${b} (${members.length})`
}
