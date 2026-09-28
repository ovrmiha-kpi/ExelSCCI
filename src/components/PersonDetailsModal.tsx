import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { computeStats, sortedDutyTypes } from '../lib/stats'
import { daysAgoLabel, formatHuman, pointsLabel, todayISO } from '../lib/dates'
import { DutyBadge, Modal, StatusBadge } from './ui'

export function PersonDetailsModal({ personId, onClose }: { personId: string | null; onClose: () => void }) {
  const people = useStore((s) => s.people)
  const dutyTypes = useStore((s) => s.dutyTypes)
  const assignments = useStore((s) => s.assignments)
  const removeAssignment = useStore((s) => s.removeAssignment)

  const person = people.find((p) => p.id === personId)
  const stats = useMemo(
    () => (person ? computeStats([person], assignments, {}, todayISO()).get(person.id) : undefined),
    [person, assignments],
  )
  const history = useMemo(
    () =>
      assignments
        .filter((a) => a.personId === personId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [assignments, personId],
  )
  const duties = useMemo(() => sortedDutyTypes(dutyTypes), [dutyTypes])
  const dutyById = useMemo(() => new Map(dutyTypes.map((d) => [d.id, d])), [dutyTypes])

  if (!person || !stats) return null

  return (
    <Modal open={!!personId} onClose={onClose} title={person.name} wide>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={person.status} />
        {person.group && <span className="badge bg-slate-100 text-slate-700">{person.group}</span>}
        <span className="badge bg-brand-100 text-brand-800">{pointsLabel(stats.points)}</span>
        <span className="text-slate-500">
          {stats.count} нарядів ·{' '}
          {stats.daysSinceLast === null ? 'ще не ходив' : `останній ${daysAgoLabel(stats.daysSinceLast)}`}
        </span>
        {person.basePoints !== 0 && (
          <span className="text-xs text-slate-500">початкові бали: {person.basePoints}</span>
        )}
      </div>
      {person.note && <p className="mt-2 text-sm text-slate-600">{person.note}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {duties
          .filter((d) => (stats.countByDuty[d.id] ?? 0) > 0)
          .map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1 text-sm">
              <DutyBadge duty={d} short />
              <span className="tabular-nums text-slate-700">
                ×{stats.countByDuty[d.id]} = {stats.pointsByDuty[d.id]} б.
              </span>
            </span>
          ))}
      </div>

      <div className="mt-4 max-h-96 overflow-y-auto rounded-md border border-slate-200">
        {history.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">Нарядів ще не було</p>}
        {history.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 border-b border-slate-100 px-3 py-1.5 text-sm last:border-b-0"
          >
            <span className="w-28 tabular-nums text-slate-600">{formatHuman(a.date)}</span>
            <DutyBadge duty={dutyById.get(a.dutyTypeId)} />
            <span className="tabular-nums text-slate-700">{a.points} б.</span>
            <span className="flex-1 truncate text-xs text-slate-500">{a.note}</span>
            <span className="text-xs text-slate-400">{a.source === 'auto' ? 'авто' : 'вручну'}</span>
            <button
              className="btn-ghost btn-sm text-red-600"
              title="Видалити запис"
              onClick={() => removeAssignment(a.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
