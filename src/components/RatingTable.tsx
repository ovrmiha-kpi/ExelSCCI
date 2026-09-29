import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnSizingState,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Plus, Search } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import { computeStats, sortedDutyTypes, statsFromRows, type PersonStats } from '../lib/stats'
import { addDaysISO, daysAgoLabel, formatShort, todayISO } from '../lib/dates'
import { exportRatingXLSX } from '../lib/export'
import { useAssignmentsRange } from '../lib/queries'
import { DutyBadge, EmptyState, PersonTags, Segmented, StatusBadge, Toggle } from './ui'
import { ManualAssignModal } from './ManualAssignModal'
import { PersonDetailsModal } from './PersonDetailsModal'
import { loadUiPrefs, saveUiPrefs, isPrefsISODate } from '../lib/uiPrefs'
import { filterByGroupLock } from '../lib/auth'
import { useEffectiveGroup } from '../lib/AuthContext'

type Period = 'all' | '7' | '30' | '90' | 'custom'

const col = createColumnHelper<PersonStats>()

const COL_SIZING_KEY = 'dutyrank:table:colSizing'
const ROW_HEIGHT_KEY = 'dutyrank:table:rowHeight'
const DEFAULT_ROW_HEIGHT = 36
const MIN_ROW_HEIGHT = 24
const MAX_ROW_HEIGHT = 96

