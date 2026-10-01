import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { ISODate } from '../types'
import { dutyPointsForDate, isWeekend } from '../lib/dates'
import { dutyBasePoints, leafVariants } from '../lib/defaults'
import { uid } from '../lib/id'
import { activeDutyTypes } from '../lib/stats'
import { Field, Modal } from './ui'

export type JournalCellRef = { personId: string; date: ISODate }

export function cellKey(c: JournalCellRef): string {
  return `${c.personId}|${c.date}`
}

/** Модалка: один вид наряду → усі виділені комірки (людина × дата). */
export function BulkCellAssignModal({
  open,
  onClose,
  cells,
  peopleById,
  journalId = 'duties',
}: {
  open: boolean
  onClose: () => void
  cells: JournalCellRef[]
  peopleById: Map<string, { name: string }>
  journalId?: 'duties' | 'myropil'
}) {
  if (!open || cells.length === 0) return null
  return (
    <BulkCellAssignForm
      cells={cells}
      peopleById={peopleById}
      journalId={journalId}
      onClose={onClose}
    />
  )
}

function BulkCellAssignForm({
  cells,
  peopleById,
  journalId,
  onClose,
}: {
  cells: JournalCellRef[]
  peopleById: Map<string, { name: string }>
  journalId: 'duties' | 'myropil'
  onClose: () => void
}) {
  const dutyTypes = useStore((s) => s.dutyTypes)
  const settings = useStore((s) => s.settings)
  const addAssignments = useStore((s) => s.addAssignments)
  const duties = useMemo(
    () => activeDutyTypes(dutyTypes, journalId === 'myropil' ? 'myropil' : 'duties'),
    [dutyTypes, journalId],
  )
  const [dutyId, setDutyId] = useState(duties[0]?.id ?? '')
  const currentDuty = duties.find((d) => d.id === dutyId)
  const [variantId, setVariantId] = useState(leafVariants(currentDuty?.variants)[0]?.id ?? '')
  const [note, setNote] = useState('')

  const peopleCount = useMemo(() => new Set(cells.map((c) => c.personId)).size, [cells])
  const datesCount = useMemo(() => new Set(cells.map((c) => c.date)).size, [cells])

  const submit = () => {
    if (!dutyId || cells.length === 0) return
    const duty = duties.find((d) => d.id === dutyId)
    if (!duty) return
    const spanDays = Math.max(1, Math.floor(Number(duty.durationDays) || 1))
    const now = Date.now()
    const vId = variantId || null
    addAssignments(
      cells.map((c) => {
        const pts = duty.isMainDuty
          ? 0
          : dutyPointsForDate(dutyBasePoints(duty, vId), c.date, settings.weekendMultiplier)
        return {
          id: uid(),
          journalId,
          date: c.date,
          dutyTypeId: dutyId,
          personId: c.personId,
          variantId: vId,
          points: pts,
          note: note.trim(),
          source: 'manual' as const,
          createdAt: now,
          spanDays,
        }
      }),
    )
    onClose()
  }

  const preview = cells.slice(0, 12)

  return (
    <Modal
      open
      onClose={onClose}
      title={`Призначити на ${cells.length} комірок`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn-primary" onClick={submit} disabled={!dutyId}>
            Записати ({cells.length})
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-fg-muted">
        {peopleCount} осіб · {datesCount} дат · бали рахуються окремо для кожної дати
        {settings.weekendMultiplier !== 1 ? ' (з урахуванням вихідних)' : ''}.
      </p>
      <div className="mb-3 max-h-28 overflow-y-auto rounded-md border border-border bg-surface-2/40 px-2 py-1.5 text-xs text-fg-muted">
        {preview.map((c) => (
          <div key={cellKey(c)}>
            {peopleById.get(c.personId)?.name ?? c.personId} · {c.date}
            {isWeekend(c.date) ? ' (вих.)' : ''}
          </div>
        ))}
        {cells.length > preview.length && (
          <div className="text-fg-faint">…і ще {cells.length - preview.length}</div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <Field label="Вид наряду">
          <select
            className="input"
            value={dutyId}
            onChange={(e) => {
              const next = e.target.value
              const d = duties.find((x) => x.id === next)
              setDutyId(next)
              setVariantId(leafVariants(d?.variants)[0]?.id ?? '')
            }}
          >
            {duties.map((d) => (
              <option key={d.id} value={d.id}>
                {d.short || d.name}
                {d.isMainDuty ? ' · 0 б.' : ` · ${d.points} б.`}
              </option>
            ))}
          </select>
        </Field>
        {(leafVariants(currentDuty?.variants).length > 0) && (
          <Field label="Підпункт">
            <select className="input" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              {leafVariants(currentDuty!.variants).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.short || v.name} · {v.points} б.
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Примітка (необовʼязково)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
