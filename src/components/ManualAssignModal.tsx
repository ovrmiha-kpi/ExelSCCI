import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useStore } from '../store'
import { activeDutyTypes, statsFromRows } from '../lib/stats'
import { dutyPointsForDate, isWeekend, todayISO } from '../lib/dates'
import { dutyBasePoints } from '../lib/defaults'
import { uid } from '../lib/id'
import { useAssignmentsOnDate } from '../lib/queries'
import { Field, Modal, PersonTags, StatusBadge } from './ui'
import { filterByGroupLock } from '../lib/auth'
import { useEffectiveGroup } from '../lib/AuthContext'

interface Props {
  open: boolean
  onClose: () => void
  presetPersonId?: string
  presetDate?: string
  presetDutyId?: string
  journalId?: 'duties' | 'myropil'
}

/** Обгортка: форма монтується заново при кожному відкритті, тому стан завжди свіжий. */
export function ManualAssignModal(props: Props) {
  if (!props.open) return null
  return <ManualAssignForm {...props} />
}

function ManualAssignForm({
  open,
  onClose,
  presetPersonId,
  presetDate,
  presetDutyId,
  journalId = 'duties',
}: Props) {
  const allPeople = useStore((s) => s.people)
  const effectiveGroup = useEffectiveGroup()
  const people = useMemo(() => filterByGroupLock(allPeople, effectiveGroup), [allPeople, effectiveGroup])
  const dutyTypes = useStore((s) => s.dutyTypes)
  const settings = useStore((s) => s.settings)
  const statRows = useStore((s) => s.stats)
  const addAssignments = useStore((s) => s.addAssignments)

  const scope = journalId === 'myropil' ? 'myropil' : 'duties'
  const duties = useMemo(() => activeDutyTypes(dutyTypes, scope), [dutyTypes, scope])
  const initialDuty = duties.find((d) => d.id === presetDutyId) ?? duties[0]
  const initialDate = presetDate ?? todayISO()
  const [date, setDate] = useState(initialDate)
  const [dutyId, setDutyId] = useState(initialDuty?.id ?? '')
  const [variantId, setVariantId] = useState<string>(initialDuty?.variants?.[0]?.id ?? '')
  const [points, setPoints] = useState(
    String(
      initialDuty
        ? dutyPointsForDate(
            dutyBasePoints(initialDuty, initialDuty.variants?.[0]?.id ?? null),
            initialDate,
            settings.weekendMultiplier,
          )
        : 1,
    ),
  )
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(presetPersonId ? [presetPersonId] : []))
  const [search, setSearch] = useState('')

  const currentDuty = duties.find((d) => d.id === dutyId)
  const variants = currentDuty?.variants ?? []

  const syncPoints = (nextDate: string, nextDutyId: string, nextVariantId: string) => {
    const d = duties.find((x) => x.id === nextDutyId)
    if (!d) return
    if (d.isMainDuty) {
      setPoints('0')
      return
    }
    const base = dutyBasePoints(d, nextVariantId || null)
    setPoints(String(dutyPointsForDate(base, nextDate, settings.weekendMultiplier)))
  }

  const stats = useMemo(() => statsFromRows(people, statRows, todayISO()), [people, statRows])

  const dayRows = useAssignmentsOnDate(date)
  const busyToday = useMemo(() => {
    const set = new Set<string>()
    for (const a of dayRows) set.add(a.personId)
    return set
  }, [dayRows])

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
    const duty = duties.find((d) => d.id === dutyId)
    const pts = duty?.isMainDuty ? 0 : Number(points) || 0
    const spanDays = Math.max(1, Math.floor(Number(duty?.durationDays) || 1))
    const now = Date.now()
    addAssignments(
      [...selected].map((personId) => ({
        id: uid(),
        journalId,
        date,
        dutyTypeId: dutyId,
        personId,
        variantId: variantId || null,
        points: pts,
        note: note.trim(),
        source: 'manual' as const,
        createdAt: now,
        spanDays,
      })),
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Записати наряд вручну"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn-primary" onClick={submit} disabled={!dutyId || selected.size === 0}>
            Записати {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Дата">
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => {
              const next = e.target.value
              setDate(next)
              syncPoints(next, dutyId, variantId)
            }}
          />
        </Field>
        <Field label="Вид наряду">
          <select
            className="input"
            value={dutyId}
            onChange={(e) => {
              const next = e.target.value
              const d = duties.find((x) => x.id === next)
              const nextVariant = d?.variants?.[0]?.id ?? ''
              setDutyId(next)
              setVariantId(nextVariant)
              syncPoints(date, next, nextVariant)
            }}
          >
            {duties.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.points} б.
                {isWeekend(date) && settings.weekendMultiplier !== 1
                  ? ` → ${dutyPointsForDate(d.points, date, settings.weekendMultiplier)}`
                  : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Бали"
          hint={
            isWeekend(date) && settings.weekendMultiplier !== 1
              ? `Вихідний: ×${settings.weekendMultiplier}`
              : undefined
          }
        >
          <input
            type="number"
            className="input"
            value={currentDuty?.isMainDuty ? 0 : points}
            step="0.01"
            disabled={Boolean(currentDuty?.isMainDuty)}
            onChange={(e) => setPoints(e.target.value)}
          />
        </Field>
      </div>

      {variants.length > 0 && (
        <Field label="Підпункт" className="mt-3">
          <select
            className="input"
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value)
              syncPoints(date, dutyId, e.target.value)
            }}
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.points} б.
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Примітка (необов’язково)" className="mt-3">
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="напр. заміна за Коваленка"
        />
      </Field>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="label mb-0">Хто йде (відсортовано за рейтингом, менше — вище)</span>
          <input
            className="input w-40 py-1 text-xs"
            placeholder="пошук…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {list.length === 0 && <p className="px-3 py-6 text-center text-sm text-fg-faint">Нікого не знайдено</p>}
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
                  'flex w-full items-center gap-3 border-b border-border/60 px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-surface-2',
                  checked && 'bg-brand-600/15',
                )}
              >
                <input type="checkbox" readOnly checked={checked} className="pointer-events-none accent-brand-500" />
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                  <span className="truncate">{p.name}</span>
                  <PersonTags tags={p.tags} />
                  {p.group && <span className="text-xs text-fg-faint">{p.group}</span>}
                </span>
                {busy && <span className="badge bg-tint-amber/15 text-tint-amber">уже в наряді</span>}
                {p.status !== 'active' && <StatusBadge status={p.status} />}
                <span className="w-14 text-right tabular-nums text-fg-muted">{s?.points ?? 0} б.</span>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