function loadColSizing(): ColumnSizingState {
  try {
    const raw = localStorage.getItem(COL_SIZING_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ColumnSizingState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function loadRowHeight(): number {
  try {
    const n = Number(localStorage.getItem(ROW_HEIGHT_KEY))
    if (!Number.isFinite(n)) return DEFAULT_ROW_HEIGHT
    return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, n))
  } catch {
    return DEFAULT_ROW_HEIGHT
  }
}

export function RatingTable({ readOnly = false }: { readOnly?: boolean }) {
  const allPeople = useStore((s) => s.people)
  const effectiveGroup = useEffectiveGroup()
  const people = useMemo(() => filterByGroupLock(allPeople, effectiveGroup), [allPeople, effectiveGroup])
  const dutyTypes = useStore((s) => s.dutyTypes)
  const statRows = useStore((s) => s.stats)
  const prefs = loadUiPrefs(effectiveGroup)

  const [search, setSearchRaw] = useState(() => prefs.ratingSearch ?? '')
  const setSearch = (v: string) => {
    setSearchRaw(v)
    saveUiPrefs({ ratingSearch: v }, effectiveGroup)
  }
  const [group, setGroupRaw] = useState(() => effectiveGroup || prefs.ratingGroup || '')
  const setGroup = (g: string) => {
    if (effectiveGroup) return
    setGroupRaw(g)
    saveUiPrefs({ ratingGroup: g }, effectiveGroup)
  }
  const [onlyActive, setOnlyActiveRaw] = useState(() => prefs.ratingOnlyActive ?? false)
  const setOnlyActive = (v: boolean) => {
    setOnlyActiveRaw(v)
    saveUiPrefs({ ratingOnlyActive: v }, effectiveGroup)
  }
  const [mode, setModeRaw] = useState<'count' | 'points'>(() => prefs.ratingMode ?? 'count')
  const setMode = (m: 'count' | 'points') => {
    setModeRaw(m)
    saveUiPrefs({ ratingMode: m }, effectiveGroup)
  }
  const [period, setPeriodRaw] = useState<Period>(() => prefs.ratingPeriod ?? 'all')
  const setPeriod = (p: Period) => {
    setPeriodRaw(p)
    saveUiPrefs({ ratingPeriod: p }, effectiveGroup)
  }
  const [from, setFromRaw] = useState(() =>
    isPrefsISODate(prefs.ratingFrom) ? prefs.ratingFrom : addDaysISO(todayISO(), -30),
  )
  const setFrom = (v: string) => {
    setFromRaw(v)
    saveUiPrefs({ ratingFrom: v }, effectiveGroup)
  }
  const [to, setToRaw] = useState(() =>
    isPrefsISODate(prefs.ratingTo) ? prefs.ratingTo : todayISO(),
  )
  const setTo = (v: string) => {
    setToRaw(v)
    saveUiPrefs({ ratingTo: v }, effectiveGroup)
  }
  const [showArchived, setShowArchivedRaw] = useState(() => prefs.ratingShowArchived ?? false)
  const setShowArchived = (v: boolean) => {
    setShowArchivedRaw(v)
    saveUiPrefs({ ratingShowArchived: v }, effectiveGroup)
  }

  useEffect(() => {
    const p = loadUiPrefs(effectiveGroup)
    if (effectiveGroup) {
      setGroupRaw(effectiveGroup)
    } else {
      setGroupRaw(p.ratingGroup || '')
    }
    setOnlyActiveRaw(p.ratingOnlyActive ?? false)
    setModeRaw(p.ratingMode ?? 'count')
    setPeriodRaw(p.ratingPeriod ?? 'all')
    setShowArchivedRaw(p.ratingShowArchived ?? false)
    setSearchRaw(p.ratingSearch ?? '')
    if (isPrefsISODate(p.ratingFrom)) setFromRaw(p.ratingFrom)
    if (isPrefsISODate(p.ratingTo)) setToRaw(p.ratingTo)
  }, [effectiveGroup])
  const [sorting, setSorting] = useState<SortingState>([{ id: 'points', desc: false }])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(loadColSizing)
  const [rowHeight, setRowHeight] = useState(loadRowHeight)
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const [detailsFor, setDetailsFor] = useState<string | null>(null)
  const rowResizeRef = useRef<{ startY: number; startH: number } | null>(null)

  const today = todayISO()

  const periodFilter = useMemo(() => {
    if (period === 'all') return {}
    if (period === 'custom') return { from, to }
    return { from: addDaysISO(today, -Number(period) + 1), to: today }
  }, [period, from, to, today])

  const groups = useMemo(
    () => [...new Set(people.map((p) => p.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk')),
    [people],
  )

  const duties = useMemo(
    () => sortedDutyTypes(dutyTypes, 'duties').filter((d) => showArchived || !d.archived),
    [dutyTypes, showArchived],
  )

  const periodAssignments = useAssignmentsRange(periodFilter.from ?? '', periodFilter.to ?? '')

  const statsMap = useMemo(() => {
    if (!periodFilter.from && !periodFilter.to) return statsFromRows(people, statRows, today)
    const periodMap = computeStats(people, periodAssignments, periodFilter, today)
    const allTime = statsFromRows(people, statRows, today)
    for (const [id, s] of periodMap) {
      const full = allTime.get(id)
      if (!full) continue
      s.lastDate = full.lastDate
      s.lastDutyTypeId = full.lastDutyTypeId
      s.daysSinceLast = full.daysSinceLast
    }
    return periodMap
  }, [people, statRows, periodAssignments, periodFilter, today])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...statsMap.values()].filter((s) => {
      if (q && !s.person.name.toLowerCase().includes(q) && !s.person.group.toLowerCase().includes(q)) return false
      if (group && s.person.group !== group) return false
      if (onlyActive && s.person.status !== 'active') return false
      return true
    })
  }, [statsMap, search, group, onlyActive])

  const columns = useMemo(() => {
    const base = [
      col.display({
        id: 'idx',
        header: '#',
        size: 44,
        minSize: 36,
        cell: (ctx) => (
          <span className="text-fg-faint tabular-nums">
            {ctx.table.getSortedRowModel().rows.findIndex((r) => r.id === ctx.row.id) + 1}
          </span>
        ),
      }),
      col.accessor((r) => r.person.name, {
        id: 'name',
        header: 'ПІБ',
        size: 200,
        minSize: 100,
        cell: (ctx) => (
          <span className="inline-flex items-center gap-1.5">
            <button
              className="font-medium text-fg hover:text-brand-300 hover:underline"
              onClick={() => setDetailsFor(ctx.row.original.person.id)}
            >
              {ctx.getValue()}
            </button>
            <PersonTags tags={ctx.row.original.person.tags} />
          </span>
        ),
        sortingFn: (a, b) => a.original.person.name.localeCompare(b.original.person.name, 'uk'),
      }),
      col.accessor((r) => r.person.group, {
        id: 'group',
        header: 'Група',
        size: 100,
        minSize: 60,
        cell: (ctx) => <span className="text-fg-muted">{ctx.getValue() || '—'}</span>,
      }),
      col.accessor((r) => r.person.status, {
        id: 'status',
        header: 'Статус',
        size: 100,
        minSize: 70,
        cell: (ctx) => <StatusBadge status={ctx.getValue()} />,
      }),
      ...duties.map((d) =>
        col.accessor((r) => (mode === 'count' ? (r.countByDuty[d.id] ?? 0) : (r.pointsByDuty[d.id] ?? 0)), {
          id: `duty:${d.id}`,
          header: () => <DutyBadge duty={d} short />,
          size: 72,
          minSize: 48,
          cell: (ctx) => {
            const v = ctx.getValue()
            return <span className={clsx('tabular-nums', v === 0 ? 'text-fg-faint/60' : 'text-fg')}>{v}</span>
          },
          meta: { align: 'center' },
        }),
      ),
      col.accessor((r) => r.count, {
        id: 'count',
        header: 'Всього',
        size: 72,
        minSize: 56,
        cell: (ctx) => <span className="tabular-nums font-medium">{ctx.getValue()}</span>,
        meta: { align: 'center' },
      }),
      col.accessor((r) => r.points, {
        id: 'points',
        header: 'Бали',
        size: 110,
        minSize: 70,
        cell: (ctx) => {
          const s = ctx.row.original
          return (
            <span className="inline-flex items-baseline gap-1 tabular-nums">
              <span className="rounded bg-brand-600/25 px-1.5 py-0.5 text-sm font-semibold text-tint-brand">
                {ctx.getValue()}
              </span>
              {period === 'all' && s.person.basePoints !== 0 && (
                <span className="text-xs text-fg-faint" title="у т.ч. початкові бали">
                  (+{s.person.basePoints})
                </span>
              )}
            </span>
          )
        },
        meta: { align: 'center' },
      }),
      col.accessor((r) => r.lastDate ?? '', {
        id: 'last',
        header: 'Останній',
        size: 140,
        minSize: 90,
        cell: (ctx) => {
          const s = ctx.row.original
          if (!s.lastDate) return <span className="text-fg-faint">—</span>
          const d = dutyTypes.find((x) => x.id === s.lastDutyTypeId)
          return (
            <span className="inline-flex items-center gap-1.5 text-fg-muted">
              <span className="tabular-nums">{formatShort(s.lastDate)}</span>
              <DutyBadge duty={d} short />
            </span>
          )
        },
      }),
      col.accessor((r) => (r.daysSinceLast === null ? Number.POSITIVE_INFINITY : r.daysSinceLast), {
        id: 'rest',
        header: 'Відпочинок',
        size: 110,
        minSize: 80,
        cell: (ctx) => {
          const v = ctx.row.original.daysSinceLast
          if (v === null) return <span className="text-fg-faint">не ходив</span>
          return (
            <span className={clsx('tabular-nums', v <= 1 ? 'text-tint-amber' : 'text-fg-muted')}>{daysAgoLabel(v)}</span>
          )
        },
      }),
      col.display({
        id: 'actions',
        header: '',
        size: 90,
        minSize: 70,
        enableResizing: false,
        cell: (ctx) => (
          <button
            className="btn-ghost btn-sm"
            title="Записати наряд цій людині"
            onClick={() => setAssignFor(ctx.row.original.person.id)}
          >
            <Plus size={14} /> наряд
          </button>
        ),
      }),
    ]
    return readOnly ? base.filter((c) => !('id' in c && c.id === 'actions')) : base
  }, [duties, mode, dutyTypes, period, readOnly])

  useEffect(() => {
    try {
      localStorage.setItem(COL_SIZING_KEY, JSON.stringify(columnSizing))
    } catch {
      /* ignore */
    }
  }, [columnSizing])

  useEffect(() => {
    try {
      localStorage.setItem(ROW_HEIGHT_KEY, String(rowHeight))
    } catch {
      /* ignore */
    }
  }, [rowHeight])

  const onRowHeightPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startH = rowHeight
    rowResizeRef.current = { startY, startH }
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY
      setRowHeight(Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, startH + dy)))
    }
    const onUp = () => {
      rowResizeRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [rowHeight])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    defaultColumn: {
      minSize: 48,
      size: 100,
      maxSize: 480,
    },
  })

  const tableWidth = table.getCenterTotalSize()

  const totals = useMemo(() => {
    const t = { count: 0, points: 0, byDuty: {} as Record<string, number> }
    for (const r of rows) {
      t.count += r.count
      t.points += r.points
      for (const d of duties) {
        t.byDuty[d.id] =
          (t.byDuty[d.id] ?? 0) + (mode === 'count' ? (r.countByDuty[d.id] ?? 0) : (r.pointsByDuty[d.id] ?? 0))
      }
    }
    return t
  }, [rows, duties, mode])

  // Мінімальний рейтинг серед тих, хто в наявності — підсвічуємо «наступних кандидатів».
  const lowestActive = useMemo(() => {
    const act = rows.filter((r) => r.person.status === 'active').map((r) => r.points)
    return act.length ? Math.min(...act) : null
  }, [rows])

  if (people.length === 0) {
    return (
      <EmptyState title="Поки немає жодної людини">
        Додайте особовий склад на вкладці «Люди» або завантажте демо-дані в розділі «Налаштування».
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {!effectiveGroup && (
        <p className="alert-warn px-3 py-2 text-sm">
          Оберіть робочу групу в «Налаштування → Канцелярія», щоб бачити види нарядів цієї групи.
        </p>
      )}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-faint" />
          <input
            className="input w-56 pl-8"
            placeholder="Пошук за ПІБ / групою"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        {groups.length > 0 && !effectiveGroup && (
          <select className="input w-40" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Усі групи</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        {effectiveGroup && (
          <span className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-fg-muted">
            Група: {effectiveGroup}
          </span>
        )}

        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            ['all', 'Весь час'],
            ['7', '7 дн.'],
            ['30', '30 дн.'],
            ['90', '90 дн.'],
            ['custom', 'Період'],
          ]}
        />
        {period === 'custom' && (
          <div className="flex items-center gap-1">
            <input type="date" className="input w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-fg-faint">—</span>
            <input type="date" className="input w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            ['count', 'Кількість'],
            ['points', 'Бали'],
          ]}
          title="Що показувати в колонках за видами нарядів"
        />

        <Toggle checked={onlyActive} onChange={setOnlyActive} label="Тільки в наявності" />
        {dutyTypes.some((d) => d.archived) && (
          <Toggle checked={showArchived} onChange={setShowArchived} label="Архівні наряди" />
        )}

        <div className="ml-auto flex gap-2">
          {!readOnly && (
            <>
              <button
                className="btn-secondary"
                onClick={() =>
                  exportRatingXLSX(
                    table.getRowModel().rows.map((r) => r.original),
                    duties,
                    mode,
                  )
                }
              >
                <Download size={14} /> Excel
              </button>
              <button className="btn-primary" onClick={() => setAssignFor('')}>
                <Plus size={14} /> Записати наряд
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="max-h-[calc(100vh-15rem)] overflow-auto">
          <table className="border-collapse" style={{ width: tableWidth, tableLayout: 'fixed' }}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const canSort = h.column.getCanSort()
                    const dir = h.column.getIsSorted()
                    const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align
                    return (
                      <th
                        key={h.id}
                        style={{ width: h.getSize(), position: 'relative' }}
                        className={clsx(
                          'th select-none',
                          canSort && 'cursor-pointer hover:bg-surface-3',
                          align === 'center' && 'text-center',
                        )}
                        onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      >
                        <span className="inline-flex items-center gap-1 truncate">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {canSort &&
                            (dir === 'asc' ? (
                              <ArrowUp size={12} className="shrink-0" />
                            ) : dir === 'desc' ? (
                              <ArrowDown size={12} className="shrink-0" />
                            ) : (
                              <ArrowUpDown size={12} className="shrink-0 text-fg-faint/50" />
                            ))}
                        </span>
                        {h.column.getCanResize() && (
                          <div
                            onMouseDown={h.getResizeHandler()}
                            onTouchStart={h.getResizeHandler()}
                            onClick={(e) => e.stopPropagation()}
                            className={clsx(
                              'absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none',
                              'hover:bg-brand-500/50',
                              h.column.getIsResizing() && 'bg-brand-500',
                            )}
                            title="Змінити ширину колонки"
                          />
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <td colSpan={columns.length} className="relative h-0 border-0 p-0">
                  <div
                    onPointerDown={onRowHeightPointerDown}
                    className="absolute inset-x-0 -bottom-1 z-20 h-2 cursor-row-resize touch-none hover:bg-brand-500/40"
                    title="Змінити висоту рядків"
                  />
                </td>
              </tr>
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const s = row.original
                const isCandidate = lowestActive !== null && s.person.status === 'active' && s.points === lowestActive
                return (
                  <tr
                    key={row.id}
                    style={{ height: rowHeight }}
                    className={clsx(
                      'hover:bg-surface-2',
                      isCandidate && 'bg-brand-600/10 shadow-[inset_3px_0_0_0_var(--color-brand-500)] hover:bg-brand-600/15',
                      s.person.status !== 'active' && 'text-fg-faint',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const align = (cell.column.columnDef.meta as { align?: string } | undefined)?.align
                      return (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className={clsx('td overflow-hidden', align === 'center' && 'text-center')}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="td py-8 text-center text-fg-faint" colSpan={columns.length}>
                    Нічого не знайдено за заданими фільтрами
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-medium" style={{ height: rowHeight }}>
                <td className="td" colSpan={4}>
                  Разом: {rows.length} осіб
                </td>
                {duties.map((d) => (
                  <td key={d.id} className="td text-center tabular-nums">
                    {totals.byDuty[d.id] ?? 0}
                  </td>
                ))}
                <td className="td text-center tabular-nums">{totals.count}</td>
                <td className="td text-center tabular-nums">
                  {totals.points}
                  {rows.length > 0 && (
                    <span className="ml-1 text-xs font-normal text-fg-faint">
                      (сер. {(totals.points / rows.length).toFixed(1)})
                    </span>
                  )}
                </td>
                <td className="td" colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {!readOnly && (
        <ManualAssignModal
          open={assignFor !== null}
          onClose={() => setAssignFor(null)}
          presetPersonId={assignFor || undefined}
        />
      )}
      <PersonDetailsModal personId={detailsFor} onClose={() => setDetailsFor(null)} readOnly={readOnly} />
    </div>
  )
}
