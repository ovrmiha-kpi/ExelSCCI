import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useStore } from '../store'
import { activeDutyTypes, computeStats } from '../lib/stats'
import { todayISO } from '../lib/dates'
import { uid } from '../lib/id'
import { Field, Modal, StatusBadge } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  presetPersonId?: string
  presetDate?: string
}

/** Обёртка: форма монтируется заново при каждом открытии, поэтому состояние всегда свежее. */
export function ManualAssignModal(props: Props) {
  if (!props.open) return null
  return <ManualAssignForm {...props} />
}

function ManualAssignForm({ open, onClose, presetPersonId, presetDate }: Props) {
  const people = useStore((s) => s.people)
  const dutyTypes = useStore((s) => s.dutyTypes)
  const assignments = useStore((s) => s.assignments)
  const addAssignments = useStore((s) => s.addAssignments)

  const duties = useMemo(() => activeDutyTypes(dutyTypes), [dutyTypes])
  const [date, setDate] = useState(presetDate ?? todayISO())
  const [dutyId, setDutyId] = useState(duties[0]?.id ?? '')
  const [points, setPoints] = useState<string>(String(duties[0]?.points ?? 1))
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(presetPersonId ? [presetPersonId] : []))
  const [search, setSearch] = useState('')

  const stats = useMemo(() => computeStats(people, assignments, {}, todayISO()), [people, assignments])

  const busyToday = useMemo(() => {
    const set = new Set<string>()
    for (const a of assignments) if (a.date === date) set.add(a.personId)
    return set
  }, [assignments, date])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...people]
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.group.toLowerCase().includes(q))
      .sort((a, b) => (stats.get(a.id)?.points ?? 0) - (stats.get(b.id)?.points ?? 0))
  }, [people, search, stats])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = () => {
    if (!dutyId || selected.size === 0) return
    const pts = Number(points) || 0
    const now = Date.now()
    addAssignments(
      [...selected].map((personId) => ({
        id: uid(),
        date,
        dutyTypeId: dutyId,
        personId,
        points: pts,
        note: note.trim(),
        source: 'manual' as const,
        createdAt: now,
      })),
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Записать наряд вручную"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="btn-primary" onClick={submit} disabled={!dutyId || selected.size === 0}>
            Записать {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Дата">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Вид наряда">
          <select
            className="input"
            value={dutyId}
            onChange={(e) => {
              setDutyId(e.target.value)
              const d = duties.find((x) => x.id === e.target.value)
              if (d) setPoints(String(d.points))
            }}
          >
            {duties.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.points} б.
              </option>
            ))}
          </select>
        </Field>
        <Field label="Баллы">
          <input
            type="number"
            className="input"
            value={points}
            step="0.5"
            onChange={(e) => setPoints(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Заметка (необязательно)" className="mt-3">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр. замена за Петрова" />
      </Field>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="label mb-0">Кто идёт (отсортировано по рейтингу, меньше — выше)</span>
          <input
            className="input w-40 py-1 text-xs"
            placeholder="поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
          {list.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-500">Никого не найдено</p>
          )}
          {list.map((p) => {
            const s = stats.get(p.id)
            const busy = busyToday.has(p.id)
            const checked = selected.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={clsx(
                  'flex w-full items-center gap-3 border-b border-slate-100 px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-slate-50',
                  checked && 'bg-brand-50',
                )}
              >
                <input type="checkbox" readOnly checked={checked} className="pointer-events-none accent-brand-600" />
                <span className="flex-1 truncate">
                  {p.name}
                  {p.group && <span className="ml-2 text-xs text-slate-500">{p.group}</span>}
                </span>
                {busy && <span className="badge bg-amber-100 text-amber-800">уже в наряде</span>}
                {p.status !== 'active' && <StatusBadge status={p.status} />}
                <span className="w-14 text-right tabular-nums text-slate-600">{s?.points ?? 0} б.</span>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
