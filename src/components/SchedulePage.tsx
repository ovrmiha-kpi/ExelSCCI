import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import type { Assignment, ConductKind, DutyType, ISODate, JournalId, Person } from '../types'
import {
  CONDUCT_KIND_META,
  isConductKind,
  JOURNAL_IDS,
  JOURNAL_META,
  normalizeJournalId,
} from '../types'
import { activeDutyTypes, sortedDutyTypes } from '../lib/stats'
import { buildAssignmentIndex, key2 } from '../lib/indexes'
import {
  addDaysISO,
  addMonthsISO,
  assignmentDaysLeftFrom,
  assignmentSpanDays,
  dateRange,
  dayOfMonth,
  dutyPointsForDate,
  endOfMonthISO,
  formatHuman,
  formatMonthTitle,
  formatShort,
  isAssignmentDrawDay,
  isWeekend,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
  weekdayShort,
} from '../lib/dates'
import { dutyBasePoints, dutyHoverTitle, dutyShortLabel, effectiveSlots, findVariant, leafVariants } from '../lib/defaults'
import { exportJournalXLSX } from '../lib/export'
import { useAssignmentsRange, usePersonDayAssignments } from '../lib/queries'
import { DutyBadge, EmptyState, Field, Modal, PersonTags, Segmented, Toggle } from './ui'
import { ManualAssignModal } from './ManualAssignModal'
import { BulkCellAssignModal, cellKey, type JournalCellRef } from './BulkCellAssignModal'
import { loadUiPrefs, saveUiPrefs, isPrefsISODate } from '../lib/uiPrefs'
import { myropilCoveredMask, groupTouchesMyropil, dateInAnyMyropilStay } from '../lib/myropil'
import { filterByGroupLock } from '../lib/auth'
import { useEffectiveGroup } from '../lib/AuthContext'

function cellsInRect(
  a: JournalCellRef,
  b: JournalCellRef,
  peopleOrder: Person[],
  dates: ISODate[],
): JournalCellRef[] {
  const pi = peopleOrder.findIndex((p) => p.id === a.personId)
  const pj = peopleOrder.findIndex((p) => p.id === b.personId)
  const di = dates.indexOf(a.date)
  const dj = dates.indexOf(b.date)
  if (pi < 0 || pj < 0 || di < 0 || dj < 0) return [b]
  const [p0, p1] = pi <= pj ? [pi, pj] : [pj, pi]
  const [d0, d1] = di <= dj ? [di, dj] : [dj, di]
  const out: JournalCellRef[] = []
  for (let p = p0; p <= p1; p++) {
    for (let d = d0; d <= d1; d++) {
      out.push({ personId: peopleOrder[p].id, date: dates[d] })
    }
  }
  return out
}

type RangeKind = 'week' | '2weeks' | 'month'
type RowsMode = 'people' | 'duties'

