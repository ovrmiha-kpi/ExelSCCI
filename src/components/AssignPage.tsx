import { useMemo, useState } from 'react'
import { AlertTriangle, Check, RefreshCw, Trash2, Wand2 } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import { activeDutyTypes } from '../lib/stats'
import { addDaysISO, dateRange, formatHuman, todayISO } from '../lib/dates'
import {
  planAssignments,
  proposalsToAssignments,
  rankCandidates,
  type Proposal,
} from '../lib/autoAssign'
import type { AppData } from '../types'
import { DutyBadge, EmptyState, Toggle } from './ui'

export function AssignPage({ onDone }: { onDone: () => void }) {
  const people = useStore((s) => s.people)
  const dutyTypes = useStore((s) => s.dutyTypes)
  const assignments = useStore((s) => s.assignments)
  const settings = useStore((s) => s.settings)
  const addAssignments = useStore((s) => s.addAssignments)

  const duties = useMemo(() => activeDutyTypes(dutyTypes), [dutyTypes])
  const dutyById = useMemo(() => new Map(dutyTypes.map((d) => [d.id, d])), [dutyTypes])
  const groups = useMemo(
    () => [...new Set(people.map((p) => p.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    [people],
  )

  const [multiDay, setMultiDay] = useState(false)
  const [from, setFrom] = useState(addDaysISO(todayISO(), 1))
  const [to, setTo] = useState(addDaysISO(todayISO(), 7))
  const [slots, setSlots] = useState<Record<string, number>>({})
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const isOn = (id: string) => enabled[id] ?? true
  const slotsFor = (id: string, fallback: number) => slots[id] ?? fallback
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set())
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [excludeSearch, setExcludeSearch] = useState('')

  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [saved, setSaved] = useState<number | null>(null)

  const dates = useMemo(() => (multiDay ? dateRange(from, to) : [from]), [multiDay, from, to])

  const data: AppData = useMemo(
    () => ({ people, dutyTypes, assignments, settings }),
    [people, dutyTypes, assignments, settings],
  )

  const existingOnDates = useMemo(() => {
    const set = new Set(dates)
    return assignments.filter((a) => set.has(a.date))
  }, [assignments, dates])

  const buildPlan = () => {
    const req = {
      dates,
      duties: duties
        .filter((d) => isOn(d.id))
        .map((d) => ({ dutyTypeId: d.id, slots: Math.max(0, Number(slotsFor(d.id, d.defaultSlots)) || 0) })),
      groups: [...selGroups],
      excludePersonIds: [...excluded],
    }
    const res = planAssignments(data, req)
    setProposals(res.proposals)
    setWarnings(res.warnings)
    setSaved(null)
  }

  const plannedByPerson = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const p of proposals ?? []) {
      if (!p.personId) continue
      m.set(p.personId, [...(m.get(p.personId) ?? []), p.date])
    }
    return m
  }, [proposals])

  const candidatesFor = (date: string, currentPersonId: string | null) => {
    // текущего человека не считаем занятым этим же местом, чтобы он оставался выбранным
    const m = new Map(plannedByPerson)
    if (currentPersonId) {
      const rest = (m.get(currentPersonId) ?? []).slice()
      const idx = rest.indexOf(date)
      if (idx >= 0) rest.splice(idx, 1)
      m.set(currentPersonId, rest)
    }
    return rankCandidates(data, date, m)
  }

  const setPerson = (key: string, personId: string | null) => {
    setProposals((prev) =>
      prev
        ? prev.map((p) =>
            p.key === key ? { ...p, personId, note: personId ? 'выбран вручную' : 'не назначен' } : p,
          )
        : prev,
    )
  }

  const removeProposal = (key: string) =>
    setProposals((prev) => (prev ? prev.filter((p) => p.key !== key) : prev))

  const confirm = () => {
    if (!proposals) return
    const list = proposalsToAssignments(proposals, dutyTypes)
    addAssignments(list)
    setSaved(list.length)
    setProposals(null)
  }

  const totalSlots = duties
    .filter((d) => isOn(d.id))
    .reduce((s, d) => s + (Number(slotsFor(d.id, d.defaultSlots)) || 0), 0)
  const activeCount = people.filter((p) => p.status === 'active' && !excluded.has(p.id)).length

  if (people.length === 0) {
    return (
      <EmptyState title="Сначала добавьте людей">
        Автоназначение выбирает из личного состава на вкладке «Люди».
      </EmptyState>
    )
  }

  const byDate = new Map<string, Proposal[]>()
  for (const p of proposals ?? []) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      {/* Параметры */}
      <div className="card flex flex-col gap-4 p-4 lg:sticky lg:top-16 lg:self-start">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Когда</h2>
          <Toggle checked={multiDay} onChange={setMultiDay} label="Спланировать несколько дней" />
          <div className="mt-2 flex items-center gap-2">
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            {multiDay && (
              <>
                <span className="text-slate-400">—</span>
                <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </>
            )}
          </div>
          {multiDay && (
            <p className="mt-1 text-xs text-slate-500">
              {dates.length} дн. — рейтинг пересчитывается после каждого дня, чтобы нагрузка распределялась ровно.
            </p>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Какие наряды и сколько человек</h2>
          <div className="flex flex-col gap-1.5">
            {duties.map((d) => (
              <div key={d.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={isOn(d.id)}
                  onChange={(e) => setEnabled((s) => ({ ...s, [d.id]: e.target.checked }))}
                />
                <DutyBadge duty={d} />
                <span className="ml-auto text-xs text-slate-500">{d.points} б.</span>
                <input
                  type="number"
                  min={0}
                  className="input w-16 py-1 text-center"
                  value={slotsFor(d.id, d.defaultSlots)}
                  disabled={!isOn(d.id)}
                  onChange={(e) => setSlots((s) => ({ ...s, [d.id]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Всего мест в день: <b>{totalSlots}</b>, доступно людей: <b>{activeCount}</b>
          </p>
        </div>

        {groups.length > 1 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Из каких групп</h2>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const on = selGroups.has(g)
                return (
                  <button
                    key={g}
                    className={clsx(
                      'badge cursor-pointer border',
                      on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700',
                    )}
                    onClick={() =>
                      setSelGroups((prev) => {
                        const n = new Set(prev)
                        if (n.has(g)) n.delete(g)
                        else n.add(g)
                        return n
                      })
                    }
                  >
                    {g}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">Ничего не выбрано — берём всех.</p>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Исключить на этот раз</h2>
          <input
            className="input mb-1.5"
            placeholder="найти человека…"
            value={excludeSearch}
            onChange={(e) => setExcludeSearch(e.target.value)}
          />
          <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200">
            {people
              .filter((p) => p.status === 'active')
              .filter((p) => !excludeSearch || p.name.toLowerCase().includes(excludeSearch.toLowerCase()))
              .map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2 py-1 text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="accent-brand-600"
                    checked={excluded.has(p.id)}
                    onChange={(e) =>
                      setExcluded((prev) => {
                        const n = new Set(prev)
                        if (e.target.checked) n.add(p.id)
                        else n.delete(p.id)
                        return n
                      })
                    }
                  />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
          </div>
        </div>

        <button className="btn-primary" onClick={buildPlan} disabled={totalSlots === 0}>
          <Wand2 size={16} /> Составить план
        </button>
        <p className="text-xs text-slate-500">
          Перерыв между нарядами: {settings.cooldownDays} дн. Изменить — в «Настройках».
        </p>
      </div>

      {/* Предпросмотр */}
      <div className="flex flex-col gap-3">
        {saved !== null && (
          <div className="card flex items-center gap-3 border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <Check size={18} />
            <span>
              Записано назначений: <b>{saved}</b>. Рейтинг обновлён.
            </span>
            <button className="btn-secondary btn-sm ml-auto" onClick={onDone}>
              Открыть таблицу
            </button>
          </div>
        )}

        {existingOnDates.length > 0 && !proposals && (
          <div className="card p-3 text-sm text-slate-700">
            <p className="mb-1 font-medium">На выбранные даты уже есть записи ({existingOnDates.length}):</p>
            <p className="text-xs text-slate-500">
              Эти люди будут считаться занятыми и в план не попадут. Посмотреть или удалить можно в «Журнале».
            </p>
          </div>
        )}

        {!proposals && saved === null && (
          <EmptyState title="Задайте параметры и нажмите «Составить план»">
            Алгоритм выберет тех, у кого меньше всего баллов. При равенстве — кто дольше отдыхал, затем кто реже
            ходил именно в этот наряд. Самые «дорогие» наряды раздаются первыми.
          </EmptyState>
        )}

        {proposals && (
          <>
            {warnings.length > 0 && (
              <div className="card border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {warnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            {[...byDate.entries()].map(([date, list]) => (
              <div key={date} className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
                  <h3 className="text-sm font-semibold capitalize">{formatHuman(date)}</h3>
                  <span className="text-xs text-slate-500">
                    {list.filter((p) => p.personId).length}/{list.length} мест заполнено
                  </span>
                </div>
                <div>
                  {list.map((p) => {
                    const duty = dutyById.get(p.dutyTypeId)
                    const cands = candidatesFor(date, p.personId)
                    return (
                      <div
                        key={p.key}
                        className={clsx(
                          'flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 last:border-b-0 sm:flex-nowrap',
                          !p.personId && 'bg-red-50',
                        )}
                      >
                        <div className="w-40 shrink-0">
                          <DutyBadge duty={duty} />
                        </div>
                        <select
                          className={clsx('input min-w-48 flex-1', !p.personId && 'border-red-300')}
                          value={p.personId ?? ''}
                          onChange={(e) => setPerson(p.key, e.target.value || null)}
                        >
                          <option value="">— не назначен —</option>
                          {cands.map((c) => (
                            <option
                              key={c.person.id}
                              value={c.person.id}
                              disabled={!c.available && c.person.id !== p.personId}
                            >
                              {c.person.name} · {c.points} б.
                              {c.restDays === null ? ' · не ходил' : ` · отдых ${c.restDays} дн.`}
                              {c.busy && c.person.id !== p.personId ? ' · ЗАНЯТ' : ''}
                              {!c.available ? ' · не в строю' : ''}
                            </option>
                          ))}
                        </select>
                        <span className="w-56 shrink-0 truncate text-xs text-slate-500" title={p.note}>
                          {p.note}
                        </span>
                        <button
                          className="btn-ghost btn-sm text-red-600"
                          title="Убрать место из плана"
                          onClick={() => removeProposal(p.key)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="card flex flex-wrap items-center gap-2 p-3">
              <button className="btn-secondary" onClick={buildPlan}>
                <RefreshCw size={14} /> Пересчитать
              </button>
              <span className="text-sm text-slate-600">
                Будет записано: <b>{proposals.filter((p) => p.personId).length}</b> назначений
                {proposals.some((p) => !p.personId) && (
                  <span className="ml-1 text-red-600">(пустые места не записываются)</span>
                )}
              </span>
              <button
                className="btn-primary ml-auto"
                onClick={confirm}
                disabled={proposals.every((p) => !p.personId)}
              >
                <Check size={16} /> Подтвердить и записать
              </button>
            </div>

            <p className="text-xs text-slate-500">
              В выпадающем списке люди отсортированы так же, как их выбирает алгоритм. Можно заменить любого вручную
              — баллы начислятся тому, кто в итоге записан.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
