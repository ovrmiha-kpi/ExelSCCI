import { useMemo, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Plus, Search } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import { computeStats, sortedDutyTypes, type PersonStats } from '../lib/stats'
import { addDaysISO, daysAgoLabel, formatShort, todayISO } from '../lib/dates'
import { exportRatingXLSX } from '../lib/export'
import { DutyBadge, EmptyState, StatusBadge, Toggle } from './ui'
import { ManualAssignModal } from './ManualAssignModal'
import { PersonDetailsModal } from './PersonDetailsModal'

type Period = 'all' | '7' | '30' | '90' | 'custom'

const col = createColumnHelper<PersonStats>()

export function RatingTable() {
  const people = useStore((s) => s.people)
  const dutyTypes = useStore((s) => s.dutyTypes)
  const assignments = useStore((s) => s.assignments)

  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const [mode, setMode] = useState<'count' | 'points'>('count')
  const [period, setPeriod] = useState<Period>('all')
  const [from, setFrom] = useState(addDaysISO(todayISO(), -30))
  const [to, setTo] = useState(todayISO())
  const [showArchived, setShowArchived] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'points', desc: false }])
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const [detailsFor, setDetailsFor] = useState<string | null>(null)

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
    () => sortedDutyTypes(dutyTypes).filter((d) => showArchived || !d.archived),
    [dutyTypes, showArchived],
  )

  const statsMap = useMemo(
    () => computeStats(people, assignments, periodFilter, today),
    [people, assignments, periodFilter, today],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...statsMap.values()].filter((s) => {
      if (q && !s.person.name.toLowerCase().includes(q) && !s.person.group.toLowerCase().includes(q)) return false
      if (group && s.person.group !== group) return false
      if (onlyActive && s.person.status !== 'active') return false
      return true
    })
  }, [statsMap, search, group, onlyActive])

  const columns = useMemo(
    () => [
      col.display({
        id: 'idx',
        header: '#',
        cell: (ctx) => (
          <span className="text-slate-400 tabular-nums">
            {ctx.table.getSortedRowModel().rows.findIndex((r) => r.id === ctx.row.id) + 1}
          </span>
        ),
        size: 40,
      }),
      col.accessor((r) => r.person.name, {
        id: 'name',
        header: 'ПІБ',
        cell: (ctx) => (
          <button
            className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
            onClick={() => setDetailsFor(ctx.row.original.person.id)}
          >
            {ctx.getValue()}
          </button>
        ),
        sortingFn: (a, b) => a.original.person.name.localeCompare(b.original.person.name, 'uk'),
      }),
      col.accessor((r) => r.person.group, {
        id: 'group',
        header: 'Група',
        cell: (ctx) => <span className="text-slate-600">{ctx.getValue() || '—'}</span>,
      }),
      col.accessor((r) => r.person.status, {
        id: 'status',
        header: 'Статус',
        cell: (ctx) => <StatusBadge status={ctx.getValue()} />,
      }),
      ...duties.map((d) =>
        col.accessor((r) => (mode === 'count' ? (r.countByDuty[d.id] ?? 0) : (r.pointsByDuty[d.id] ?? 0)), {
          id: `duty:${d.id}`,
          header: () => <DutyBadge duty={d} short />,
          cell: (ctx) => {
            const v = ctx.getValue()
            return (
              <span className={clsx('tabular-nums', v === 0 ? 'text-slate-300' : 'text-slate-800')}>
                {v}
              </span>
            )
          },
          meta: { align: 'center' },
        }),
      ),
      col.accessor((r) => r.count, {
        id: 'count',
        header: 'Всього',
        cell: (ctx) => <span className="tabular-nums font-medium">{ctx.getValue()}</span>,
        meta: { align: 'center' },
      }),
      col.accessor((r) => r.points, {
        id: 'points',
        header: 'Бали',
        cell: (ctx) => {
          const s = ctx.row.original
          return (
            <span className="inline-flex items-baseline gap-1 tabular-nums">
              <span className="rounded bg-brand-100 px-1.5 py-0.5 text-sm font-semibold text-brand-800">
                {ctx.getValue()}
              </span>
              {period === 'all' && s.person.basePoints !== 0 && (
                <span className="text-xs text-slate-400" title="у т.ч. початкові бали">
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
        cell: (ctx) => {
          const s = ctx.row.original
          if (!s.lastDate) return <span className="text-slate-400">—</span>
          const d = dutyTypes.find((x) => x.id === s.lastDutyTypeId)
          return (
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <span className="tabular-nums">{formatShort(s.lastDate)}</span>
              <DutyBadge duty={d} short />
            </span>
          )
        },
      }),
      col.accessor((r) => (r.daysSinceLast === null ? Number.POSITIVE_INFINITY : r.daysSinceLast), {
        id: 'rest',
        header: 'Відпочинок',
        cell: (ctx) => {
          const v = ctx.row.original.daysSinceLast
          if (v === null) return <span className="text-slate-400">не ходив</span>
          return (
            <span className={clsx('tabular-nums', v <= 1 ? 'text-amber-700' : 'text-slate-700')}>
              {daysAgoLabel(v)}
            </span>
          )
        },
      }),
      col.display({
        id: 'actions',
        header: '',
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
    ],
    [duties, mode, dutyTypes, period],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

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

  // Мінімальний рейтинг серед тих, хто у строю — підсвічуємо «наступних кандидатів».
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
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
          <input
            className="input w-56 pl-8"
            placeholder="Пошук за ПІБ / групою"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        {groups.length > 0 && (
          <select className="input w-40" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Усі групи</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5">
          {(
            [
              ['all', 'Весь час'],
              ['7', '7 дн.'],
              ['30', '30 дн.'],
              ['90', '90 дн.'],
              ['custom', 'Період'],
            ] as Array<[Period, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className={clsx(
                'rounded px-2 py-1 text-xs font-medium',
                period === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-1">
            <input type="date" className="input w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-400">—</span>
            <input type="date" className="input w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}

        <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5">
          {(
            [
              ['count', 'Кількість'],
              ['points', 'Бали'],
            ] as Array<['count' | 'points', string]>
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={clsx(
                'rounded px-2 py-1 text-xs font-medium',
                mode === k ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
              title="Що показувати в колонках за видами нарядів"
            >
              {label}
            </button>
          ))}
        </div>

        <Toggle checked={onlyActive} onChange={setOnlyActive} label="Тільки у строю" />
        {dutyTypes.some((d) => d.archived) && (
          <Toggle checked={showArchived} onChange={setShowArchived} label="Архівні наряди" />
        )}

        <div className="ml-auto flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => exportRatingXLSX(table.getRowModel().rows.map((r) => r.original), duties, mode)}
          >
            <Download size={14} /> Excel
          </button>
          <button className="btn-primary" onClick={() => setAssignFor('')}>
            <Plus size={14} /> Записати наряд
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="max-h-[calc(100vh-15rem)] overflow-auto">
          <table className="w-full border-collapse">
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
                        className={clsx('th', canSort && 'cursor-pointer hover:bg-slate-100', align === 'center' && 'text-center')}
                        onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {canSort &&
                            (dir === 'asc' ? (
                              <ArrowUp size={12} />
                            ) : dir === 'desc' ? (
                              <ArrowDown size={12} />
                            ) : (
                              <ArrowUpDown size={12} className="text-slate-300" />
                            ))}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const s = row.original
                const isCandidate =
                  lowestActive !== null && s.person.status === 'active' && s.points === lowestActive
                return (
                  <tr
                    key={row.id}
                    className={clsx(
                      'hover:bg-slate-50',
                      isCandidate && 'bg-brand-100/70 shadow-[inset_3px_0_0_0_var(--color-brand-500)] hover:bg-brand-100',
                      s.person.status !== 'active' && 'text-slate-400',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const align = (cell.column.columnDef.meta as { align?: string } | undefined)?.align
                      return (
                        <td key={cell.id} className={clsx('td', align === 'center' && 'text-center')}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="td py-8 text-center text-slate-500" colSpan={columns.length}>
                    Нічого не знайдено за заданими фільтрами
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-medium">
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
                    <span className="ml-1 text-xs font-normal text-slate-500">
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

      <p className="text-xs text-slate-500">
        Підсвічено людей з мінімальним рейтингом серед тих, хто у строю — саме їх автопризначення поставить першими.
        Клік по заголовку — сортування, клік по ПІБ — історія людини.
      </p>

      <ManualAssignModal
        open={assignFor !== null}
        onClose={() => setAssignFor(null)}
        presetPersonId={assignFor || undefined}
      />
      <PersonDetailsModal personId={detailsFor} onClose={() => setDetailsFor(null)} />
    </div>
  )
}