export function SchedulePage({ readOnly = false }: { readOnly?: boolean }) {
  const allPeople = useStore((s) => s.people)
  const effectiveGroup = useEffectiveGroup()
  const people = useMemo(() => filterByGroupLock(allPeople, effectiveGroup), [allPeople, effectiveGroup])
  const dutyTypes = useStore((s) => s.dutyTypes)
  const myropilStays = useStore((s) => s.settings.myropilStays)
  const removeAssignments = useStore((s) => s.removeAssignments)

  const today = todayISO()
  const prefs = loadUiPrefs(effectiveGroup)
  const [journal, setJournalRaw] = useState<JournalId>(() =>
    normalizeJournalId(prefs.scheduleJournal ?? 'duties'),
  )
  const setJournal = (id: JournalId) => {
    const next = normalizeJournalId(id)
    setJournalRaw(next)
    saveUiPrefs({ scheduleJournal: next }, effectiveGroup)
  }
  useEffect(() => {
    setJournalRaw((j) => normalizeJournalId(j))
  }, [])
  const [kind, setKindRaw] = useState<RangeKind>(() => {
    if (prefs.scheduleKind) return prefs.scheduleKind
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) return 'week'
    return 'month'
  })
  const setKind = (k: RangeKind) => {
    setKindRaw(k)
    saveUiPrefs({ scheduleKind: k }, effectiveGroup)
  }
  const [anchor, setAnchorRaw] = useState<ISODate>(() =>
    isPrefsISODate(prefs.scheduleAnchor) ? prefs.scheduleAnchor : today,
  )
  const setAnchor = (next: ISODate | ((prev: ISODate) => ISODate)) => {
    setAnchorRaw((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      saveUiPrefs({ scheduleAnchor: value }, effectiveGroup)
      return value
    })
  }
  const [rowsMode, setRowsModeRaw] = useState<RowsMode>(() => prefs.scheduleRowsMode ?? 'people')
  const setRowsMode = (m: RowsMode) => {
    setRowsModeRaw(m)
    saveUiPrefs({ scheduleRowsMode: m }, effectiveGroup)
  }
  const [group, setGroup] = useState(() => effectiveGroup ?? '')
  const [search, setSearchRaw] = useState(() => prefs.scheduleSearch ?? '')
  const setSearch = (v: string) => {
    setSearchRaw(v)
    saveUiPrefs({ scheduleSearch: v }, effectiveGroup)
  }
  const [onlyBusy, setOnlyBusyRaw] = useState(() => prefs.scheduleOnlyBusy ?? false)
  const setOnlyBusy = (v: boolean) => {
    setOnlyBusyRaw(v)
    saveUiPrefs({ scheduleOnlyBusy: v }, effectiveGroup)
  }
  const [cell, setCell] = useState<{ personId: string; date: ISODate } | null>(null)
  const [manual, setManual] = useState<{ date?: ISODate; dutyId?: string } | null>(null)
  const [selectedCells, setSelectedCells] = useState<Map<string, JournalCellRef>>(() => new Map())
  const [bulkOpen, setBulkOpen] = useState(false)
  const selectAnchor = useRef<JournalCellRef | null>(null)
  const [slideDir, setSlideDir] = useState<-1 | 0 | 1>(0)
  const [animKey, setAnimKey] = useState(0)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => Number(today.slice(0, 4)))
  const monthPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!monthPickerOpen) return
    setPickerYear(Number(anchor.slice(0, 4)))
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!monthPickerRef.current?.contains(e.target as Node)) setMonthPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMonthPickerOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [monthPickerOpen, anchor])

  const pickMonth = (year: number, monthIndex0: number) => {
    const mm = String(monthIndex0 + 1).padStart(2, '0')
    setAnchor(`${year}-${mm}-01`)
    setKind('month')
    setMonthPickerOpen(false)
  }

  const MONTH_NAMES = [
    'січень',
    'лютий',
    'березень',
    'квітень',
    'травень',
    'червень',
    'липень',
    'серпень',
    'вересень',
    'жовтень',
    'листопад',
    'грудень',
  ] as const

  useEffect(() => {
    if (effectiveGroup) setGroup(effectiveGroup)
    const p = loadUiPrefs(effectiveGroup)
    setJournalRaw(normalizeJournalId(p.scheduleJournal ?? 'duties'))
    setKindRaw(
      p.scheduleKind ??
        (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'week' : 'month'),
    )
    setRowsModeRaw(p.scheduleRowsMode ?? 'people')
    if (isPrefsISODate(p.scheduleAnchor)) setAnchorRaw(p.scheduleAnchor)
    setSearchRaw(p.scheduleSearch ?? '')
    setOnlyBusyRaw(p.scheduleOnlyBusy ?? false)
  }, [effectiveGroup])

  const isDuties = journal === 'duties'
  const isMyropil = journal === 'myropil'
  const isDutyJournal = isDuties || isMyropil
  const showPoints = isDutyJournal || journal === 'conduct'
  const effectiveRowsMode: RowsMode = isDutyJournal ? rowsMode : 'people'

  const { from, to } = useMemo(() => {
    if (kind === 'month') return { from: startOfMonthISO(anchor), to: endOfMonthISO(anchor) }
    const start = startOfWeekISO(anchor)
    return { from: start, to: addDaysISO(start, kind === 'week' ? 6 : 13) }
  }, [kind, anchor])
  const dates = useMemo(() => dateRange(from, to), [from, to])
  const assignments = useAssignmentsRange(from, to, journal)

  const shift = (dir: -1 | 1) => {
    setSlideDir(dir)
    setAnimKey((k) => k + 1)
    setAnchor((a) => (kind === 'month' ? addMonthsISO(a, dir) : addDaysISO(a, dir * (kind === 'week' ? 7 : 14))))
  }

  useEffect(() => {
    if (slideDir === 0) return
    const t = window.setTimeout(() => setSlideDir(0), 320)
    return () => window.clearTimeout(t)
  }, [animKey, slideDir])

  const index = useMemo(() => buildAssignmentIndex(assignments, from, to), [assignments, from, to])
  const dutyById = useMemo(() => new Map(dutyTypes.map((d) => [d.id, d])), [dutyTypes])
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const duties = useMemo(
    () => sortedDutyTypes(dutyTypes, isMyropil ? 'myropil' : 'duties'),
    [dutyTypes, isMyropil],
  )

  const stays = myropilStays ?? []
  const hasMyropilStays = stays.some((s) => s.from && s.to)

  const groups = useMemo(
    () => [...new Set(people.map((p) => p.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk')),
    [people],
  )
  const filterGroups = useMemo(() => {
    if (!isMyropil || !hasMyropilStays) return groups
    return groups.filter((g) => groupTouchesMyropil(g, dates, stays))
  }, [isMyropil, hasMyropilStays, groups, dates, stays])

  const rowTotals = useMemo(() => {
    const m = new Map<string, { count: number; points: number }>()
    const seen = new Set<string>()
    for (const list of index.byDate.values()) {
      for (const a of list) {
        if (seen.has(a.id)) continue
        seen.add(a.id)
        const id = effectiveRowsMode === 'people' ? a.personId : a.dutyTypeId
        const t = m.get(id) ?? { count: 0, points: 0 }
        t.count++
        t.points += a.points
        m.set(id, t)
      }
    }
    return m
  }, [index, effectiveRowsMode])

  const visiblePeople = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...people]
      .filter((p) => !group || p.group === group)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .filter((p) => !onlyBusy || (rowTotals.get(p.id)?.count ?? 0) > 0)
      // У журналі Миропіль — лише люди груп, що в періоді в межах видимих дат.
      .filter((p) => !isMyropil || (hasMyropilStays && groupTouchesMyropil(p.group, dates, stays)))
      .sort((a, b) => a.group.localeCompare(b.group, 'uk') || a.name.localeCompare(b.name, 'uk'))
  }, [people, group, search, onlyBusy, rowTotals, isMyropil, hasMyropilStays, dates, stays])

  /** Для журналу «Наряди»: блоки групи з rowspan/colspan поверх дат Мирополю. */
  const peopleMyropilMeta = useMemo(() => {
    if (!isDuties || !hasMyropilStays) return null
    const meta = visiblePeople.map((p, i) => {
      const mask = myropilCoveredMask(p.group, dates, stays)
      let runStart = i
      while (runStart > 0 && visiblePeople[runStart - 1].group === p.group) runStart--
      let runEnd = i
      while (runEnd + 1 < visiblePeople.length && visiblePeople[runEnd + 1].group === p.group) runEnd++
      const isLeader = i === runStart && mask.some(Boolean)
      const groupSize = runEnd - runStart + 1
      return { mask, isLeader, groupSize }
    })
    return meta
  }, [isDuties, hasMyropilStays, visiblePeople, dates, stays])

  /** У журналі Миропіль: маска днів, коли людина реально в Мирополі (інші дні — сірі). */
  const peopleMyropilActive = useMemo(() => {
    if (!isMyropil || !hasMyropilStays) return null
    return visiblePeople.map((p) => myropilCoveredMask(p.group, dates, stays))
  }, [isMyropil, hasMyropilStays, visiblePeople, dates, stays])

  const myropilDateFlags = useMemo(
    () => dates.map((d) => dateInAnyMyropilStay(d, stays)),
    [dates, stays],
  )

  const visibleDuties = useMemo(
    () => duties.filter((d) => !onlyBusy || (rowTotals.get(d.id)?.count ?? 0) > 0),
    [duties, onlyBusy, rowTotals],
  )

  const dayTotals = useMemo(() => {
    const m = new Map<ISODate, { count: number; points: number }>()
    const allowed = effectiveRowsMode === 'people' ? new Set(visiblePeople.map((p) => p.id)) : null
    for (const d of dates) {
      let count = 0
      let points = 0
      for (const a of index.byDate.get(d) ?? []) {
        if (a.date !== d) continue
        if (allowed && !allowed.has(a.personId)) continue
        count++
        points += a.points
      }
      m.set(d, { count, points })
    }
    return m
  }, [dates, index, visiblePeople, effectiveRowsMode])

  const dayDensity = useMemo(() => {
    const m = new Map<ISODate, number>()
    if (effectiveRowsMode === 'people') {
      for (const p of visiblePeople) {
        for (const d of dates) {
          const n = index.byPersonDate.get(key2(p.id, d))?.length ?? 0
          m.set(d, Math.max(m.get(d) ?? 0, n))
        }
      }
    } else {
      for (const duty of visibleDuties) {
        for (const d of dates) {
          const n = index.byDutyDate.get(key2(duty.id, d))?.length ?? 0
          m.set(d, Math.max(m.get(d) ?? 0, n))
        }
      }
    }
    return m
  }, [effectiveRowsMode, visiblePeople, visibleDuties, dates, index])

  const dayColWidth = (d: ISODate) => {
    const n = Math.max(1, dayDensity.get(d) ?? 0)
    const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
    const chip = isDutyJournal ? (narrow ? 2.0 : 2.4) : narrow ? 2.6 : 3.2
    return `${Math.max(narrow ? 2.15 : 2.6, n * chip)}rem`
  }

  const clearSelection = () => {
    setSelectedCells(new Map())
    selectAnchor.current = null
  }

  const collectSelectedAssignmentIds = useCallback(() => {
    const ids = new Set<string>()
    for (const cell of selectedCells.values()) {
      const list = index.byPersonDate.get(key2(cell.personId, cell.date))
      if (!list) continue
      for (const a of list) ids.add(a.id)
    }
    return [...ids]
  }, [selectedCells, index])

  const deleteSelectedAssignments = useCallback(() => {
    if (readOnly || selectedCells.size === 0) return
    const ids = collectSelectedAssignmentIds()
    if (ids.length === 0) {
      clearSelection()
      return
    }
    removeAssignments(ids)
    clearSelection()
  }, [readOnly, selectedCells.size, collectSelectedAssignmentIds, removeAssignments])

  useEffect(() => {
    setSelectedCells(new Map())
    selectAnchor.current = null
  }, [journal, from, to, effectiveRowsMode])

  useEffect(() => {
    if (selectedCells.size === 0 || readOnly) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        deleteSelectedAssignments()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedCells.size, readOnly, deleteSelectedAssignments])

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const selectedKeys = useMemo(() => new Set(selectedCells.keys()), [selectedCells])
  const selectedList = useMemo(() => [...selectedCells.values()], [selectedCells])
  const dragSelectRef = useRef<{
    active: boolean
    moved: boolean
    anchor: JournalCellRef
    additive: boolean
  } | null>(null)

  const applyRectSelection = useCallback(
    (a: JournalCellRef, b: JournalCellRef, additive: boolean) => {
      const rect = cellsInRect(a, b, visiblePeople, dates)
      setSelectedCells((prev) => {
        const next = additive ? new Map(prev) : new Map()
        for (const c of rect) next.set(cellKey(c), c)
        return next
      })
    },
    [visiblePeople, dates],
  )

  const onPersonCellMouseDown = useCallback(
    (personId: string, date: ISODate, e: MouseEvent) => {
      if (readOnly || effectiveRowsMode !== 'people') return
      if (e.button !== 0) return
      const ref: JournalCellRef = { personId, date }
      const key = cellKey(ref)

      // Не даємо браузеру робити своє виділення тексту / drag image
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        setSelectedCells((prev) => {
          const next = new Map(prev)
          if (next.has(key)) next.delete(key)
          else next.set(key, ref)
          return next
        })
        selectAnchor.current = ref
        dragSelectRef.current = null
        return
      }

      if (e.shiftKey && selectAnchor.current) {
        applyRectSelection(selectAnchor.current, ref, false)
        dragSelectRef.current = null
        return
      }

      selectAnchor.current = ref
      setSelectedCells(new Map([[key, ref]]))
      dragSelectRef.current = { active: true, moved: false, anchor: ref, additive: false }
    },
    [readOnly, effectiveRowsMode, applyRectSelection],
  )

  const onPersonCellMouseEnter = useCallback(
    (personId: string, date: ISODate) => {
      const drag = dragSelectRef.current
      if (!drag?.active) return
      drag.moved = true
      applyRectSelection(drag.anchor, { personId, date }, drag.additive)
    },
    [applyRectSelection],
  )

  const onPersonCellClick = useCallback(
    (personId: string, date: ISODate, e: MouseEvent) => {
      if (readOnly) return
      if (e.ctrlKey || e.metaKey || e.shiftKey) return
      const drag = dragSelectRef.current
      dragSelectRef.current = null
      // Після drag-виділення не відкриваємо редактор
      if (drag?.moved) return
      setCell({ personId, date })
    },
    [readOnly],
  )

  useEffect(() => {
    const endDrag = () => {
      if (dragSelectRef.current?.active) {
        dragSelectRef.current.active = false
      }
    }
    window.addEventListener('mouseup', endDrag)
    return () => window.removeEventListener('mouseup', endDrag)
  }, [])

  const rangeAssignments = useMemo(() => [...index.byDate.values()].flat(), [index])

  const title =
    kind === 'month' ? formatMonthTitle(from) : `${formatShort(from)} — ${formatShort(to)}`

  if (people.length === 0) {
    return (
      <div className="flex items-center justify-center p-6">
        <EmptyState title="Поки немає жодної людини">
          Журнал показує сітку «люди × дні». Додайте особовий склад на вкладці «Люди».
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col bg-canvas">
      {!effectiveGroup && (
        <p className="shrink-0 border-b border-tint-amber/30 bg-tint-amber/10 px-4 py-2 text-sm text-tint-amber">
          Оберіть робочу групу в «Налаштування → Канцелярія», щоб підтягнути види нарядів і правила цієї групи.
        </p>
      )}
      <div className="sticky top-12 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex flex-col gap-2 px-2 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:px-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Segmented
              value={journal}
              onChange={setJournal}
              options={JOURNAL_IDS.map((id) => [id, JOURNAL_META[id].short] as [JournalId, string])}
            />
            <div className="relative flex min-w-0 flex-1 items-center gap-0.5 sm:flex-none" ref={monthPickerRef}>
              <button className="btn-ghost btn-sm shrink-0" onClick={() => shift(-1)} aria-label="Назад">
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm min-w-0 flex-1 truncate capitalize sm:min-w-40 sm:flex-none"
                onClick={() => setMonthPickerOpen((v) => !v)}
                title="Обрати місяць"
              >
                {title}
              </button>
              <button className="btn-ghost btn-sm shrink-0" onClick={() => shift(1)} aria-label="Вперед">
                <ChevronRight size={18} />
              </button>
              {monthPickerOpen && (
                <div className="absolute top-full left-0 z-50 mt-1 w-[min(16rem,calc(100vw-1rem))] rounded-lg border border-border bg-surface p-3 shadow-xl shadow-black/30">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setPickerYear((y) => y - 1)}
                      aria-label="Попередній рік"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-sm font-semibold tabular-nums text-fg">{pickerYear}</span>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setPickerYear((y) => y + 1)}
                      aria-label="Наступний рік"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {MONTH_NAMES.map((name, i) => {
                      const active =
                        kind === 'month' &&
                        Number(anchor.slice(0, 4)) === pickerYear &&
                        Number(anchor.slice(5, 7)) === i + 1
                      return (
                        <button
                          key={name}
                          type="button"
                          className={clsx(
                            'rounded-md px-1.5 py-2 text-xs capitalize transition-colors',
                            active
                              ? 'bg-brand-600 text-white'
                              : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                          )}
                          onClick={() => pickMonth(pickerYear, i)}
                        >
                          {name}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm mt-2 w-full"
                    onClick={() => {
                      setAnchor(today)
                      setMonthPickerOpen(false)
                    }}
                  >
                    Сьогодні
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                ['week', 'Тижд.'],
                ['2weeks', '2 тиж.'],
                ['month', 'Міс.'],
              ]}
            />
            {isDutyJournal && (
              <Segmented
                value={rowsMode}
                onChange={setRowsMode}
                options={[
                  ['people', 'Люди'],
                  ['duties', 'Наряди'],
                ]}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {effectiveRowsMode === 'people' && (
              <>
                {filterGroups.length > 0 && !effectiveGroup && (
                  <select className="input w-full sm:w-36" value={group} onChange={(e) => setGroup(e.target.value)}>
                    <option value="">Усі групи</option>
                    {filterGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                )}
                {effectiveGroup && (
                  <span className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-fg-muted sm:text-sm">
                    {effectiveGroup}
                  </span>
                )}
                <input
                  className="input w-full sm:w-44"
                  placeholder="Пошук за ПІБ"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </>
            )}
            <Toggle
              checked={onlyBusy}
              onChange={setOnlyBusy}
              label={isDutyJournal ? 'З нарядами' : 'З записами'}
            />
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              <span className="text-xs text-fg-faint sm:text-sm">
                {rangeAssignments.length} зап.
                {showPoints ? ` · ${rangeAssignments.reduce((s, a) => s + a.points, 0)} б.` : ''}
              </span>
              {!readOnly && isDutyJournal && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => exportJournalXLSX(rangeAssignments, people, dutyTypes)}
                  disabled={rangeAssignments.length === 0}
                >
                  <Download size={14} /> <span className="hidden sm:inline">Excel</span>
                </button>
              )}
              {!readOnly && isDutyJournal && (
                <button className="btn-primary btn-sm flex-1 sm:flex-none" onClick={() => setManual({})}>
                  <Plus size={14} /> Записати
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {isMyropil && !hasMyropilStays && (
        <div className="border-b border-tint-amber/30 bg-tint-amber/10 px-3 py-2 text-sm text-tint-amber">
          Немає періодів Мирополю в налаштуваннях
        </div>
      )}

      <div className="flex w-full items-stretch gap-1 px-1 py-2 sm:gap-2 sm:px-2">
        <button
          type="button"
          className="hidden w-10 shrink-0 items-center justify-center self-stretch rounded-lg border border-border bg-surface text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg sm:flex"
          onClick={() => shift(-1)}
          aria-label="Попередній період"
          title="Назад"
        >
          <ChevronLeft size={28} strokeWidth={1.75} />
        </button>

        <div
          key={animKey}
          className={clsx(
            'table-scroll max-h-[calc(100dvh-11rem)] min-w-0 flex-1 rounded-lg border border-border bg-surface md:max-h-[calc(100vh-12rem)]',
            slideDir === 1 && 'journal-slide-next',
            slideDir === -1 && 'journal-slide-prev',
          )}
        >
          <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 min-w-24 max-w-[38vw] border-r border-b border-border bg-surface-2 px-1.5 py-2 text-left text-[10px] font-semibold tracking-wide text-fg-muted uppercase sm:min-w-40 sm:max-w-none sm:px-3 sm:text-xs md:min-w-56">
                    {effectiveRowsMode === 'people' ? 'ПІБ' : 'Наряд'}
                  </th>
                {dates.map((d, di) => {
                  const isToday = d === today
                  const wk = isWeekend(d)
                  const myroDay = myropilDateFlags[di]
                  return (
                    <th
                      key={d}
                      style={{ minWidth: dayColWidth(d), width: dayColWidth(d) }}
                      className={clsx(
                        'sticky top-0 z-20 border-b border-l border-border/60 px-0.5 py-1.5 text-center text-[10px] font-medium select-none sm:text-xs',
                        myroDay && !isToday && 'bg-tint-sky/25 text-tint-sky',
                        isToday
                          ? 'bg-brand-600/25 text-tint-brand'
                          : !myroDay && wk
                            ? 'bg-surface-3 text-tint-amber/80'
                            : !myroDay && 'bg-surface-2 text-fg-muted',
                      )}
                      title={myroDay ? `${formatHuman(d)} · Миропіль` : formatHuman(d)}
                    >
                      <div className="leading-tight">{weekdayShort(d)}</div>
                      <div className={clsx('text-xs leading-tight tabular-nums sm:text-sm', isToday && 'font-bold')}>
                        {dayOfMonth(d)}
                      </div>
                      {myroDay && <div className="text-[9px] font-semibold tracking-wide text-tint-sky">М</div>}
                    </th>
                  )
                })}
                <th className="sticky top-0 z-20 min-w-12 border-b border-l border-border bg-surface-2 px-1 py-1.5 text-center text-[10px] font-semibold tracking-wide text-fg-muted uppercase sm:min-w-20 sm:px-2 sm:text-xs">
                  <span className="sm:hidden">Σ</span>
                  <span className="hidden sm:inline">Разом</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {effectiveRowsMode === 'people'
                ? visiblePeople.map((p, pi) =>
                    isDutyJournal ? (
                      <PersonRow
                        key={p.id}
                        person={p}
                        dates={dates}
                        today={today}
                        index={index.byPersonDate}
                        dutyById={dutyById}
                        dayColWidth={dayColWidth}
                        total={rowTotals.get(p.id)}
                        onCellMouseDown={
                          readOnly ? undefined : (date, e) => onPersonCellMouseDown(p.id, date, e)
                        }
                        onCellMouseEnter={
                          readOnly ? undefined : (date) => onPersonCellMouseEnter(p.id, date)
                        }
                        onCellClick={
                          readOnly ? undefined : (date, e) => onPersonCellClick(p.id, date, e)
                        }
                        selectedKeys={selectedKeys}
                        myropilMask={peopleMyropilMeta?.[pi]?.mask}
                        myropilLeader={peopleMyropilMeta?.[pi]?.isLeader ?? false}
                        myropilGroupSize={peopleMyropilMeta?.[pi]?.groupSize ?? 1}
                        activeMask={peopleMyropilActive?.[pi]}
                      />
                    ) : (
                      <NotePersonRow
                        key={p.id}
                        person={p}
                        dates={dates}
                        today={today}
                        index={index.byPersonDate}
                        dayColWidth={dayColWidth}
                        total={rowTotals.get(p.id)}
                        journal={journal}
                        onCellMouseDown={
                          readOnly ? undefined : (date, e) => onPersonCellMouseDown(p.id, date, e)
                        }
                        onCellMouseEnter={
                          readOnly ? undefined : (date) => onPersonCellMouseEnter(p.id, date)
                        }
                        onCellClick={
                          readOnly ? undefined : (date, e) => onPersonCellClick(p.id, date, e)
                        }
                        selectedKeys={selectedKeys}
                      />
                    ),
                  )
                : visibleDuties.map((d) => (
                    <DutyRow
                      key={d.id}
                      duty={d}
                      dates={dates}
                      today={today}
                      index={index.byDutyDate}
                      personById={personById}
                      dayColWidth={dayColWidth}
                      total={rowTotals.get(d.id)}
                      onCell={
                        readOnly ? undefined : (date) => setManual({ date, dutyId: d.id })
                      }
                      readOnly={readOnly}
                    />
                  ))}
              {(effectiveRowsMode === 'people' ? visiblePeople : visibleDuties).length === 0 && (
                <tr>
                  <td colSpan={dates.length + 2} className="px-3 py-8 text-center text-fg-faint">
                    {isMyropil && !hasMyropilStays
                      ? 'Немає періодів Мирополю — додайте їх у Налаштуваннях'
                      : isMyropil
                        ? 'У видимому діапазоні немає груп з Мирополю'
                        : 'Нічого не знайдено за фільтрами'}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky bottom-0 left-0 z-30 border-t border-r border-border bg-surface-2 px-1.5 py-1.5 text-[10px] font-medium text-fg-muted sm:px-3 sm:text-xs">
                  Σ
                </td>
                {dates.map((d) => {
                  const t = dayTotals.get(d)
                  return (
                    <td
                      key={d}
                      className={clsx(
                        'sticky bottom-0 z-20 border-t border-l border-border/60 px-1 py-1.5 text-center text-xs tabular-nums',
                        d === today ? 'bg-brand-600/25 text-tint-brand' : 'bg-surface-2 text-fg-muted',
                      )}
                    >
                      {t && t.count > 0 ? (
                        <>
                          <div className="font-semibold text-fg">{t.count}</div>
                          {showPoints && <div className="text-fg-faint">{t.points}</div>}
                        </>
                      ) : (
                        <span className="text-fg-faint">·</span>
                      )}
                    </td>
                  )
                })}
                <td className="sticky bottom-0 z-20 border-t border-l border-border bg-surface-2 px-2 py-1.5 text-center text-xs tabular-nums text-fg-muted">
                  {rangeAssignments.length}
                  {showPoints ? ` / ${rangeAssignments.reduce((s, a) => s + a.points, 0)}` : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <button
          type="button"
          className="hidden w-10 shrink-0 items-center justify-center self-stretch rounded-lg border border-border bg-surface text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg sm:flex"
          onClick={() => shift(1)}
          aria-label="Наступний період"
          title="Вперед"
        >
          <ChevronRight size={28} strokeWidth={1.75} />
        </button>
      </div>

      {!readOnly && cell && (
        <CellEditor
          personId={cell.personId}
          date={cell.date}
          journalId={journal}
          onClose={() => setCell(null)}
          onOpenManual={
            isDutyJournal
              ? () => {
                  setManual({ date: cell.date })
                  setCell(null)
                }
              : undefined
          }
        />
      )}
      {!readOnly && isDutyJournal && (
        <ManualAssignModal
          open={manual !== null}
          onClose={() => setManual(null)}
          presetDate={manual?.date}
          presetDutyId={manual?.dutyId}
          journalId={journal === 'myropil' ? 'myropil' : 'duties'}
        />
      )}
      {!readOnly && isDutyJournal && (
        <BulkCellAssignModal
          open={bulkOpen}
          onClose={() => {
            setBulkOpen(false)
            clearSelection()
          }}
          cells={selectedList}
          peopleById={peopleById}
          journalId={journal === 'myropil' ? 'myropil' : 'duties'}
        />
      )}
      {!readOnly && selectedCells.size > 0 && effectiveRowsMode === 'people' && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[60] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-2 shadow-xl shadow-black/40 sm:bottom-4 sm:gap-2 sm:px-3 md:bottom-4">
          <span className="shrink-0 text-xs text-fg sm:text-sm">
            Виділено: <b>{selectedCells.size}</b>
          </span>
          <span className="hidden text-xs text-fg-faint sm:inline">
            тягни мишею · Ctrl+клік · Shift · Esc · Backspace
          </span>
          {isDutyJournal && (
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={selectedCells.size === 0}
              onClick={() => setBulkOpen(true)}
            >
              Призначити…
            </button>
          )}
          <button
            type="button"
            className="btn-danger btn-sm"
            onClick={deleteSelectedAssignments}
            title="Видалити призначення (Backspace)"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Видалити</span>
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={clearSelection} title="Зняти виділення">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

interface RowTotal {
  count: number
  points: number
}

/** Напис «МИРОПІЛЬ»: кут по діагоналі комірки + масштаб, щоб слово завжди вміщалось. */
function MyropilBannerLabel() {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const box = boxRef.current
    const text = textRef.current
    if (!box || !text) return

    const fit = () => {
      const w = box.clientWidth
      const h = box.clientHeight
      if (w < 2 || h < 2) return

      // Кут уздовж діагоналі (зверху-зліва → вниз-справа).
      const angleDeg = (Math.atan2(h, w) * 180) / Math.PI
      const diag = Math.sqrt(w * w + h * h)

      text.style.transform = 'none'
      text.style.fontSize = '16px'
      text.style.letterSpacing = '0.28em'
      const tw = Math.max(1, text.scrollWidth)
      const th = Math.max(1, text.scrollHeight)

      // Масштаб так, щоб після повороту bbox влізав у комірку з невеликим запасом.
      const rad = (angleDeg * Math.PI) / 180
      const cos = Math.abs(Math.cos(rad))
      const sin = Math.abs(Math.sin(rad))
      const pad = 0.88
      const scaleByBox = Math.min((w * pad) / (tw * cos + th * sin), (h * pad) / (tw * sin + th * cos))
      const scaleByDiag = (diag * 0.82) / tw
      const scale = Math.max(0.35, Math.min(scaleByBox, scaleByDiag, 3.2))

      text.style.transform = `rotate(${angleDeg}deg) scale(${scale})`
      text.style.transformOrigin = 'center center'
    }

    const ro = new ResizeObserver(() => fit())
    ro.observe(box)
    fit()
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <span
        ref={textRef}
        className="select-none whitespace-nowrap font-black uppercase text-[color:var(--c-myro-fg)]"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
      >
        МИРОПІЛЬ
      </span>
    </div>
  )
}

const PersonRow = memo(function PersonRow({
  person,
  dates,
  today,
  index,
  dutyById,
  dayColWidth,
  total,
  onCellMouseDown,
  onCellMouseEnter,
  onCellClick,
  selectedKeys,
  myropilMask,
  myropilLeader,
  myropilGroupSize,
  activeMask,
}: {
  person: Person
  dates: ISODate[]
  today: ISODate
  index: Map<string, Assignment[]>
  dutyById: Map<string, DutyType>
  dayColWidth: (d: ISODate) => string
  total: RowTotal | undefined
  onCellMouseDown?: (date: ISODate, e: MouseEvent) => void
  onCellMouseEnter?: (date: ISODate) => void
  onCellClick?: (date: ISODate, e: MouseEvent) => void
  selectedKeys?: Set<string>
  myropilMask?: boolean[]
  myropilLeader?: boolean
  myropilGroupSize?: number
  activeMask?: boolean[]
}) {
  const inactive = person.status !== 'active'
  const mask = myropilMask
  const dayCells: ReactNode[] = []
  for (let di = 0; di < dates.length; ) {
    const d = dates[di]
    if (mask?.[di]) {
      let len = 1
      while (di + len < dates.length && mask[di + len]) len++
      if (myropilLeader) {
        const spanDates = dates.slice(di, di + len)
        dayCells.push(
          <td
            key={`myro-${d}`}
            colSpan={len}
            rowSpan={myropilGroupSize ?? 1}
            title={`Миропіль · ${person.group || 'група'} · ${spanDates[0]}${len > 1 ? ` — ${spanDates[len - 1]}` : ''}`}
            className="myro-cell relative overflow-hidden border-b border-l border-tint-sky/50 p-0"
          >
            <MyropilBannerLabel />
            <div style={{ height: `${Math.max(1.75, (myropilGroupSize ?? 1) * 1.75)}rem` }} />
          </td>,
        )
      }
      di += len
      continue
    }

    const inScope = activeMask ? activeMask[di] !== false : true
    const list = index.get(key2(person.id, d))
    const isToday = d === today
    if (!inScope) {
      dayCells.push(
        <td
          key={d}
          style={{ minWidth: dayColWidth(d), width: dayColWidth(d) }}
          title="Поза періодом Мирополю"
          className="border-b border-l border-border/30 bg-surface-2/40 p-0 opacity-40"
        >
          <div className="flex h-7 w-full items-center justify-center text-[10px] text-fg-faint">·</div>
        </td>,
      )
      di += 1
      continue
    }

    // Багатоденний блок: зі старту або з першого видимого дня (перехід через місяць).
    const isSkipped = (i: number) => Boolean(mask?.[i]) || (activeMask ? activeMask[i] === false : false)
    const starting = (list ?? []).filter((a) => isAssignmentDrawDay(a, d, dates, di, isSkipped))
    if ((list?.length ?? 0) > 0 && starting.length === 0) {
      di += 1
      continue
    }
    const spanCover = starting.reduce((m, a) => Math.max(m, assignmentDaysLeftFrom(a, d)), 1)
    let colSpan = Math.min(spanCover, dates.length - di)
    for (let i = 1; i < colSpan; i++) {
      if (mask?.[di + i] || (activeMask && activeMask[di + i] === false)) {
        colSpan = i
        break
      }
    }

    // Ширину колонок задає thead; colspan без суми minWidth — інакше браузер роздуває дні.
    const selected = selectedKeys?.has(cellKey({ personId: person.id, date: d })) ?? false
    dayCells.push(
      <td
        key={d}
        colSpan={colSpan > 1 ? colSpan : undefined}
        onMouseDown={onCellMouseDown ? (e) => onCellMouseDown(d, e) : undefined}
        onMouseEnter={onCellMouseEnter ? () => onCellMouseEnter(d) : undefined}
        onClick={onCellClick ? (e) => onCellClick(d, e) : undefined}
        style={
          colSpan > 1
            ? undefined
            : { minWidth: dayColWidth(d), width: dayColWidth(d) }
        }
        className={clsx(
          'relative select-none border-b border-l border-border/40 p-0 transition-colors',
          (onCellMouseDown || onCellClick) && 'cursor-cell',
          isToday && !selected && 'bg-brand-600/10',
          !isToday && !selected && isWeekend(d) && 'bg-surface-2/50',
          activeMask && !selected && 'bg-tint-sky/5',
          d > today && !selected && 'opacity-80',
          selected && 'bg-brand-500/35 z-[1]',
        )}
      >
        {selected && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[2] box-border border-2 border-brand-400"
          />
        )}
        {starting.length > 0 ? (
          <div className="flex h-7 w-full flex-row">
            {starting.map((a) => {
              const duty = dutyById.get(a.dutyTypeId)
              const v = findVariant(duty, a.variantId)
              const span = assignmentSpanDays(a)
              const cont = a.date < d
              return (
                <span
                  key={a.id}
                  className="group/chip flex h-7 min-w-0 flex-1 items-center justify-center truncate px-0.5 text-center text-[11px] leading-none font-semibold text-white"
                  style={{ backgroundColor: duty?.color ?? '#475569', borderRadius: 0 }}
                  title={
                    (span > 1 ? `${span} дн.${cont ? ' (продовження)' : ''} · ` : '') +
                    dutyHoverTitle(duty, a.points, a.variantId, a.note)
                  }
                >
                  <span className="truncate">
                    {dutyShortLabel(duty)}
                    {v ? `/${v.short || v.name}` : ''}
                  </span>
                </span>
              )
            })}
          </div>
        ) : (
          <div className="flex h-7 w-full items-center justify-center text-fg-faint opacity-0 transition-opacity group-hover/row:opacity-40">
            <Plus size={12} />
          </div>
        )}
      </td>,
    )
    di += colSpan
  }

  return (
    <tr className="group/row">
      <td
        className={clsx(
          'sticky left-0 z-10 max-w-[38vw] border-r border-b border-border/60 bg-surface px-1.5 py-1 group-hover/row:bg-surface-2 sm:max-w-none sm:px-3',
          inactive && 'opacity-60',
        )}
      >
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <span className="truncate text-xs font-medium sm:text-sm">{person.name}</span>
          <span className="hidden sm:inline-flex">
            <PersonTags tags={person.tags} />
          </span>
          {person.group && <span className="ml-auto hidden shrink-0 text-[10px] text-fg-faint sm:inline">{person.group}</span>}
        </div>
      </td>
      {dayCells}
      <td className="border-b border-l border-border/60 px-2 py-1 text-center text-xs tabular-nums">
        {total ? (
          <>
            <span className="font-semibold text-fg">{total.count}</span>
            <span className="text-fg-faint"> / {total.points}</span>
          </>
        ) : (
          <span className="text-fg-faint">—</span>
        )}
      </td>
    </tr>
  )
})

const NOTE_COLORS: Record<JournalId, string> = {
  duties: '#475569',
  conduct: '#b91c1c',
  myropil: '#0369a1',
}

function conductColor(a: Assignment): string {
  if (isConductKind(a.dutyTypeId)) return CONDUCT_KIND_META[a.dutyTypeId].color
  return a.points < 0 ? CONDUCT_KIND_META.penalty.color : CONDUCT_KIND_META.reward.color
}

function HoverTip({
  text,
  children,
  className,
  style,
}: {
  text: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <span
      className={clsx('relative', className)}
      style={style}
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && text && (
        <span
          className="pointer-events-none fixed z-[100] max-w-xs rounded-md border border-border bg-surface-3 px-2 py-1 text-[11px] leading-snug text-fg shadow-lg"
          style={{ left: pos.x + 12, top: pos.y + 14 }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

function conductChipLabel(a: Assignment): string {
  const kind = isConductKind(a.dutyTypeId)
    ? a.dutyTypeId
    : a.points < 0
      ? 'penalty'
      : 'reward'
  if (a.points !== 0) return `${a.points > 0 ? '+' : ''}${a.points}`
  return CONDUCT_KIND_META[kind].short
}

const NotePersonRow = memo(function NotePersonRow({
  person,
  dates,
  today,
  index,
  dayColWidth,
  total,
  journal,
  onCellMouseDown,
  onCellMouseEnter,
  onCellClick,
  selectedKeys,
}: {
  person: Person
  dates: ISODate[]
  today: ISODate
  index: Map<string, Assignment[]>
  dayColWidth: (d: ISODate) => string
  total: RowTotal | undefined
  journal: JournalId
  onCellMouseDown?: (date: ISODate, e: MouseEvent) => void
  onCellMouseEnter?: (date: ISODate) => void
  onCellClick?: (date: ISODate, e: MouseEvent) => void
  selectedKeys?: Set<string>
}) {
  const inactive = person.status !== 'active'
  const isConduct = journal === 'conduct'
  return (
    <tr className="group/row">
      <td
        className={clsx(
          'sticky left-0 z-10 max-w-[38vw] border-r border-b border-border/60 bg-surface px-1.5 py-1 group-hover/row:bg-surface-2 sm:max-w-none sm:px-3',
          inactive && 'opacity-60',
        )}
      >
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <span className="truncate text-xs font-medium sm:text-sm">{person.name}</span>
          <span className="hidden sm:inline-flex">
            <PersonTags tags={person.tags} />
          </span>
          {person.group && <span className="ml-auto hidden shrink-0 text-[10px] text-fg-faint sm:inline">{person.group}</span>}
        </div>
      </td>
      {dates.map((d) => {
        const list = index.get(key2(person.id, d))
        const isToday = d === today
        const selected = selectedKeys?.has(cellKey({ personId: person.id, date: d })) ?? false
        return (
          <td
            key={d}
            onMouseDown={onCellMouseDown ? (e) => onCellMouseDown(d, e) : undefined}
            onMouseEnter={onCellMouseEnter ? () => onCellMouseEnter(d) : undefined}
            onClick={onCellClick ? (e) => onCellClick(d, e) : undefined}
            style={{ minWidth: dayColWidth(d), width: dayColWidth(d) }}
            className={clsx(
              'relative select-none border-b border-l border-border/40 p-0 transition-colors',
              (onCellMouseDown || onCellClick) && 'cursor-cell',
              isToday && !selected && 'bg-brand-600/10',
              !isToday && !selected && isWeekend(d) && 'bg-surface-2/50',
              d > today && !selected && 'opacity-80',
              selected && 'bg-brand-500/35 z-[1]',
            )}
          >
            {selected && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[2] box-border border-2 border-brand-400"
              />
            )}
            {list && list.length > 0 ? (
              <div className="flex h-7 w-full flex-row">
                {list.map((a) => {
                  const tip = isConduct
                    ? [
                        isConductKind(a.dutyTypeId)
                          ? CONDUCT_KIND_META[a.dutyTypeId].label
                          : JOURNAL_META.conduct.label,
                        a.points !== 0 ? `${a.points > 0 ? '+' : ''}${a.points} б.` : null,
                        a.note?.trim() || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : a.note || JOURNAL_META[journal].label
                  return (
                    <HoverTip
                      key={a.id}
                      text={tip}
                      className="flex h-7 min-w-0 flex-1 items-center justify-center truncate px-0.5 text-center text-[10px] leading-none font-medium text-white"
                      style={{
                        backgroundColor: isConduct ? conductColor(a) : NOTE_COLORS[journal],
                        borderRadius: 0,
                      }}
                    >
                      {isConduct ? conductChipLabel(a) : a.note?.trim() || '·'}
                    </HoverTip>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-7 w-full items-center justify-center text-fg-faint opacity-0 transition-opacity group-hover/row:opacity-40">
                <Plus size={12} />
              </div>
            )}
          </td>
        )
      })}
      <td className="border-b border-l border-border/60 px-2 py-1 text-center text-xs tabular-nums">
        {total ? (
          isConduct ? (
            <>
              <span className="font-semibold text-fg">{total.count}</span>
              <span className="text-fg-faint"> / {total.points}</span>
            </>
          ) : (
            <span className="font-semibold text-fg">{total.count}</span>
          )
        ) : (
          <span className="text-fg-faint">—</span>
        )}
      </td>
    </tr>
  )
})

const DutyRow = memo(function DutyRow({
  duty,
  dates,
  today,
  index,
  personById,
  dayColWidth,
  total,
  onCell,
  readOnly = false,
}: {
  duty: DutyType
  dates: ISODate[]
  today: ISODate
  index: Map<string, Assignment[]>
  personById: Map<string, Person>
  dayColWidth: (d: ISODate) => string
  total: RowTotal | undefined
  onCell?: (date: ISODate) => void
  readOnly?: boolean
}) {
  const removeAssignment = useStore((s) => s.removeAssignment)
  return (
    <tr className="group/row">
      <td className="sticky left-0 z-10 max-w-[38vw] border-r border-b border-border/60 bg-surface px-1.5 py-1 group-hover/row:bg-surface-2 sm:max-w-none sm:px-3">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <DutyBadge duty={duty} />
          <span className="ml-auto hidden shrink-0 text-[10px] text-fg-faint sm:inline">
            {duty.points} б. · {effectiveSlots(duty)} ос.
            {(duty.variants?.length ?? 0) > 0 ? ` · ${duty.variants.length} підп.` : ''}
          </span>
        </div>
      </td>
      {(() => {
        const dayCells: ReactNode[] = []
        for (let di = 0; di < dates.length; ) {
          const d = dates[di]
          const list = index.get(key2(duty.id, d))
          const isToday = d === today
          const starting = (list ?? []).filter((a) => isAssignmentDrawDay(a, d, dates, di))
          if ((list?.length ?? 0) > 0 && starting.length === 0) {
            di += 1
            continue
          }
          const spanCover = starting.reduce((m, a) => Math.max(m, assignmentDaysLeftFrom(a, d)), 1)
          const colSpan = Math.min(spanCover, dates.length - di)
          dayCells.push(
            <td
              key={d}
              colSpan={colSpan > 1 ? colSpan : undefined}
              style={
                colSpan > 1
                  ? undefined
                  : { minWidth: dayColWidth(d), width: dayColWidth(d) }
              }
              className={clsx(
                'border-b border-l border-border/40 p-0',
                isToday && 'bg-brand-600/10',
                !isToday && isWeekend(d) && 'bg-surface-2/50',
              )}
            >
              <div className="flex h-7 w-full flex-row">
                {starting.map((a) => {
                  const p = personById.get(a.personId)
                  const v = findVariant(duty, a.variantId)
                  const span = assignmentSpanDays(a)
                  const cont = a.date < d
                  return (
                    <span
                      key={a.id}
                      className="group/chip flex h-7 min-w-0 flex-1 items-center gap-0.5 border-l-2 bg-surface-3 px-1 text-[11px] leading-none"
                      style={{ borderLeftColor: duty.color, borderRadius: 0 }}
                      title={
                        (span > 1 ? `${span} дн.${cont ? ' (продовження)' : ''} · ` : '') +
                        dutyHoverTitle(duty, a.points, a.variantId)
                      }
                    >
                      <span className="truncate">
                        {surname(p?.name)}
                        {v && (
                          <span className="hidden text-fg-faint group-hover/chip:inline">
                            {' '}
                            · {v.short || v.name}
                          </span>
                        )}
                      </span>
                      {!readOnly && (
                        <button
                          className="ml-auto hidden shrink-0 text-fg-faint hover:text-tint-red group-hover/chip:inline"
                          onClick={() => removeAssignment(a.id)}
                          title="Видалити"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </span>
                  )
                })}
                {!readOnly && onCell && (
                  <button
                    className="flex h-7 w-5 shrink-0 items-center justify-center text-fg-faint opacity-0 transition-opacity hover:bg-surface-3 group-hover/row:opacity-60"
                    onClick={() => onCell(d)}
                    title="Додати людину"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            </td>,
          )
          di += colSpan
        }
        return dayCells
      })()}
      <td className="border-b border-l border-border/60 px-2 py-1 text-center text-xs tabular-nums">
        {total ? (
          <>
            <span className="font-semibold text-fg">{total.count}</span>
            <span className="text-fg-faint"> / {total.points}</span>
          </>
        ) : (
          <span className="text-fg-faint">—</span>
        )}
      </td>
    </tr>
  )
})

function surname(name?: string): string {
  if (!name) return '—'
  return name.split(/\s+/)[0]
}

function CellEditor({
  personId,
  date,
  journalId,
  onClose,
  onOpenManual,
}: {
  personId: string
  date: ISODate
  journalId: JournalId
  onClose: () => void
  onOpenManual?: () => void
}) {
  const person = useStore((s) => s.people.find((p) => p.id === personId))
  const dutyTypes = useStore((s) => s.dutyTypes)
  const weekendMultiplier = useStore((s) => s.settings.weekendMultiplier)
  const addAssignment = useStore((s) => s.addAssignment)
  const updateAssignment = useStore((s) => s.updateAssignment)
  const removeAssignment = useStore((s) => s.removeAssignment)
  const [noteDraft, setNoteDraft] = useState('')
  const [pointsDraft, setPointsDraft] = useState('1')
  const [conductKind, setConductKind] = useState<ConductKind>('penalty')
  /** Чернетка призначення: змінні лише для цього запису, не шаблону наряду. */
  const [draft, setDraft] = useState<{
    dutyId: string
    variantId: string | null
    spanDays: string
    points: string
    note: string
  } | null>(null)

  const isDuties = normalizeJournalId(journalId) === 'duties'
  const isMyropil = normalizeJournalId(journalId) === 'myropil'
  const isDutyJournal = isDuties || isMyropil
  const isConduct = normalizeJournalId(journalId) === 'conduct'
  const duties = useMemo(
    () => activeDutyTypes(dutyTypes, isMyropil ? 'myropil' : 'duties'),
    [dutyTypes, isMyropil],
  )
  const dutyById = useMemo(() => new Map(dutyTypes.map((d) => [d.id, d])), [dutyTypes])
  const list = usePersonDayAssignments(personId, date, journalId)

  if (!person) return null

  const beginDraft = (duty: DutyType, variantId: string | null = null) => {
    const base = dutyBasePoints(duty, variantId)
    setDraft({
      dutyId: duty.id,
      variantId,
      spanDays: String(Math.max(1, Math.floor(Number(duty.durationDays) || 1))),
      points: String(dutyPointsForDate(base, date, weekendMultiplier)),
      note: '',
    })
  }

  const commitDraft = () => {
    if (!draft) return
    const duty = dutyById.get(draft.dutyId)
    if (!duty) return
    addAssignment({
      journalId: isMyropil ? 'myropil' : 'duties',
      date,
      dutyTypeId: duty.id,
      personId,
      variantId: draft.variantId,
      points: Number(draft.points) || 0,
      note: draft.note.trim(),
      source: 'manual',
      spanDays: Math.max(1, Math.floor(Number(draft.spanDays) || 1)),
    })
    setDraft(null)
  }

  const addNote = () => {
    const text = noteDraft.trim()
    if (isConduct) {
      const pts = Math.abs(Number(pointsDraft) || 0)
      if (!text && pts === 0) return
      addAssignment({
        journalId: 'conduct',
        date,
        dutyTypeId: conductKind,
        personId,
        variantId: null,
        points: conductKind === 'penalty' ? -pts : pts,
        note: text,
        source: 'manual',
      })
      setNoteDraft('')
      setPointsDraft('1')
      setConductKind('penalty')
      return
    }
    if (!text) return
    addAssignment({
      journalId,
      date,
      dutyTypeId: '',
      personId,
      variantId: null,
      points: 0,
      note: text,
      source: 'manual',
    })
    setNoteDraft('')
  }

  const draftDuty = draft ? dutyById.get(draft.dutyId) : undefined
  const draftLeaves = draftDuty ? leafVariants(draftDuty.variants) : []

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {person.name}
          <PersonTags tags={person.tags} />
          <span className="text-sm font-normal text-fg-muted">
            · {JOURNAL_META[normalizeJournalId(journalId)].label} · {formatHuman(date)}
          </span>
        </span>
      }
      footer={
        <>
          {onOpenManual && (
            <button className="btn-ghost" onClick={onOpenManual}>
              Записати кількох людей…
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => {
              if (!isDutyJournal) {
                const text = noteDraft.trim()
                const pts = Math.abs(Number(pointsDraft) || 0)
                if (isConduct) {
                  const pointsChanged = pointsDraft.trim() !== '1'
                  if ((text || pointsChanged) && (text || pts > 0)) addNote()
                } else if (text) {
                  addNote()
                }
              }
              onClose()
            }}
          >
            Готово
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <span className="label">{isDutyJournal ? 'Наряди цього дня' : 'Записи цього дня'}</span>
          {list.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-sm text-fg-faint">
              Немає записів
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {list.map((a) => {
              if (isConduct) {
                const kind: ConductKind = isConductKind(a.dutyTypeId)
                  ? a.dutyTypeId
                  : a.points < 0
                    ? 'penalty'
                    : 'reward'
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 border border-border bg-surface-2 px-2 py-1.5">
                    <select
                      className="input w-36 py-0.5 text-xs"
                      value={kind}
                      onChange={(e) => {
                        const next = e.target.value as ConductKind
                        const abs = Math.abs(a.points)
                        updateAssignment(a.id, {
                          dutyTypeId: next,
                          points: next === 'penalty' ? -abs : abs,
                        })
                      }}
                    >
                      <option value="penalty">{CONDUCT_KIND_META.penalty.label}</option>
                      <option value="reward">{CONDUCT_KIND_META.reward.label}</option>
                    </select>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      className="input w-16 py-0.5 text-center"
                      value={Math.abs(a.points)}
                      title="Бали"
                      onChange={(e) => {
                        const abs = Math.abs(Number(e.target.value) || 0)
                        updateAssignment(a.id, {
                          points: kind === 'penalty' ? -abs : abs,
                        })
                      }}
                    />
                    <span className="w-6 shrink-0 text-center text-xs tabular-nums text-fg-faint">
                      {kind === 'penalty' ? '−' : '+'}
                    </span>
                    <input
                      className="input min-w-40 flex-1 py-0.5 text-xs"
                      placeholder="За що…"
                      value={a.note}
                      onChange={(e) => updateAssignment(a.id, { note: e.target.value })}
                    />
                    <button
                      className="btn-ghost btn-sm text-tint-red"
                      onClick={() => removeAssignment(a.id)}
                      title="Видалити"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              }
              if (!isDutyJournal) {
                return (
                  <div key={a.id} className="flex items-center gap-2 border border-border bg-surface-2 px-2 py-1.5">
                    <input
                      className="input flex-1 py-0.5 text-xs"
                      value={a.note}
                      onChange={(e) => updateAssignment(a.id, { note: e.target.value })}
                    />
                    <button
                      className="btn-ghost btn-sm text-tint-red"
                      onClick={() => removeAssignment(a.id)}
                      title="Видалити"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              }
              const duty = dutyById.get(a.dutyTypeId)
              const v = findVariant(duty, a.variantId)
              const leaves = duty ? leafVariants(duty.variants) : []
              return (
                <div
                  key={a.id}
                  className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <DutyBadge duty={duty} short />
                    {leaves.length > 0 ? (
                      <select
                        className="input w-28 py-0.5 text-xs"
                        value={a.variantId ?? ''}
                        title="Підпункт лише для цього запису"
                        onChange={(e) => {
                          const nextId = e.target.value || null
                          const nextPts = duty
                            ? dutyPointsForDate(dutyBasePoints(duty, nextId), a.date, weekendMultiplier)
                            : a.points
                          updateAssignment(a.id, { variantId: nextId, points: nextPts })
                        }}
                      >
                        {leaves.map((lv) => (
                          <option key={lv.id} value={lv.id}>
                            {lv.short || lv.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      v && <span className="badge bg-surface-3 text-fg-muted">{v.short || v.name}</span>
                    )}
                    <label className="flex items-center gap-1 text-[10px] text-fg-faint">
                      дн.
                      <input
                        type="number"
                        min={1}
                        className="input w-14 py-0.5 text-center text-xs"
                        value={a.spanDays ?? 1}
                        title="Тривалість лише цього призначення"
                        onChange={(e) =>
                          updateAssignment(a.id, {
                            spanDays: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-fg-faint">
                      б.
                      <input
                        type="number"
                        step="0.5"
                        className="input w-16 py-0.5 text-center text-xs"
                        value={a.points}
                        title="Бали лише цього призначення"
                        onChange={(e) => updateAssignment(a.id, { points: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <span className="text-[10px] text-fg-faint">{a.source === 'auto' ? 'авто' : 'вручну'}</span>
                    <button
                      className="btn-ghost btn-sm ml-auto text-tint-red"
                      onClick={() => removeAssignment(a.id)}
                      title="Видалити"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    className="input w-full py-0.5 text-xs"
                    placeholder="примітка (лише цей запис)"
                    value={a.note}
                    onChange={(e) => updateAssignment(a.id, { note: e.target.value })}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {isDutyJournal ? (
          <div className="flex flex-col gap-2">
            <span className="label">Додати наряд</span>
            {draft && draftDuty ? (
              <div className="flex flex-col gap-2 rounded-lg border border-brand-600/40 bg-brand-600/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DutyBadge duty={draftDuty} short />
                  {draftLeaves.length > 0 && (
                    <select
                      className="input w-32 py-1 text-xs"
                      value={draft.variantId ?? ''}
                      onChange={(e) => {
                        const variantId = e.target.value || null
                        const base = dutyBasePoints(draftDuty, variantId)
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                variantId,
                                points: String(dutyPointsForDate(base, date, weekendMultiplier)),
                              }
                            : d,
                        )
                      }}
                    >
                      {draftLeaves.map((lv) => (
                        <option key={lv.id} value={lv.id}>
                          {lv.short || lv.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="text-[10px] text-fg-faint">лише цей запис</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Field label="Днів">
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={draft.spanDays}
                      onChange={(e) => setDraft((d) => (d ? { ...d, spanDays: e.target.value } : d))}
                    />
                  </Field>
                  <Field label="Бали">
                    <input
                      type="number"
                      step="0.5"
                      className="input"
                      value={draftDuty.isMainDuty ? '0' : draft.points}
                      disabled={Boolean(draftDuty.isMainDuty)}
                      onChange={(e) => setDraft((d) => (d ? { ...d, points: e.target.value } : d))}
                    />
                  </Field>
                  <Field label="Примітка" className="col-span-2 sm:col-span-1">
                    <input
                      className="input"
                      value={draft.note}
                      placeholder="опційно"
                      onChange={(e) => setDraft((d) => (d ? { ...d, note: e.target.value } : d))}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary btn-sm" onClick={commitDraft}>
                    Поставити
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setDraft(null)}>
                    Скасувати
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] text-fg-faint">
                  Оберіть наряд — далі можна змінити дні / бали / підпункт тільки для цього призначення.
                </p>
                {duties.map((d) => {
                  const variants = leafVariants(d.variants)
                  if (variants.length === 0) {
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className="btn-secondary btn-sm w-fit"
                        onClick={() => beginDraft(d)}
                        title={`${d.name} · шаблон ${d.durationDays ?? 1} дн.`}
                      >
                        <span className="h-2.5 w-2.5" style={{ backgroundColor: d.color, borderRadius: 0 }} />
                        {d.short || d.name}
                        <span className="text-fg-faint">
                          {dutyPointsForDate(d.points, date, weekendMultiplier)} б. · {d.durationDays ?? 1} дн.
                        </span>
                      </button>
                    )
                  }
                  return (
                    <div key={d.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-fg-muted">{d.short || d.name}:</span>
                      {variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => beginDraft(d, v.id)}
                          title={`${d.name} › ${v.name}`}
                        >
                          {v.short || v.name}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : isConduct ? (
          <div className="flex flex-col gap-3">
            <span className="label">Новий запис</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={clsx(
                  'btn-sm rounded-md border px-3 py-1.5 text-sm font-medium',
                  conductKind === 'penalty'
                    ? 'border-tint-red/60 bg-tint-red/20 text-tint-red'
                    : 'border-border bg-surface-2 text-fg-muted hover:bg-surface-3',
                )}
                onClick={() => setConductKind('penalty')}
              >
                Стягнення (−)
              </button>
              <button
                type="button"
                className={clsx(
                  'btn-sm rounded-md border px-3 py-1.5 text-sm font-medium',
                  conductKind === 'reward'
                    ? 'border-tint-emerald/60 bg-tint-emerald/20 text-tint-emerald'
                    : 'border-border bg-surface-2 text-fg-muted hover:bg-surface-3',
                )}
                onClick={() => setConductKind('reward')}
              >
                Заохочення (+)
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[7rem_1fr]">
              <Field label={conductKind === 'penalty' ? 'Бали (−)' : 'Бали (+)'}>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  className="input text-center"
                  value={pointsDraft}
                  onChange={(e) => setPointsDraft(e.target.value)}
                />
              </Field>
              <Field label="За що">
                <input
                  className="input"
                  placeholder="Причина / підстава…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addNote()}
                />
              </Field>
            </div>
            <button
              className="btn-primary w-fit"
              onClick={addNote}
              disabled={!noteDraft.trim() && !(Number(pointsDraft) > 0)}
            >
              Додати {conductKind === 'penalty' ? 'стягнення' : 'заохочення'}
              {Number(pointsDraft) > 0
                ? ` (${conductKind === 'penalty' ? '−' : '+'}${Math.abs(Number(pointsDraft) || 0)} б.)`
                : ''}
            </button>
          </div>
        ) : (
          <div>
            <span className="label">Новий запис</span>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Текст запису…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNote()}
              />
              <button className="btn-primary" onClick={addNote} disabled={!noteDraft.trim()}>
                Додати
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
