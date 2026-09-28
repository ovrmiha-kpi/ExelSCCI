import { useMemo, useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { sortedDutyTypes } from '../lib/stats'
import { addDaysISO, formatHuman, todayISO } from '../lib/dates'
import { exportJournalXLSX } from '../lib/export'
import { DutyBadge, EmptyState } from './ui'
import { ManualAssignModal } from './ManualAssignModal'

export function HistoryPage() {
  const people = useStore((s) => s.people)
  const dutyTypes = useStore((s) => s.dutyTypes)
  const assignments = useStore((s) => s.assignments)
  const removeAssignment = useStore((s) => s.removeAssignment)
  const removeAssignmentsByDate = useStore((s) => s.removeAssignmentsByDate)
  const updateAssignment = useStore((s) => s.updateAssignment)

  const [from, setFrom] = useState(addDaysISO(todayISO(), -14))
  const [to, setTo] = useState(addDaysISO(todayISO(), 14))
  const [dutyId, setDutyId] = useState('')
  const [personId, setPersonId] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const dutyById = useMemo(() => new Map(dutyTypes.map((d) => [d.id, d])), [dutyTypes])
  const duties = useMemo(() => sortedDutyTypes(dutyTypes), [dutyTypes])

  const filtered = useMemo(
    () =>
      assignments
        .filter((a) => (!from || a.date >= from) && (!to || a.date <= to))
        .filter((a) => !dutyId || a.dutyTypeId === dutyId)
        .filter((a) => !personId || a.personId === personId)
        .sort((a, b) => b.date.localeCompare(a.date) || a.createdAt - b.createdAt),
    [assignments, from, to, dutyId, personId],
  )

  const byDate = useMemo(() => {
    const m = new Map<string, typeof filtered>()
    for (const a of filtered) m.set(a.date, [...(m.get(a.date) ?? []), a])
    return [...m.entries()]
  }, [filtered])

  const today = todayISO()

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div className="flex items-center gap-1">
          <input type="date" className="input w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-400">—</span>
          <input type="date" className="input w-36" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <select className="input w-44" value={dutyId} onChange={(e) => setDutyId(e.target.value)}>
          <option value="">Усі наряди</option>
          {duties.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className="input w-48" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Усі люди</option>
          {[...people]
            .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <span className="text-sm text-slate-500">
          {filtered.length} записів · {filtered.reduce((s, a) => s + a.points, 0)} б.
        </span>
        <div className="ml-auto flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => exportJournalXLSX(filtered, people, dutyTypes)}
            disabled={filtered.length === 0}
          >
            <Download size={14} /> Excel
          </button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Записати
          </button>
        </div>
      </div>

      {byDate.length === 0 && (
        <EmptyState title="Записів за цей період немає">Змініть фільтри або додайте наряд вручну.</EmptyState>
      )}

      {byDate.map(([date, list]) => (
        <div key={date} className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
            <h3 className="text-sm font-semibold capitalize">{formatHuman(date)}</h3>
            {date === today && <span className="badge bg-brand-100 text-brand-800">сьогодні</span>}
            {date > today && <span className="badge bg-sky-100 text-sky-800">план</span>}
            <span className="text-xs text-slate-500">
              {list.length} осіб · {list.reduce((s, a) => s + a.points, 0)} б.
            </span>
            <button
              className="btn-ghost btn-sm ml-auto text-red-600"
              onClick={() => {
                if (confirm(`Видалити всі ${list.length} записів за ${formatHuman(date)}?`)) removeAssignmentsByDate(date)
              }}
            >
              <Trash2 size={14} /> весь день
            </button>
          </div>
          <div>
            {list.map((a) => {
              const p = personById.get(a.personId)
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-1.5 text-sm last:border-b-0 sm:flex-nowrap"
                >
                  <div className="w-40 shrink-0">
                    <DutyBadge duty={dutyById.get(a.dutyTypeId)} />
                  </div>
                  <span className="w-56 truncate font-medium">{p?.name ?? '— видалено —'}</span>
                  <span className="w-24 truncate text-xs text-slate-500">{p?.group}</span>
                  <input
                    type="number"
                    step="0.5"
                    className="input w-16 py-0.5 text-center"
                    value={a.points}
                    onChange={(e) => updateAssignment(a.id, { points: Number(e.target.value) || 0 })}
                    title="Бали за цей запис"
                  />
                  <input
                    className="input flex-1 py-0.5 text-xs"
                    placeholder="примітка"
                    value={a.note}
                    onChange={(e) => updateAssignment(a.id, { note: e.target.value })}
                  />
                  <span className="text-xs text-slate-400">{a.source === 'auto' ? 'авто' : 'вручну'}</span>
                  <button className="btn-ghost btn-sm text-red-600" onClick={() => removeAssignment(a.id)} title="Видалити">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <ManualAssignModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
