import { useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, GripVertical, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import type { DutyCadenceMode, DutyScope, DutyVariant, PersonTag, TagFilterMode } from '../types'
import {
  DUTY_CADENCE_META,
  DUTY_SCOPE_META,
  TAG_FILTER_CHIPS,
  nextTagFilterMode,
  setTagChipFilterMode,
  tagChipFilterMode,
  TAG_FILTER_MODE_META,
} from '../types'
import { sortedDutyTypes } from '../lib/stats'
import { DUTY_COLORS, newVariant } from '../lib/defaults'
import { ColorPalette, DutyBadge, Field, Modal, Segmented, Toggle } from './ui'

const TAG_MODE_CLASS: Record<TagFilterMode, string> = {
  off: 'border-border bg-surface-2 text-fg-faint',
  exclude: 'border-tint-red/50 bg-tint-red/20 text-tint-red',
  require: 'border-tint-emerald/50 bg-tint-emerald/20 text-tint-emerald',
}

function TagRuleChips({
  excludeTags,
  requireTags,
  onChange,
}: {
  excludeTags: PersonTag[]
  requireTags: PersonTag[]
  onChange: (next: { excludeTags: PersonTag[]; requireTags: PersonTag[] }) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {TAG_FILTER_CHIPS.map((chip) => {
        const mode = tagChipFilterMode(chip.tags, excludeTags, requireTags)
        const meta = TAG_FILTER_MODE_META[mode]
        return (
          <button
            key={chip.id}
            type="button"
            title={`${chip.label}: ${meta.label}`}
            className={clsx('badge cursor-pointer border uppercase', TAG_MODE_CLASS[mode])}
            onClick={() =>
              onChange(setTagChipFilterMode(chip.tags, nextTagFilterMode(mode), excludeTags, requireTags))
            }
          >
            {chip.short}
          </button>
        )
      })}
    </div>
  )
}

export function DutyTypesPage() {
  return <DutyTypesEditor />
}

export function DutyTypesEditor() {
  const dutyTypes = useStore((s) => s.dutyTypes)
  const stats = useStore((s) => s.stats)
  const workspaceGroup = useStore((s) => s.workspaceGroup)
  const addDutyType = useStore((s) => s.addDutyType)
  const updateDutyType = useStore((s) => s.updateDutyType)
  const removeDutyType = useStore((s) => s.removeDutyType)
  const reorderDutyTypes = useStore((s) => s.reorderDutyTypes)
  const canEdit = Boolean(workspaceGroup)

  const [scopeTab, setScopeTab] = useState<DutyScope>('duties')
  const duties = useMemo(() => sortedDutyTypes(dutyTypes, scopeTab), [dutyTypes, scopeTab])
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of stats) {
      for (const [id, n] of Object.entries(row.countByDuty)) m.set(id, (m.get(id) ?? 0) + n)
    }
    return m
  }, [stats])

  const dragId = useRef<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [paletteFor, setPaletteFor] = useState<string | null>(null)
  const [variantsFor, setVariantsFor] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [short, setShort] = useState('')
  const [points, setPoints] = useState('1')
  const [slots, setSlots] = useState('1')
  const [color, setColor] = useState(DUTY_COLORS[0])
  const [excludeTags, setExcludeTags] = useState<PersonTag[]>([])
  const [requireTags, setRequireTags] = useState<PersonTag[]>([])
  const [cadenceMode, setCadenceMode] = useState<DutyCadenceMode>('minGap')
  const [cadenceDays, setCadenceDays] = useState('0')
  const [periodicityDays, setPeriodicityDays] = useState('0')
  const [isMainDuty, setIsMainDuty] = useState(false)
  const [blocksFullDay, setBlocksFullDay] = useState(false)
  const [durationDays, setDurationDays] = useState('1')

  const resetAddForm = () => {
    setName('')
    setShort('')
    setPoints('1')
    setSlots('1')
    setColor(DUTY_COLORS[0])
    setExcludeTags([])
    setRequireTags([])
    setCadenceMode('minGap')
    setCadenceDays('0')
    setPeriodicityDays('0')
    setIsMainDuty(false)
    setBlocksFullDay(false)
    setDurationDays('1')
  }

  const submit = () => {
    if (!canEdit || !name.trim()) return
    addDutyType({
      name,
      short: short || name.slice(0, 3),
      points: isMainDuty ? 0 : Number(points),
      defaultSlots: Number(slots),
      allowExtraPerson: false,
      color,
      excludeTags,
      requireTags,
      variants: [],
      scope: scopeTab,
      cadenceMode,
      cadenceDays: Math.max(0, Number(cadenceDays) || 0),
      periodicityDays: Math.max(0, Number(periodicityDays) || 0),
      isMainDuty,
      blocksFullDay,
      durationDays: Math.max(1, Math.floor(Number(durationDays) || 1)),
    })
    setAddOpen(false)
    resetAddForm()
  }

  const onDrop = (targetId: string) => {
    if (!canEdit) return
    const from = dragId.current
    dragId.current = null
    setOverId(null)
    if (!from || from === targetId) return
    const ids = duties.map((d) => d.id)
    const fromIdx = ids.indexOf(from)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, from)
    const otherIds = dutyTypes
      .filter((d) => (d.scope ?? 'duties') !== scopeTab)
      .sort((a, b) => a.order - b.order)
      .map((d) => d.id)
    reorderDutyTypes(scopeTab === 'duties' ? [...ids, ...otherIds] : [...otherIds, ...ids])
  }

  const patchVariants = (dutyId: string, variants: DutyVariant[]) => {
    updateDutyType(dutyId, { variants })
  }

  return (
    <div className="flex flex-col gap-3">
      {!canEdit && (
        <p className="alert-warn px-3 py-2 text-sm">
          Оберіть робочу групу в канцелярії (Налаштування), щоб редагувати види нарядів.
        </p>
      )}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <Segmented
          value={scopeTab}
          onChange={setScopeTab}
          options={(Object.keys(DUTY_SCOPE_META) as DutyScope[]).map((id) => [
            id,
            DUTY_SCOPE_META[id].label,
          ])}
        />
        <button className="btn-primary ml-auto" disabled={!canEdit} onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Додати вид
        </button>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[64rem]">
          <thead>
            <tr>
              <th className="th w-10" />
              <th className="th">Назва</th>
              <th className="th">Коротко</th>
              <th className="th text-center">Бали</th>
              <th className="th text-center">Осіб</th>
              <th className="th">Відпоч. / Період.</th>
              <th className="th">Позначки</th>
              <th className="th">Колір</th>
              <th className="th text-center">Записів</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {duties.length === 0 && (
              <tr>
                <td colSpan={10} className="td py-6 text-center text-sm text-fg-faint">
                  Немає пунктів для «{DUTY_SCOPE_META[scopeTab].label}». Додайте вид.
                </td>
              </tr>
            )}
            {duties.map((d) => {
              const mode = d.cadenceMode ?? 'minGap'
              return (
                <tr
                  key={d.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOverId(d.id)
                  }}
                  onDragLeave={() => setOverId((id) => (id === d.id ? null : id))}
                  onDrop={() => onDrop(d.id)}
                  className={clsx(
                    'hover:bg-surface-2',
                    d.archived && 'opacity-50',
                    overId === d.id && 'bg-brand-600/15 ring-1 ring-inset ring-brand-500/40',
                  )}
                >
                  <td
                    className="td cursor-grab text-fg-faint active:cursor-grabbing"
                    title="Перетягнути"
                    draggable
                    onDragStart={() => {
                      dragId.current = d.id
                    }}
                    onDragEnd={() => {
                      dragId.current = null
                      setOverId(null)
                    }}
                  >
                    <GripVertical size={16} />
                  </td>
                  <td className="td">
                    <input
                      className="input py-0.5"
                      value={d.name}
                      onChange={(e) => updateDutyType(d.id, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      className="mt-1 text-[10px] text-brand-300 hover:underline"
                      onClick={() => setVariantsFor((id) => (id === d.id ? null : d.id))}
                    >
                      {(d.variants?.length ?? 0) > 0
                        ? `Підпункти (${d.variants.length})`
                        : 'Підпункти…'}
                    </button>
                    {variantsFor === d.id && (
                      <div className="mt-2 space-y-1.5 rounded border border-border bg-surface-2 p-2">
                        {(d.variants ?? []).map((v, vi) => (
                          <div key={v.id} className="flex flex-wrap items-center gap-1.5">
                            <input
                              className="input min-w-28 flex-1 py-0.5 text-xs"
                              value={v.name}
                              placeholder="Назва"
                              onChange={(e) => {
                                const next = [...(d.variants ?? [])]
                                next[vi] = { ...v, name: e.target.value }
                                patchVariants(d.id, next)
                              }}
                            />
                            <input
                              className="input w-16 py-0.5 text-center text-xs uppercase"
                              maxLength={5}
                              value={v.short}
                              onChange={(e) => {
                                const next = [...(d.variants ?? [])]
                                next[vi] = { ...v, short: e.target.value.toUpperCase() }
                                patchVariants(d.id, next)
                              }}
                            />
                            <input
                              type="number"
                              step="0.5"
                              className="input w-16 py-0.5 text-center text-xs"
                              value={d.isMainDuty ? 0 : v.points}
                              disabled={d.isMainDuty}
                              title="Бали підпункту"
                              onChange={(e) => {
                                const next = [...(d.variants ?? [])]
                                next[vi] = { ...v, points: Number(e.target.value) || 0 }
                                patchVariants(d.id, next)
                              }}
                            />
                            <button
                              className="btn-ghost btn-sm text-tint-red"
                              onClick={() =>
                                patchVariants(d.id, (d.variants ?? []).filter((x) => x.id !== v.id))
                              }
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() =>
                            patchVariants(d.id, [
                              ...(d.variants ?? []),
                              newVariant(d.isMainDuty ? { points: 0 } : undefined),
                            ])
                          }
                        >
                          <Plus size={12} /> Підпункт
                        </button>
                      </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-fg-muted">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={Boolean(d.isMainDuty)}
                          onChange={(e) => {
                            const on = e.target.checked
                            updateDutyType(d.id, {
                              isMainDuty: on,
                              points: on ? 0 : d.points,
                            })
                          }}
                        />
                        Головне чергування
                      </label>
                      <label
                        className="inline-flex items-center gap-1"
                        title="Людина на цьому наряді не може отримати інший наряд у ті самі дні"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(d.blocksFullDay)}
                          onChange={(e) => updateDutyType(d.id, { blocksFullDay: e.target.checked })}
                        />
                        Цілодобова зайнятість
                      </label>
                      <label className="inline-flex items-center gap-1">
                        Тривалість
                        <input
                          type="number"
                          min={1}
                          className="input w-14 py-0.5 text-center text-xs"
                          value={d.durationDays ?? 1}
                          onChange={(e) =>
                            updateDutyType(d.id, {
                              durationDays: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                            })
                          }
                        />
                        дн.
                      </label>
                      <label
                        className="inline-flex items-center gap-1"
                        title="Скільки днів відпочинку тій самій людині перед повтором цього наряду"
                      >
                        Відпочинок
                        <input
                          type="number"
                          min={0}
                          className="input w-14 py-0.5 text-center text-xs"
                          value={d.cadenceDays ?? 0}
                          onChange={(e) =>
                            updateDutyType(d.id, {
                              cadenceDays: Math.max(0, Number(e.target.value) || 0),
                              cadenceMode: d.cadenceMode ?? 'minGap',
                            })
                          }
                        />
                        дн.
                      </label>
                      <label
                        className="inline-flex items-center gap-1"
                        title="Через скільки днів після останнього призначення цього наряду автоза ставить наступну людину"
                      >
                        Періодичність
                        <input
                          type="number"
                          min={0}
                          className="input w-14 py-0.5 text-center text-xs"
                          value={d.periodicityDays ?? 0}
                          onChange={(e) =>
                            updateDutyType(d.id, {
                              periodicityDays: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                        дн.
                      </label>
                    </div>
                    {d.isMainDuty && (
                      <p className="mt-1 text-[10px] text-fg-faint">
                        0 балів · автоза: менше разів цього наряду → алфавіт
                      </p>
                    )}
                    {d.blocksFullDay && (
                      <p className="mt-0.5 text-[10px] text-fg-faint">
                        Блокує інші наряди на всі дні цього призначення
                      </p>
                    )}
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
                      value={d.isMainDuty ? 0 : d.points}
                      disabled={Boolean(d.isMainDuty)}
                      onChange={(e) => updateDutyType(d.id, { points: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="td text-center">
                    <input
                      type="number"
                      min={1}
                      className="input w-16 py-0.5 text-center"
                      value={d.defaultSlots}
                      onChange={(e) =>
                        updateDutyType(d.id, {
                          defaultSlots: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </td>
                  <td className="td">
                    <div className="flex min-w-44 flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <select
                          className="input min-w-0 flex-1 py-0.5 text-xs"
                          value={mode}
                          title={DUTY_CADENCE_META[mode].hint}
                          onChange={(e) =>
                            updateDutyType(d.id, { cadenceMode: e.target.value as DutyCadenceMode })
                          }
                        >
                          {(Object.keys(DUTY_CADENCE_META) as DutyCadenceMode[]).map((m) => (
                            <option key={m} value={m}>
                              {DUTY_CADENCE_META[m].label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          className="input w-14 py-0.5 text-center text-xs"
                          value={d.cadenceDays ?? 0}
                          title={DUTY_CADENCE_META[mode].hint}
                          onChange={(e) =>
                            updateDutyType(d.id, {
                              cadenceDays: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </div>
                      <label className="flex items-center gap-1 text-[10px] text-fg-muted">
                        Період.
                        <input
                          type="number"
                          min={0}
                          className="input w-14 py-0.5 text-center text-xs"
                          value={d.periodicityDays ?? 0}
                          title="Днів після останнього призначення наряду до автопризначення наступної людини. 0 — щодня."
                          onChange={(e) =>
                            updateDutyType(d.id, {
                              periodicityDays: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </label>
                    </div>
                  </td>
                  <td className="td">
                    <TagRuleChips
                      excludeTags={d.excludeTags ?? []}
                      requireTags={d.requireTags ?? []}
                      onChange={(next) => updateDutyType(d.id, next)}
                    />
                  </td>
                  <td className="td">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="h-7 w-7 shrink-0 border border-border-strong shadow-sm"
                          style={{ backgroundColor: d.color }}
                          title="Відкрити палітру"
                          onClick={() => setPaletteFor((id) => (id === d.id ? null : d.id))}
                        />
                        <DutyBadge duty={d} short />
                      </div>
                      {paletteFor === d.id && (
                        <ColorPalette
                          value={d.color}
                          onChange={(c) => updateDutyType(d.id, { color: c })}
                        />
                      )}
                    </div>
                  </td>
                  <td className="td text-center tabular-nums text-fg-muted">{usage.get(d.id) ?? 0}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button
                      className="btn-ghost btn-sm"
                      title={d.archived ? 'Повернути з архіву' : 'В архів'}
                      onClick={() => updateDutyType(d.id, { archived: !d.archived })}
                    >
                      {d.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                    <button
                      className="btn-ghost btn-sm text-tint-red"
                      onClick={() => {
                        const n = usage.get(d.id) ?? 0
                        if (
                          confirm(
                            `Видалити «${d.name}»?${n ? ` Видаляться і ${n} записів.` : ''}`,
                          )
                        )
                          removeDutyType(d.id)
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          resetAddForm()
        }}
        title={`Новий вид — ${DUTY_SCOPE_META[scopeTab].label}`}
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                setAddOpen(false)
                resetAddForm()
              }}
            >
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
          <Field label="Коротко">
            <input
              className="input uppercase"
              maxLength={5}
              value={short}
              onChange={(e) => setShort(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Бали">
            <input
              type="number"
              step="0.5"
              className="input"
              value={isMainDuty ? '0' : points}
              disabled={isMainDuty}
              onChange={(e) => setPoints(e.target.value)}
            />
          </Field>
          <Field label="Осіб за замовч.">
            <input
              type="number"
              min={1}
              className="input"
              value={slots}
              onChange={(e) => setSlots(e.target.value)}
            />
          </Field>
          <Field label="Тривалість, днів">
            <input
              type="number"
              min={1}
              className="input"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </Field>
          <Field label="Колір">
            <ColorPalette value={color} onChange={setColor} />
          </Field>
          <div className="col-span-2 flex flex-col gap-2 rounded-md border border-border bg-surface-2/40 px-3 py-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                className="accent-brand-600"
                checked={isMainDuty}
                onChange={(e) => {
                  const on = e.target.checked
                  setIsMainDuty(on)
                  if (on) setPoints('0')
                }}
              />
              Головне чергування
            </label>
            <p className="pl-6 text-xs text-fg-faint">0 балів · автоза за кількістю цього наряду → алфавіт</p>
            <label
              className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg"
              title="Людина на цьому наряді не може отримати інший наряд у ті самі дні"
            >
              <input
                type="checkbox"
                className="accent-brand-600"
                checked={blocksFullDay}
                onChange={(e) => setBlocksFullDay(e.target.checked)}
              />
              Цілодобова зайнятість
            </label>
            <p className="pl-6 text-xs text-fg-faint">
              Блокує інші наряди на всі дні цього призначення
            </p>
          </div>
          <Field label="Відпочинок людини" className="col-span-2">
            <Segmented
              value={cadenceMode}
              onChange={setCadenceMode}
              options={(Object.keys(DUTY_CADENCE_META) as DutyCadenceMode[]).map((m) => [
                m,
                DUTY_CADENCE_META[m].label,
              ])}
            />
          </Field>
          <Field label={DUTY_CADENCE_META[cadenceMode].unit} hint={DUTY_CADENCE_META[cadenceMode].hint}>
            <input
              type="number"
              min={0}
              className="input"
              value={cadenceDays}
              onChange={(e) => setCadenceDays(e.target.value)}
            />
          </Field>
          <Field
            label="Періодичність наряду, днів"
            hint="Через скільки днів після останнього призначення цього наряду (будь-ким) автоза ставить наступну людину. 0 — щодня в плані."
          >
            <input
              type="number"
              min={0}
              className="input"
              value={periodicityDays}
              onChange={(e) => setPeriodicityDays(e.target.value)}
            />
          </Field>
          <Field label="Позначки (ж / к / ком)" className="col-span-2">
            <TagRuleChips
              excludeTags={excludeTags}
              requireTags={requireTags}
              onChange={(next) => {
                setExcludeTags(next.excludeTags)
                setRequireTags(next.requireTags)
              }}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
