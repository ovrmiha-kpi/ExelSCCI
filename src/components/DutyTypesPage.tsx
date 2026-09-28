import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import { sortedDutyTypes } from '../lib/stats'
import { DUTY_COLORS } from '../lib/defaults'
import { DutyBadge, Field, Modal } from './ui'

export function DutyTypesPage() {
  const dutyTypes = useStore((s) => s.dutyTypes)
  const assignments = useStore((s) => s.assignments)
  const addDutyType = useStore((s) => s.addDutyType)
  const updateDutyType = useStore((s) => s.updateDutyType)
  const removeDutyType = useStore((s) => s.removeDutyType)
  const moveDutyType = useStore((s) => s.moveDutyType)

  const duties = useMemo(() => sortedDutyTypes(dutyTypes), [dutyTypes])
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of assignments) m.set(a.dutyTypeId, (m.get(a.dutyTypeId) ?? 0) + 1)
    return m
  }, [assignments])

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [short, setShort] = useState('')
  const [points, setPoints] = useState('1')
  const [slots, setSlots] = useState('1')
  const [color, setColor] = useState(DUTY_COLORS[0])

  const submit = () => {
    if (!name.trim()) return
    addDutyType({
      name,
      short: short || name.slice(0, 3),
      points: Number(points),
      defaultSlots: Number(slots),
      color,
    })
    setAddOpen(false)
    setName('')
    setShort('')
    setPoints('1')
    setSlots('1')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex items-center gap-3 p-3">
        <p className="text-sm text-slate-600">
          Кожен вид наряду дає бали. Зміна вартості діє на нові записи — старі зберігають свої бали.
        </p>
        <button className="btn-primary ml-auto" onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Додати вид
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th w-16" />
              <th className="th">Назва</th>
              <th className="th">Коротко</th>
              <th className="th text-center">Бали</th>
              <th className="th text-center">Осіб за замовч.</th>
              <th className="th">Колір</th>
              <th className="th text-center">Записів</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {duties.map((d, i) => (
              <tr key={d.id} className={clsx('hover:bg-slate-50', d.archived && 'opacity-50')}>
                <td className="td whitespace-nowrap">
                  <button className="btn-ghost btn-sm" disabled={i === 0} onClick={() => moveDutyType(d.id, -1)}>
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    disabled={i === duties.length - 1}
                    onClick={() => moveDutyType(d.id, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                </td>
                <td className="td">
                  <input
                    className="input py-0.5"
                    value={d.name}
                    onChange={(e) => updateDutyType(d.id, { name: e.target.value })}
                  />
                </td>
                <td className="td">
                  <input
                    className="input w-20 py-0.5 uppercase"
                    value={d.short}
                    maxLength={5}
                    onChange={(e) => updateDutyType(d.id, { short: e.target.value.toUpperCase() })}
                  />
                </td>
                <td className="td text-center">
                  <input
                    type="number"
                    step="0.5"
                    className="input w-20 py-0.5 text-center"
                    value={d.points}
                    onChange={(e) => updateDutyType(d.id, { points: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="td text-center">
                  <input
                    type="number"
                    min={1}
                    className="input w-20 py-0.5 text-center"
                    value={d.defaultSlots}
                    onChange={(e) => updateDutyType(d.id, { defaultSlots: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </td>
                <td className="td">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={d.color}
                      onChange={(e) => updateDutyType(d.id, { color: e.target.value })}
                      className="h-7 w-9 cursor-pointer rounded border border-slate-300"
                    />
                    <DutyBadge duty={d} short />
                  </div>
                </td>
                <td className="td text-center tabular-nums text-slate-600">{usage.get(d.id) ?? 0}</td>
                <td className="td text-right whitespace-nowrap">
                  <button
                    className="btn-ghost btn-sm"
                    title={d.archived ? 'Повернути з архіву' : 'В архів (не пропонувати при призначенні)'}
                    onClick={() => updateDutyType(d.id, { archived: !d.archived })}
                  >
                    {d.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </button>
                  <button
                    className="btn-ghost btn-sm text-red-600"
                    title="Видалити"
                    onClick={() => {
                      const n = usage.get(d.id) ?? 0
                      if (
                        confirm(
                          `Видалити «${d.name}»?${n ? ` Видаляться і ${n} записів про такі наряди. Краще відправити в архів.` : ''}`,
                        )
                      )
                        removeDutyType(d.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Новий вид наряду"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddOpen(false)}>
              Скасувати
            </button>
            <button className="btn-primary" disabled={!name.trim()} onClick={submit}>
              Додати
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Назва" className="col-span-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Коротко (для колонок)">
            <input
              className="input uppercase"
              maxLength={5}
              value={short}
              onChange={(e) => setShort(e.target.value.toUpperCase())}
              placeholder={name.slice(0, 3).toUpperCase()}
            />
          </Field>
          <Field label="Балів за раз">
            <input type="number" step="0.5" className="input" value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
          <Field label="Осіб за замовчуванням">
            <input type="number" min={1} className="input" value={slots} onChange={(e) => setSlots(e.target.value)} />
          </Field>
          <Field label="Колір">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {DUTY_COLORS.map((c) => (
                <button
                  key={c}
                  className={clsx('h-6 w-6 rounded-full border-2', color === c ? 'border-slate-900' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
