import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { sortedDutyTypes, statsFromRows } from '../lib/stats'
import { daysAgoLabel, formatHuman, pointsLabel, todayISO } from '../lib/dates'
import { DutyBadge, Modal, PersonTags, StatusBadge } from './ui'
import { usePersonAssignments } from '../lib/queries'

export function PersonDetailsModal({
  personId,
  onClose,
  readOnly = false,
}: {
  personId: string | null
  onClose: () => void
  readOnly?: boolean
}) {
  const people = useStore((s) => s.people)
  const dutyTypes = useStore((s) => s.dutyTypes)
  const removeAssignment = useStore((s) => s.removeAssignment)

  const person = people.find((p) => p.id === personId)
  const statRows = useStore((s) => s.stats)
  const stats = person ? statsFromRows([person], statRows, todayISO()).get(person.id) : undefined
  const history = usePersonAssignments(personId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  const duties = useMemo(() => sortedDutyTypes(dutyTypes), [dutyTypes])
  const dutyById = useMemo(() => new Map(dutyTypes.map((d) => [d.id, d])), [dutyTypes])

  if (!person || !stats) return null

  return (
    <Modal open={!!personId} onClose={onClose} title={person.name} wide>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={person.status} />
        <PersonTags tags={person.tags} />
        {person.group && <span className="badge bg-surface-3 text-fg-muted">{person.group}</span>}
        <span className="badge bg-brand-600/25 text-tint-brand">{pointsLabel(stats.points)}</span>
        <span className="text-fg-faint">
          {stats.count} нарядів ·{' '}
          {stats.daysSinceLast === null ? 'ще не ходив' : `останній ${daysAgoLabel(stats.daysSinceLast)}`}
        </span>
        {person.basePoints !== 0 && (
          <span className="text-xs text-fg-faint">початкові бали: {person.basePoints}</span>
        )}
      </div>
      {person.note && <p className="mt-2 text-sm text-fg-muted">{person.note}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {duties
          .filter((d) => (stats.countByDuty[d.id] ?? 0) > 0)
          .map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1 text-sm">
              <DutyBadge duty={d} short />
              <span className="tabular-nums text-fg-muted">
                ×{stats.countByDuty[d.id]} = {stats.pointsByDuty[d.id]} б.
              </span>
            </span>
          ))}
      </div>

      <div className="mt-4 max-h-96 overflow-y-auto rounded-md border border-border">
        {history.length === 0 && <p className="px-3 py-6 text-center text-sm text-fg-faint">Нарядів ще не було</p>}
        {history.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 border-b border-border/60 px-3 py-1.5 text-sm last:border-b-0"
          >
            <span className="w-28 tabular-nums text-fg-muted">{formatHuman(a.date)}</span>
            <DutyBadge duty={dutyById.get(a.dutyTypeId)} />
            <span className="tabular-nums text-fg-muted">{a.points} б.</span>
            <span className="flex-1 truncate text-xs text-fg-faint">{a.note}</span>
            <span className="text-xs text-fg-faint">{a.source === 'auto' ? 'авто' : 'вручну'}</span>
            {!readOnly && (
              <button
                className="btn-ghost btn-sm text-tint-red"
                title="Видалити запис"
                onClick={() => removeAssignment(a.id)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
