import type { JournalId } from '../types'
import { normalizeJournalId } from '../types'

const LEGACY_KEY = 'dutyrank:uiPrefs:v1'
const GROUP_PREFIX = 'dutyrank:uiPrefs:group:'
const ALL_KEY = 'dutyrank:uiPrefs:all'

export interface UiPrefs {
  lastTab?: string
  scheduleJournal?: JournalId
  scheduleKind?: 'week' | '2weeks' | 'month'
  scheduleRowsMode?: 'people' | 'duties'
  /** ISO-дата якоря журналу (місяць/тиждень, на якому зупинились). */
  scheduleAnchor?: string
  scheduleOnlyBusy?: boolean
  scheduleSearch?: string
  ratingPeriod?: 'all' | '7' | '30' | '90' | 'custom'
  ratingMode?: 'count' | 'points'
  ratingOnlyActive?: boolean
  ratingGroup?: string
  ratingShowArchived?: boolean
  ratingFrom?: string
  ratingTo?: string
  ratingSearch?: string
  /** Обрані групи для автопризначення (порожньо = усі). */
  assignGroups?: string[]
  /** Обрані відділення для автопризначення (порожньо = усі). */
  assignSquads?: string[]
  assignMultiDay?: boolean
  assignFrom?: string
  assignTo?: string
  assignEnabled?: Record<string, boolean>
  assignSlots?: Record<string, number>
  assignVariantSlots?: Record<string, number>
  /** Порядок пріоритету нарядів при автопризначенні (зверху = перший). */
  assignPriority?: string[]
  peopleSearch?: string
  peopleSortKey?: string
  peopleSortDesc?: boolean
}

function prefsKey(group: string | null | undefined): string {
  if (group && group.trim()) return GROUP_PREFIX + group.trim()
  return ALL_KEY
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function isPrefsISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false
  const t = Date.parse(s + 'T12:00:00')
  return !Number.isNaN(t)
}

function readRaw(key: string): UiPrefs {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as UiPrefs
    if (!parsed || typeof parsed !== 'object') return {}
    if (parsed.scheduleJournal) parsed.scheduleJournal = normalizeJournalId(parsed.scheduleJournal)
    return parsed
  } catch {
    return {}
  }
}

function migrateLegacyInto(key: string): UiPrefs {
  const cur = readRaw(key)
  if (Object.keys(cur).length > 0) return cur
  const legacy = readRaw(LEGACY_KEY)
  if (Object.keys(legacy).length === 0) return {}
  try {
    localStorage.setItem(key, JSON.stringify(legacy))
  } catch {
    /* ignore */
  }
  return legacy
}

export function loadUiPrefs(group?: string | null): UiPrefs {
  const key = prefsKey(group)
  return migrateLegacyInto(key)
}

export function saveUiPrefs(patch: Partial<UiPrefs>, group?: string | null) {
  try {
    const key = prefsKey(group)
    const next = { ...loadUiPrefs(group), ...patch }
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}
