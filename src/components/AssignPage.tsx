import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, GripVertical, RefreshCw, Trash2, Wand2 } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import { activeDutyTypes } from '../lib/stats'
import { effectiveSlots, leafVariants } from '../lib/defaults'
import { addDaysISO, dateRange, formatHuman, todayISO } from '../lib/dates'
import { useAssignmentsRange } from '../lib/queries'
import {
  planAssignments,
  proposalsToAssignments,
  rankCandidates,
  type Proposal,
} from '../lib/autoAssign'
import type { AppData, DutyType, DutyVariant, PersonTag } from '../types'
import {
  PERSON_TAG_META,
  TAG_FILTER_CHIPS,
  TAG_FILTER_MODE_META,
  nextTagFilterMode,
  setTagChipFilterMode,
  tagChipFilterMode,
} from '../types'
import { resolveMyropilPlanMode } from '../lib/myropil'
import { loadUiPrefs, saveUiPrefs, isPrefsISODate } from '../lib/uiPrefs'
import { peopleOfGroup, personIdsInSquads } from '../lib/squads'
import { DutyBadge, EmptyState, PersonTags, Toggle } from './ui'
import { filterByGroupLock } from '../lib/auth'
import { useEffectiveGroup } from '../lib/AuthContext'

export function AssignPage({ onDone }: { onDone: () => void }) {
  const allPeople = useStore((s) => s.people)
  const effectiveGroup = useEffectiveGroup()
  const people = useMemo(() => filterByGroupLock(allPeople, effectiveGroup), [allPeople, effectiveGroup])
  const dutyTypes = useStore((s) => s.dutyTypes)
  const settings = useStore((s) => s.settings)
  const stats = useStore((s) => s.stats)
  const addAssignments = useStore((s) => s.addAssignments)

  const dutyById = useMemo(() => new Map(dutyTypes.map((d) => [d.id, d])), [dutyTypes])
  const groups = useMemo(
    () => [...new Set(people.map((p) => p.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk')),
    [people],
  )

  const prefs = loadUiPrefs(effectiveGroup)
  const [multiDay, setMultiDayRaw] = useState(() => prefs.assignMultiDay ?? false)
  const setMultiDay = (v: boolean) => {
    setMultiDayRaw(v)
    saveUiPrefs({ assignMultiDay: v }, effectiveGroup)
  }
  const [from, setFromRaw] = useState(() =>
    isPrefsISODate(prefs.assignFrom) ? prefs.assignFrom : addDaysISO(todayISO(), 1),
  )
  const setFrom = (v: string) => {
    setFromRaw(v)
    saveUiPrefs({ assignFrom: v }, effectiveGroup)
  }
  const [to, setToRaw] = useState(() =>
    isPrefsISODate(prefs.assignTo) ? prefs.assignTo : addDaysISO(todayISO(), 7),
  )
  const setTo = (v: string) => {
    setToRaw(v)
    saveUiPrefs({ assignTo: v }, effectiveGroup)
  }
  const dates = useMemo(() => (multiDay ? dateRange(from, to) : [from]), [multiDay, from, to])
  const myropilPlan = useMemo(
    () => resolveMyropilPlanMode(dates, settings.myropilStays ?? []),
    [dates, settings.myropilStays],
  )
  const isMyropilPlan = myropilPlan.mode === 'myropil'
  const journalId: 'myropil' | 'duties' = isMyropilPlan ? 'myropil' : 'duties'
  const duties = useMemo(
    () => activeDutyTypes(dutyTypes, journalId),
    [dutyTypes, journalId],
  )
  const [priorityOrder, setPriorityOrderRaw] = useState<string[]>(() => prefs.assignPriority ?? [])
  const setPriorityOrder = (next: string[]) => {
    setPriorityOrderRaw(next)
    saveUiPrefs({ assignPriority: next }, effectiveGroup)
  }
  /** Наряди у порядку пріоритету (зверху = №1). */
  const orderedDuties = useMemo(() => {
    const byId = new Map(duties.map((d) => [d.id, d]))
    const seen = new Set<string>()
    const out: typeof duties = []
    for (const id of priorityOrder) {
      const d = byId.get(id)
      if (d) {
        out.push(d)
        seen.add(id)
      }
    }
    for (const d of duties) {
      if (!seen.has(d.id)) out.push(d)
    }
    return out
  }, [duties, priorityOrder])

  // Підхопити нові види нарядів / прибрати видалені з пріоритету.
  useEffect(() => {
    const ids = duties.map((d) => d.id)
    setPriorityOrderRaw((prev) => {
      const keep = prev.filter((id) => ids.includes(id))
      const missing = ids.filter((id) => !keep.includes(id))
      const next = [...keep, ...missing]
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev
      saveUiPrefs({ assignPriority: next }, effectiveGroup)
      return next
    })
  }, [duties, effectiveGroup])

  const [slots, setSlotsRaw] = useState<Record<string, number>>(() => prefs.assignSlots ?? {})
  const setSlots = (updater: Record<string, number> | ((s: Record<string, number>) => Record<string, number>)) => {
    setSlotsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveUiPrefs({ assignSlots: next }, effectiveGroup)
      return next
    })
  }
  /** Скільки людей на підпункт: ключ `${dutyId}:${variantId}`. */
  const [variantSlots, setVariantSlotsRaw] = useState<Record<string, number>>(
    () => prefs.assignVariantSlots ?? {},
  )
  const [enabled, setEnabledRaw] = useState<Record<string, boolean>>(() => prefs.assignEnabled ?? {})
  const setEnabled = (
    updater: Record<string, boolean> | ((s: Record<string, boolean>) => Record<string, boolean>),
  ) => {
    setEnabledRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveUiPrefs({ assignEnabled: next }, effectiveGroup)
      return next
    })
  }
  const isOn = (id: string) => enabled[id] ?? true
  const slotsFor = (id: string, fallback: number) => slots[id] ?? fallback
  const variantSlotKey = (dutyId: string, variantId: string) => `${dutyId}:${variantId}`
  const variantSlotsFor = (dutyId: string, variantId: string, fallback = 1) =>
    variantSlots[variantSlotKey(dutyId, variantId)] ?? fallback
  const dutySlotTotal = (d: (typeof duties)[number]) => {
    const variants = leafVariants(d.variants)
    if (variants.length > 0) {
      return variants.reduce(
        (sum, v) => sum + (Number(variantSlotsFor(d.id, v.id, v.defaultSlots ?? 1)) || 0),
        0,
      )
    }
    return Number(slotsFor(d.id, effectiveSlots(d))) || 0
  }
  const [selGroups, setSelGroupsRaw] = useState<Set<string>>(
    () => new Set(prefs.assignGroups ?? []),
  )
  const setSelGroups = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setSelGroupsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveUiPrefs({ assignGroups: [...next] }, effectiveGroup)
      return next
    })
  }
  const squadRanges = settings.squadRanges ?? []
  const orderedGroupPeople = useMemo(
    () => peopleOfGroup(people, effectiveGroup),
    [people, effectiveGroup],
  )
  const [selSquads, setSelSquadsRaw] = useState<Set<string>>(
    () => new Set(prefs.assignSquads ?? []),
  )
  const setSelSquads = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setSelSquadsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveUiPrefs({ assignSquads: [...next] }, effectiveGroup)
      return next
    })
  }

  // Перезавантажити prefs при зміні робочої групи.
  useEffect(() => {
    const p = loadUiPrefs(effectiveGroup)
    setMultiDayRaw(p.assignMultiDay ?? false)
    setSlotsRaw(p.assignSlots ?? {})
    setVariantSlotsRaw(p.assignVariantSlots ?? {})
    setEnabledRaw(p.assignEnabled ?? {})
    setPriorityOrderRaw(p.assignPriority ?? [])
    setSelSquadsRaw(new Set(p.assignSquads ?? []))
    if (isPrefsISODate(p.assignFrom)) setFromRaw(p.assignFrom)
    if (isPrefsISODate(p.assignTo)) setToRaw(p.assignTo)
    if (effectiveGroup) {
      setSelGroupsRaw(new Set([effectiveGroup]))
      return
    }
    setSelGroupsRaw(new Set(p.assignGroups ?? []))
  }, [effectiveGroup])

  // Підчистити обрані відділення, якщо їх видалили з налаштувань.
  useEffect(() => {
    const ids = new Set(squadRanges.map((s) => s.id))
    setSelSquadsRaw((prev) => {
      const filtered = [...prev].filter((id) => ids.has(id))
      if (filtered.length === prev.size && filtered.every((id) => prev.has(id))) return prev
      const next = new Set(filtered)
      saveUiPrefs({ assignSquads: [...next] }, effectiveGroup)
      return next
    })
  }, [squadRanges, effectiveGroup])

  // Якщо акаунт привʼязаний до групи — фіксуємо цю групу; інакше підчищаємо.
  useEffect(() => {
    if (effectiveGroup) {
      setSelGroupsRaw(new Set([effectiveGroup]))
      saveUiPrefs({ assignGroups: [effectiveGroup] }, effectiveGroup)
      return
    }
    if (groups.length === 0) return
    setSelGroupsRaw((prev) => {
      const filtered = [...prev].filter((g) => groups.includes(g))
      if (filtered.length === prev.size && filtered.every((g) => prev.has(g))) return prev
      const next = new Set(filtered)
      saveUiPrefs({ assignGroups: [...next] }, effectiveGroup)
      return next
    })
  }, [groups, effectiveGroup])

  // У режимі Миропіль підставляємо групи з налаштувань періоду.
  useEffect(() => {
    if (!isMyropilPlan) return
    if (myropilPlan.groups.length === 0) return
    setSelGroups(new Set(myropilPlan.groups))
  }, [isMyropilPlan, myropilPlan.groups])

  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [excludeSearch, setExcludeSearch] = useState('')
  /** Тимчасові правила тегів на цей план (поверх збережених у виді наряду). */
  const [planTagRules, setPlanTagRules] = useState<
    Record<string, { excludeTags: PersonTag[]; requireTags: PersonTag[] } | undefined>
  >({})

  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [saved, setSaved] = useState<number | null>(null)

  const maxCadence = useMemo(
    () =>
      Math.max(
        0,
        ...duties.map((d) => Math.max(Number(d.cadenceDays) || 0, Number(d.periodicityDays) || 0)),
      ),
    [duties],
  )
  const dragDutyId = useRef<string | null>(null)
  const [overDutyId, setOverDutyId] = useState<string | null>(null)

  const onDutyDrop = (targetId: string) => {
    const from = dragDutyId.current
    dragDutyId.current = null
    setOverDutyId(null)
    if (!from || from === targetId) return
    const ids = orderedDuties.map((d) => d.id)
    const fromIdx = ids.indexOf(from)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, from)
    setPriorityOrder(ids)
  }

  const windowFrom = addDaysISO(dates[0] ?? from, -Math.max(settings.cooldownDays, maxCadence, 14))
  const windowTo = dates[dates.length - 1] ?? to
  const windowAssignments = useAssignmentsRange(windowFrom, windowTo)

  const data: AppData = useMemo(
    () => ({ people, dutyTypes, assignments: windowAssignments, settings }),
    [people, dutyTypes, windowAssignments, settings],
  )

  const existingOnDates = useMemo(() => {
    const set = new Set(dates)
    return windowAssignments.filter((a) => set.has(a.date))
  }, [windowAssignments, dates])

  const rulesForDuty = (dutyId: string, fallbackExclude: PersonTag[] = [], fallbackRequire: PersonTag[] = []) =>
    planTagRules[dutyId] ?? { excludeTags: fallbackExclude, requireTags: fallbackRequire }

  const cyclePlanChip = (
    dutyId: string,
    chipTags: PersonTag[],
    fallbackExclude: PersonTag[],
    fallbackRequire: PersonTag[],
  ) => {
    const cur = rulesForDuty(dutyId, fallbackExclude, fallbackRequire)
    const mode = tagChipFilterMode(chipTags, cur.excludeTags, cur.requireTags)
    const next = setTagChipFilterMode(chipTags, nextTagFilterMode(mode), cur.excludeTags, cur.requireTags)
    setPlanTagRules((s) => ({ ...s, [dutyId]: next }))
  }

  const buildPlan = () => {
    if (myropilPlan.mode === 'mixed') {
      setWarnings([
        'Дати частково в періоді Мирополю. Оберіть лише дати Мирополю або лише звичайні дні.',
      ])
      setProposals(null)
      return
    }
    const req = {
      dates,
      journalId,
      duties: orderedDuties
        .filter((d) => isOn(d.id))
        .map((d) => {
          const rules = rulesForDuty(d.id, d.excludeTags ?? [], d.requireTags ?? [])
          const variants = leafVariants(d.variants)
          if (variants.length > 0) {
            const vs: Record<string, number> = {}
            for (const v of variants) {
              vs[v.id] = Math.max(0, Number(variantSlotsFor(d.id, v.id, v.defaultSlots ?? 1)) || 0)
            }
            return {
              dutyTypeId: d.id,
              slots: Object.values(vs).reduce((a, b) => a + b, 0),
              variantSlots: vs,
              excludeTags: rules.excludeTags,
              requireTags: rules.requireTags,
            }
          }
          return {
            dutyTypeId: d.id,
            slots: Math.max(0, Number(slotsFor(d.id, effectiveSlots(d))) || 0),
            excludeTags: rules.excludeTags,
            requireTags: rules.requireTags,
          }
        }),
      groups: [...selGroups],
      excludePersonIds: [...excluded],
      onlyPersonIds:
        selSquads.size > 0 && squadRanges.length > 0
          ? [...personIdsInSquads(orderedGroupPeople, squadRanges, selSquads)]
          : undefined,
    }
    const res = planAssignments(data, req, stats)
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

  const candidatesFor = (date: string, currentPersonId: string | null, dutyTypeId: string) => {
    // поточну людину не вважаємо зайнятою цим же місцем, щоб вона залишалася обраною
    const m = new Map(plannedByPerson)
    if (currentPersonId) {
      const rest = (m.get(currentPersonId) ?? []).slice()
      const idx = rest.indexOf(date)
      if (idx >= 0) rest.splice(idx, 1)
      m.set(currentPersonId, rest)
    }
    return rankCandidates(data, date, m, stats, dutyTypeId)
  }

  const setPerson = (key: string, personId: string | null) => {
    setProposals((prev) =>
      prev
        ? prev.map((p) =>
            p.key === key ? { ...p, personId, note: personId ? 'обрано вручну' : 'не призначено' } : p,
          )
        : prev,
    )
  }

  const removeProposal = (key: string) =>
    setProposals((prev) => (prev ? prev.filter((p) => p.key !== key) : prev))

  const confirm = () => {
    if (!proposals) return
    const list = proposalsToAssignments(proposals, dutyTypes, settings.weekendMultiplier, journalId)
    addAssignments(list)
    setSaved(list.length)
    setProposals(null)
  }

  const onlySquadIds =
    selSquads.size > 0 && squadRanges.length > 0
      ? personIdsInSquads(orderedGroupPeople, squadRanges, selSquads)
      : null

  const totalSlots = duties.filter((d) => isOn(d.id)).reduce((s, d) => s + dutySlotTotal(d), 0)
  const activeCount = people.filter(
    (p) =>
      p.status === 'active' &&
      !excluded.has(p.id) &&
      (selGroups.size === 0 || selGroups.has(p.group)) &&
      (!onlySquadIds || onlySquadIds.has(p.id)),
  ).length

  if (people.length === 0) {
    return (
      <EmptyState title="Спочатку додайте людей" />
    )
  }

  const byDate = new Map<string, Proposal[]>()
  for (const p of proposals ?? []) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      {/* Параметри */}
      <div className="card flex flex-col gap-4 p-4 lg:sticky lg:top-16 lg:self-start">
        {!effectiveGroup && (
          <p className="alert-warn px-3 py-2 text-xs">
            Оберіть робочу групу в канцелярії — без неї види нарядів групи не підтягнуться.
          </p>
        )}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-fg">Коли</h2>
          <Toggle checked={multiDay} onChange={setMultiDay} label="Спланувати кілька днів" />
          <div className="mt-2 flex items-center gap-2">
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            {multiDay && (
              <>
                <span className="text-fg-faint">—</span>
                <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </>
            )}
          </div>
          {multiDay && (
            <p className="mt-1 text-xs text-fg-muted">
              {dates.length} дн. — рейтинг перераховується після кожного дня, щоб навантаження розподілялося рівно.
            </p>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-fg">Пріоритет нарядів</h2>
          <p className="mb-2 text-xs text-fg-muted">
            Перетягни рядки: зверху — призначається першим (№1), далі №2, №3…
          </p>
          <div className="max-h-[min(50vh,28rem)] overflow-y-auto overscroll-contain rounded-md border border-border">
            <div className="flex flex-col gap-0.5 p-1.5">
              {orderedDuties.map((d) => {
                const on = isOn(d.id)
                const prio = on
                  ? orderedDuties.filter((x) => isOn(x.id)).findIndex((x) => x.id === d.id) + 1
                  : null
                const rules = rulesForDuty(d.id, d.excludeTags ?? [], d.requireTags ?? [])
                return (
                  <div
                    key={d.id}
                    data-duty-row
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setOverDutyId(d.id)
                    }}
                    onDragLeave={() => setOverDutyId((id) => (id === d.id ? null : id))}
                    onDrop={(e) => {
                      e.preventDefault()
                      onDutyDrop(d.id)
                    }}
                    className={clsx(
                      'flex flex-col gap-1 rounded-md border px-2 py-1.5 transition-colors',
                      on ? 'border-border bg-surface-2/60' : 'border-transparent bg-surface-2/20 opacity-50',
                      overDutyId === d.id && 'ring-1 ring-brand-500/50 bg-brand-600/10',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="shrink-0 cursor-grab touch-none text-fg-faint active:cursor-grabbing"
                        title="Перетягнути — змінити пріоритет"
                        draggable
                        onDragStart={(e) => {
                          dragDutyId.current = d.id
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', d.id)
                          const row = e.currentTarget.closest('[data-duty-row]') as HTMLElement | null
                          if (row) {
                            const rect = row.getBoundingClientRect()
                            e.dataTransfer.setDragImage(row, Math.min(28, rect.width * 0.15), rect.height / 2)
                          }
                        }}
                        onDragEnd={() => {
                          dragDutyId.current = null
                          setOverDutyId(null)
                        }}
                      >
                        <GripVertical size={16} />
                      </button>
                      <span
                        className={clsx(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums',
                          prio ? 'bg-brand-600 text-white' : 'bg-surface-3 text-fg-faint',
                        )}
                        title={prio ? `Пріоритет №${prio}` : 'Вимкнено'}
                      >
                        {prio ?? '–'}
                      </span>
                      <input
                        type="checkbox"
                        className="accent-brand-500 shrink-0"
                        checked={on}
                        onChange={(e) => setEnabled((s) => ({ ...s, [d.id]: e.target.checked }))}
                      />
                      <div className="min-w-0 flex-1">
                        <DutyBadge duty={d} short />
                      </div>
                      <span className="shrink-0 text-[10px] text-fg-faint tabular-nums">
                        {d.isMainDuty ? '0 б.' : `${d.points} б.`}
                      </span>
                      <input
                        type="number"
                        min={0}
                        className="input w-14 shrink-0 py-0.5 text-center text-xs"
                        value={slotsFor(d.id, effectiveSlots(d))}
                        disabled={!on || (leafVariants(d.variants).length > 0)}
                        title={(leafVariants(d.variants).length > 0) ? 'Місця задаються підпунктами' : 'Кількість місць'}
                        onChange={(e) => setSlots((s) => ({ ...s, [d.id]: Number(e.target.value) }))}
                      />
                    </div>
                    {on && (d.variants?.length ?? 0) > 0 && (
                      <div className="pl-7">
                        <VariantSlotsTree
                          variants={d.variants}
                          depth={0}
                          disabled={!on}
                          slotsFor={(variantId, fallback) =>
                            variantSlotsFor(d.id, variantId, fallback)
                          }
                          onChangeSlots={(variantId, n) => {
                            const key = variantSlotKey(d.id, variantId)
                            setVariantSlotsRaw((prev) => {
                              const next = { ...prev, [key]: n }
                              saveUiPrefs({ assignVariantSlots: next }, effectiveGroup)
                              return next
                            })
                          }}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1 pl-7">
                      {TAG_FILTER_CHIPS.map((chip) => {
                        const mode = tagChipFilterMode(chip.tags, rules.excludeTags, rules.requireTags)
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            disabled={!on}
                            title={`${chip.label}: ${TAG_FILTER_MODE_META[mode].label}`}
                            className={clsx(
                              'badge cursor-pointer border uppercase',
                              mode === 'off' && 'border-border bg-surface-3 text-fg-faint',
                              mode === 'exclude' && 'border-tint-red/50 bg-tint-red/20 text-tint-red',
                              mode === 'require' &&
                                'border-tint-emerald/50 bg-tint-emerald/20 text-tint-emerald',
                            )}
                            onClick={() =>
                              cyclePlanChip(d.id, chip.tags, d.excludeTags ?? [], d.requireTags ?? [])
                            }
                          >
                            {chip.short}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-fg-faint">
            Усього місць на день: <b className="text-fg">{totalSlots}</b>, доступно: <b className="text-fg">{activeCount}</b>
          </p>
        </div>

        {groups.length > 1 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-fg">З яких груп</h2>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const on = selGroups.has(g)
                return (
                  <button
                    key={g}
                    className={clsx(
                      'badge cursor-pointer border',
                      on ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-surface-2 text-fg-muted',
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
            <p className="mt-1 text-xs text-fg-muted">Нічого не обрано — беремо всіх.</p>
          </div>
        )}

        {squadRanges.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-fg">З яких відділень</h2>
            <p className="mb-2 text-xs text-fg-muted">
              Діапазони задаються в «Налаштування → Відділення». Порожній вибір — уся група.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {squadRanges.map((s) => {
                const on = selSquads.has(s.id)
                const n = personIdsInSquads(orderedGroupPeople, [s], [s.id]).size
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={clsx(
                      'badge cursor-pointer border',
                      on
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-border bg-surface-2 text-fg-muted',
                    )}
                    onClick={() =>
                      setSelSquads((prev) => {
                        const next = new Set(prev)
                        if (next.has(s.id)) next.delete(s.id)
                        else next.add(s.id)
                        return next
                      })
                    }
                    title={`Відділення ${s.name}`}
                  >
                    {s.name || 'без назви'}
                    <span className="opacity-80">·{n}</span>
                  </button>
                )
              })}
            </div>
            {selSquads.size > 0 && (
              <p className="mt-1 text-xs text-fg-muted">
                Обрано {selSquads.size} відд. · у пулі {onlySquadIds?.size ?? 0} осіб
              </p>
            )}
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-fg">Виключити цього разу</h2>
          <input
            className="input mb-1.5"
            placeholder="знайти людину…"
            value={excludeSearch}
            onChange={(e) => setExcludeSearch(e.target.value)}
          />
          <div className="max-h-40 overflow-y-auto rounded-md border border-border">
            {people
              .filter((p) => p.status === 'active')
              .filter((p) => selGroups.size === 0 || selGroups.has(p.group))
              .filter((p) => !onlySquadIds || onlySquadIds.has(p.id))
              .filter((p) => !excludeSearch || p.name.toLowerCase().includes(excludeSearch.toLowerCase()))
              .map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-2 py-1 text-sm last:border-b-0 hover:bg-surface-2"
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
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    <span className="truncate">{p.name}</span>
                    <PersonTags tags={p.tags} />
                  </span>
                </label>
              ))}
          </div>
        </div>

        <button className="btn-primary" onClick={buildPlan} disabled={totalSlots === 0}>
          <Wand2 size={16} /> Скласти план
        </button>
        <p className="text-xs text-fg-muted">
          Перерва між нарядами: {settings.cooldownDays} дн. Змінити — у «Налаштуваннях».
        </p>
      </div>

      {/* Попередній перегляд */}
      <div className="flex flex-col gap-3">
        {saved !== null && (
          <div className="alert-ok flex items-center gap-3 p-3 text-sm">
            <Check size={18} />
            <span>
              Записано призначень: <b>{saved}</b>. Рейтинг оновлено.
            </span>
            <button className="btn-secondary btn-sm ml-auto" onClick={onDone}>
              Відкрити таблицю
            </button>
          </div>
        )}

        {existingOnDates.length > 0 && !proposals && (
          <div className="card p-3 text-sm text-fg">
            <p className="mb-1 font-medium">На обрані дати вже є записи ({existingOnDates.length}):</p>
            <p className="text-xs text-fg-muted">
              Ці люди вважатимуться зайнятими і в план не потраплять. Переглянути або видалити можна в «Журналі».
            </p>
          </div>
        )}

        {!proposals && saved === null && (
          <EmptyState title="Задайте параметри та натисніть «Скласти план»">
            Алгоритм іде зверху вниз за пріоритетом: №1 заповнюється першим, потім №2 тощо.
            Усередині наряду — хто менше ходив / менше балів (для головного — лише кількість цього наряду).
          </EmptyState>
        )}

        {proposals && (
          <>
            {warnings.length > 0 && (
              <div className="alert-warn p-3 text-sm">
                {warnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            {[...byDate.entries()].map(([date, list]) => {
              // Групуємо за видом наряду, далі малюємо дерево підпунктів.
              const byDuty = new Map<string, typeof list>()
              for (const p of list) {
                byDuty.set(p.dutyTypeId, [...(byDuty.get(p.dutyTypeId) ?? []), p])
              }
              return (
                <div key={date} className="card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2">
                    <h3 className="text-sm font-semibold text-fg capitalize">{formatHuman(date)}</h3>
                    <span className="text-xs text-fg-muted">
                      {list.filter((p) => p.personId).length}/{list.length} місць заповнено
                    </span>
                  </div>
                  <div>
                    {[...byDuty.entries()].map(([dutyId, dutyList]) => {
                      const duty = dutyById.get(dutyId)
                      const filled = dutyList.filter((p) => p.personId).length
                      const itemsByVariant = new Map<string, typeof dutyList>()
                      const noVariant: typeof dutyList = []
                      for (const p of dutyList) {
                        if (!p.variantId) noVariant.push(p)
                        else itemsByVariant.set(p.variantId, [...(itemsByVariant.get(p.variantId) ?? []), p])
                      }
                      return (
                        <div key={dutyId} className="border-b border-border last:border-b-0">
                          <div className="flex items-center gap-2 bg-surface-2 px-4 py-2">
                            <DutyBadge duty={duty} short />
                            <span className="text-[10px] text-fg-faint">
                              {filled}/{dutyList.length}
                            </span>
                          </div>
                          {noVariant.length > 0 && (
                            <ProposalSlotRows
                              date={date}
                              duty={duty}
                              items={noVariant}
                              depth={1}
                              candidatesFor={candidatesFor}
                              onSetPerson={setPerson}
                              onRemove={removeProposal}
                            />
                          )}
                          {duty && (duty.variants?.length ?? 0) > 0 ? (
                            <ProposalVariantTree
                              date={date}
                              duty={duty}
                              variants={duty.variants}
                              depth={1}
                              itemsByVariant={itemsByVariant}
                              candidatesFor={candidatesFor}
                              onSetPerson={setPerson}
                              onRemove={removeProposal}
                            />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <div className="card flex flex-wrap items-center gap-2 p-3">
              <button className="btn-secondary" onClick={buildPlan}>
                <RefreshCw size={14} /> Перерахувати
              </button>
              <span className="text-sm text-fg-muted">
                Буде записано: <b className="text-fg">{proposals.filter((p) => p.personId).length}</b> призначень
                {proposals.some((p) => !p.personId) && (
                  <span className="ml-1 text-tint-red">(порожні місця не записуються)</span>
                )}
              </span>
              <button
                className="btn-primary ml-auto"
                onClick={confirm}
                disabled={proposals.every((p) => !p.personId)}
              >
                <Check size={16} /> Підтвердити та записати
              </button>
            </div>

            <p className="text-xs text-fg-muted">
              У випадному списку люди відсортовані так само, як їх обирає алгоритм. Можна замінити будь-кого вручну
              — бали нарахуються тому, кого врешті записано.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** Дерево підпунктів для кількості місць (з відступами). */
function VariantSlotsTree({
  variants,
  depth,
  disabled,
  slotsFor,
  onChangeSlots,
}: {
  variants: DutyVariant[]
  depth: number
  disabled?: boolean
  slotsFor: (variantId: string, fallback: number) => number
  onChangeSlots: (variantId: string, n: number) => void
}) {
  return (
    <div className={clsx('flex flex-col gap-0.5', depth > 0 && 'ml-3 border-l border-border/70 pl-2')}>
      {variants.map((v) => {
        const kids = v.children ?? []
        const hasChildren = kids.length > 0
        const leafSum = hasChildren
          ? leafVariants([v]).reduce(
              (s, leaf) => s + (Number(slotsFor(leaf.id, leaf.defaultSlots ?? 1)) || 0),
              0,
            )
          : 0
        return (
          <div key={v.id}>
            <div className="flex items-center gap-2 py-0.5">
              <span
                className={clsx(
                  'min-w-0 flex-1 truncate text-xs',
                  hasChildren ? 'font-medium text-fg' : 'text-fg-muted',
                )}
                title={v.name}
              >
                {v.short || v.name}
              </span>
              {hasChildren ? (
                <span
                  className="w-14 shrink-0 text-center text-[10px] tabular-nums text-fg-faint"
                  title="Сума місць у вкладених"
                >
                  Σ{leafSum}
                </span>
              ) : (
                <input
                  type="number"
                  min={0}
                  disabled={disabled}
                  className="input w-14 shrink-0 py-0.5 text-center text-xs"
                  value={slotsFor(v.id, v.defaultSlots ?? 1)}
                  title={`Осіб на ${v.short || v.name}`}
                  onChange={(e) => onChangeSlots(v.id, Number(e.target.value))}
                />
              )}
            </div>
            {hasChildren && (
              <VariantSlotsTree
                variants={kids}
                depth={depth + 1}
                disabled={disabled}
                slotsFor={slotsFor}
                onChangeSlots={onChangeSlots}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

type ProposalItem = Proposal

function ProposalSlotRows({
  date,
  duty,
  items,
  depth,
  candidatesFor,
  onSetPerson,
  onRemove,
}: {
  date: string
  duty: DutyType | undefined
  items: ProposalItem[]
  depth: number
  candidatesFor: (
    date: string,
    currentPersonId: string | null,
    dutyTypeId: string,
  ) => ReturnType<typeof rankCandidates>
  onSetPerson: (key: string, personId: string | null) => void
  onRemove: (key: string) => void
}) {
  return (
    <>
      {items.map((p) => {
        const cands = candidatesFor(date, p.personId, p.dutyTypeId)
        return (
          <div
            key={p.key}
            className={clsx(
              'flex flex-wrap items-center gap-2 border-b border-border/30 py-1.5 last:border-b-0 sm:flex-nowrap',
              !p.personId && 'bg-tint-red/10',
            )}
            style={{ paddingLeft: `${0.75 + depth * 0.75}rem`, paddingRight: '1rem' }}
          >
            <select
              className={clsx('input min-w-48 flex-1', !p.personId && 'border-tint-red')}
              value={p.personId ?? ''}
              onChange={(e) => onSetPerson(p.key, e.target.value || null)}
            >
              <option value="">— не призначено —</option>
              {cands.map((c) => (
                <option
                  key={c.person.id}
                  value={c.person.id}
                  disabled={!c.available && c.person.id !== p.personId}
                >
                  {c.person.name}
                  {(c.person.tags ?? []).map((t) => ` (${PERSON_TAG_META[t]?.short ?? t})`).join('')}
                  {' · '}
                  {duty?.isMainDuty
                    ? `${c.dutyCount}×`
                    : `${c.points} б. · ${c.totalCount} призн. · №${c.groupNo}`}
                  {c.busy && c.person.id !== p.personId ? ' · ЗАЙНЯТИЙ' : ''}
                  {!c.available ? ' · не в наявності' : ''}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost btn-sm text-tint-red"
              title="Прибрати місце з плану"
              onClick={() => onRemove(p.key)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
    </>
  )
}

/** Дерево результатів плану: ПГД → Г12 → СХ → люди. */
function ProposalVariantTree({
  date,
  duty,
  variants,
  depth,
  itemsByVariant,
  candidatesFor,
  onSetPerson,
  onRemove,
}: {
  date: string
  duty: DutyType
  variants: DutyVariant[]
  depth: number
  itemsByVariant: Map<string, ProposalItem[]>
  candidatesFor: (
    date: string,
    currentPersonId: string | null,
    dutyTypeId: string,
  ) => ReturnType<typeof rankCandidates>
  onSetPerson: (key: string, personId: string | null) => void
  onRemove: (key: string) => void
}) {
  return (
    <div>
      {variants.map((v) => {
        const kids = v.children ?? []
        const hasChildren = kids.length > 0
        const leafIds = hasChildren ? leafVariants([v]).map((x) => x.id) : [v.id]
        const leafItems = leafIds.flatMap((id) => itemsByVariant.get(id) ?? [])
        if (leafItems.length === 0 && !hasChildren) return null
        // Пропускаємо гілку без жодного місця в плані
        if (leafItems.length === 0) return null
        const filled = leafItems.filter((p) => p.personId).length
        const direct = itemsByVariant.get(v.id) ?? []
        return (
          <div key={v.id}>
            <div
              className="flex items-center gap-2 border-b border-border/40 bg-surface/40 py-1.5"
              style={{ paddingLeft: `${0.75 + depth * 0.75}rem`, paddingRight: '1rem' }}
            >
              <span
                className={clsx(
                  'badge border text-xs',
                  hasChildren
                    ? 'border-brand-600/40 bg-brand-600/15 text-tint-brand'
                    : 'border-border bg-surface-3 text-fg',
                )}
                title={v.name}
              >
                {v.short || v.name}
              </span>
              <span className="text-[10px] text-fg-faint">
                {filled}/{leafItems.length}
              </span>
            </div>
            {!hasChildren && (
              <ProposalSlotRows
                date={date}
                duty={duty}
                items={direct}
                depth={depth + 1}
                candidatesFor={candidatesFor}
                onSetPerson={onSetPerson}
                onRemove={onRemove}
              />
            )}
            {hasChildren && (
              <ProposalVariantTree
                date={date}
                duty={duty}
                variants={kids}
                depth={depth + 1}
                itemsByVariant={itemsByVariant}
                candidatesFor={candidatesFor}
                onSetPerson={onSetPerson}
                onRemove={onRemove}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
