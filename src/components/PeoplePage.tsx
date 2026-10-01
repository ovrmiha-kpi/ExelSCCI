import { useEffect, useMemo, useState, Fragment } from 'react'
import { ClipboardPaste, Pencil, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import type { Person, PersonStatus, PersonTag } from '../types'
import { PERSON_STATUS_LABEL, PERSON_STATUS_OPTIONS, PERSON_TAG_META, PERSON_TAGS } from '../types'
import { sortedDutyTypes, statsFromRows } from '../lib/stats'
import { todayISO } from '../lib/dates'
import { parsePeopleList } from '../lib/export'
import { EmptyState, Field, Modal, PersonTags, Segmented, Toggle } from './ui'
import { filterByGroupLock } from '../lib/auth'
import { useEffectiveGroup } from '../lib/AuthContext'
import { loadUiPrefs, saveUiPrefs } from '../lib/uiPrefs'

const STATUSES = PERSON_STATUS_OPTIONS

type SortKey = 'group' | 'name' | 'points' | 'count'
const SORT_KEYS: SortKey[] = ['group', 'name', 'points', 'count']

export function PeoplePage() {
  const allPeople = useStore((s) => s.people)
  const effectiveGroup = useEffectiveGroup()
  const people = useMemo(() => filterByGroupLock(allPeople, effectiveGroup), [allPeople, effectiveGroup])
  const statRows = useStore((s) => s.stats)
  const addPerson = useStore((s) => s.addPerson)
  const addPeopleBulk = useStore((s) => s.addPeopleBulk)
  const updatePerson = useStore((s) => s.updatePerson)
  const removePerson = useStore((s) => s.removePerson)

  const prefs = loadUiPrefs(effectiveGroup)
  const [editing, setEditing] = useState<Person | 'new' | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [search, setSearchRaw] = useState(() => prefs.peopleSearch ?? '')
  const setSearch = (v: string) => {
    setSearchRaw(v)
    saveUiPrefs({ peopleSearch: v }, effectiveGroup)
  }
  const [groupFilter, setGroupFilter] = useState(() => effectiveGroup ?? '')
  const [sortKey, setSortKeyRaw] = useState<SortKey>(() =>
    SORT_KEYS.includes(prefs.peopleSortKey as SortKey) ? (prefs.peopleSortKey as SortKey) : 'group',
  )
  const setSortKey = (k: SortKey) => {
    setSortKeyRaw(k)
    saveUiPrefs({ peopleSortKey: k }, effectiveGroup)
  }
  const [sortDesc, setSortDescRaw] = useState(() => prefs.peopleSortDesc ?? false)
  const setSortDesc = (v: boolean | ((prev: boolean) => boolean)) => {
    setSortDescRaw((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      saveUiPrefs({ peopleSortDesc: next }, effectiveGroup)
      return next
    })
  }

  useEffect(() => {
    const p = loadUiPrefs(effectiveGroup)
    if (effectiveGroup) setGroupFilter(effectiveGroup)
    setSearchRaw(p.peopleSearch ?? '')
    setSortKeyRaw(SORT_KEYS.includes(p.peopleSortKey as SortKey) ? (p.peopleSortKey as SortKey) : 'group')
    setSortDescRaw(p.peopleSortDesc ?? false)
  }, [effectiveGroup])

  const stats = useMemo(() => statsFromRows(people, statRows, todayISO()), [people, statRows])

  const groups = useMemo(
    () => [...new Set(people.map((p) => p.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk')),
    [people],
  )

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = [...people].filter((p) => {
      if (groupFilter && p.group !== groupFilter) return false
      if (q && !p.name.toLowerCase().includes(q) && !p.group.toLowerCase().includes(q)) return false
      return true
    })
    const dir = sortDesc ? -1 : 1
    filtered.sort((a, b) => {
      if (sortKey === 'group') {
        const g = a.group.localeCompare(b.group, 'uk') || a.name.localeCompare(b.name, 'uk')
        return g * dir
      }
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'uk') * dir
      if (sortKey === 'points') {
        const pa = stats.get(a.id)?.points ?? 0
        const pb = stats.get(b.id)?.points ?? 0
        return (pa - pb || a.name.localeCompare(b.name, 'uk')) * dir
      }
      const ca = stats.get(a.id)?.count ?? 0
      const cb = stats.get(b.id)?.count ?? 0
      return (ca - cb || a.name.localeCompare(b.name, 'uk')) * dir
    })
    return filtered
  }, [people, search, groupFilter, sortKey, sortDesc, stats])

  const bulkParsed = useMemo(() => parsePeopleList(bulkText), [bulkText])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <input
          className="input w-56"
          placeholder="Пошук"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {groups.length > 0 && !effectiveGroup && (
          <select
            className="input w-40"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            title="Фільтр за групою"
          >
            <option value="">Усі групи</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        {effectiveGroup && (
          <span className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-fg-muted">
            Група: {effectiveGroup}
          </span>
        )}
        <Segmented
          value={sortKey}
          onChange={(k) => {
            setSortKey(k)
            setSortDesc(false)
          }}
          options={[
            ['group', 'За групою'],
            ['name', 'За ПІБ'],
            ['points', 'За балами'],
            ['count', 'За нарядами'],
          ]}
        />
        <button
          type="button"
          className="btn-ghost btn-sm"
          title={sortDesc ? 'За зростанням' : 'За спаданням'}
          onClick={() => setSortDesc((d) => !d)}
        >
          {sortDesc ? '↓' : '↑'}
        </button>
        <span className="text-sm text-fg-faint">
          {list.length}/{people.length} · в наявності {people.filter((p) => p.status === 'active').length}
        </span>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary" onClick={() => setBulkOpen(true)}>
            <ClipboardPaste size={14} /> Вставити список
          </button>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={14} /> Додати
          </button>
        </div>
      </div>

      {people.length === 0 ? (
        <EmptyState title="Список особового складу порожній">
          Натисніть «Вставити список» і скопіюйте ПІБ зі своєї Excel-таблиці — по одному в рядку. Можна додати
          групу та стартові бали через крапку з комою: <code>Шевченко Т.Г.;1 взвод;12</code>
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th
                  className="th cursor-pointer hover:bg-surface-3"
                  onClick={() => toggleSort('name')}
                >
                  ПІБ {sortKey === 'name' ? (sortDesc ? '↓' : '↑') : ''}
                </th>
                <th
                  className="th cursor-pointer hover:bg-surface-3"
                  onClick={() => toggleSort('group')}
                >
                  Група {sortKey === 'group' ? (sortDesc ? '↓' : '↑') : ''}
                </th>
                <th className="th">Статус</th>
                <th
                  className="th cursor-pointer text-center hover:bg-surface-3"
                  onClick={() => toggleSort('count')}
                >
                  Нарядів {sortKey === 'count' ? (sortDesc ? '↓' : '↑') : ''}
                </th>
                <th
                  className="th cursor-pointer text-center hover:bg-surface-3"
                  onClick={() => toggleSort('points')}
                >
                  Бали {sortKey === 'points' ? (sortDesc ? '↓' : '↑') : ''}
                </th>
                <th className="th">Примітка</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => {
                const s = stats.get(p.id)
                const prev = list[i - 1]
                const showGroupBreak = sortKey === 'group' && (!prev || prev.group !== p.group)
                return (
                  <Fragment key={p.id}>
                    {showGroupBreak && (
                      <tr className="bg-surface-2/80">
                        <td colSpan={7} className="td py-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                          {p.group || 'Без групи'}
                        </td>
                      </tr>
                    )}
                    <tr className="hover:bg-surface-2">
                    <td className="td font-medium">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {p.name}
                        <PersonTags tags={p.tags} />
                        {(p.excludedDutyIds?.length ?? 0) > 0 && (
                          <span
                            className="badge bg-tint-amber/15 text-tint-amber"
                            title="Не йде на деякі наряди"
                          >
                            викл. {p.excludedDutyIds.length}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="td text-fg-muted">{p.group || '—'}</td>
                    <td className="td">
                      <select
                        className="input w-44 py-0.5"
                        value={p.status}
                        onChange={(e) => updatePerson(p.id, { status: e.target.value as PersonStatus })}
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {PERSON_STATUS_LABEL[st]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td text-center tabular-nums">{s?.count ?? 0}</td>
                    <td className="td text-center tabular-nums">{s?.points ?? 0}</td>
                    <td className="td max-w-56 truncate text-xs text-fg-faint">{p.note}</td>
                    <td className="td text-right whitespace-nowrap">
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(p)}>
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn-ghost btn-sm text-tint-red"
                        onClick={() => {
                          const n = s?.count ?? 0
                          if (
                            confirm(
                              `Видалити ${p.name}?${n ? ` Разом з ним видаляться ${n} записів про наряди.` : ''}`,
                            )
                          )
                            removePerson(p.id)
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <PersonForm
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        person={editing === 'new' ? null : editing}
        open={editing !== null}
        groups={groups}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing === 'new') addPerson(data)
          else if (editing) updatePerson(editing.id, data)
          setEditing(null)
        }}
      />

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Вставити список людей"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkOpen(false)}>
              Скасувати
            </button>
            <button
              className="btn-primary"
              disabled={bulkParsed.length === 0}
              onClick={() => {
                const n = addPeopleBulk(bulkParsed)
                setBulkOpen(false)
                setBulkText('')
                alert(
                  `Додано: ${n}.${bulkParsed.length - n > 0 ? ` Пропущено дублікатів: ${bulkParsed.length - n}.` : ''}`,
                )
              }}
            >
              Додати {bulkParsed.length > 0 ? `(${bulkParsed.length})` : ''}
            </button>
          </>
        }
      >
        <p className="mb-2 text-sm text-fg-muted">
          По одній людині в рядку. Через <code>;</code>, табуляцію або кому можна вказати групу та стартові бали:{' '}
          <code>ПІБ;Група;Бали</code>. Позначки в ПІБ: <code>(ж)</code>, <code>(к)</code>, <code>(кв)</code>,{' '}
          <code>(кг)</code>.
        </p>
        <textarea
          className="input h-56 font-mono text-xs"
          placeholder={'Шевченко Т.Г.;1 взвод;12\nКоваленко О.В.;1 взвод\nБондаренко І.М.'}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        {bulkParsed.length > 0 && (
          <p className="mt-2 text-xs text-fg-faint">
            Розпізнано: {bulkParsed.length}. Приклад: <b>{bulkParsed[0].name}</b>
            {bulkParsed[0].group && ` · ${bulkParsed[0].group}`}
            {bulkParsed[0].basePoints !== 0 && ` · ${bulkParsed[0].basePoints} б.`}
            {bulkParsed[0].tags.length > 0 &&
              ` · ${bulkParsed[0].tags.map((t) => PERSON_TAG_META[t].short).join('')}`}
          </p>
        )}
      </Modal>
    </div>
  )
}

function PersonForm({
  person,
  open,
  groups,
  onClose,
  onSave,
}: {
  person: Person | null
  open: boolean
  groups: string[]
  onClose: () => void
  onSave: (data: Omit<Person, 'id' | 'createdAt'>) => void
}) {
  const dutyTypes = useStore((s) => s.dutyTypes)
  const duties = useMemo(() => sortedDutyTypes(dutyTypes).filter((d) => !d.archived), [dutyTypes])
  const [name, setName] = useState(person?.name ?? '')
  const [group, setGroup] = useState(person?.group ?? '')
  const [status, setStatus] = useState<PersonStatus>(person?.status ?? 'active')
  const [basePoints, setBasePoints] = useState(String(person?.basePoints ?? 0))
  const [note, setNote] = useState(person?.note ?? '')
  const [tags, setTags] = useState<PersonTag[]>(person?.tags ?? [])
  const [excludedDutyIds, setExcludedDutyIds] = useState<string[]>(person?.excludedDutyIds ?? [])

  const toggleDuty = (id: string, on: boolean) => {
    setExcludedDutyIds((prev) => (on ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id)))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={person ? 'Редагувати' : 'Нова людина'}
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Скасувати
          </button>
          <button
            className="btn-primary"
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                group: group.trim(),
                status,
                basePoints: Number(basePoints) || 0,
                note: note.trim(),
                tags,
                excludedDutyIds,
              })
            }
          >
            Зберегти
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="ПІБ">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Група / підрозділ">
            <input
              className="input"
              value={group}
              list="groups-list"
              onChange={(e) => setGroup(e.target.value)}
              placeholder="напр. 1 взвод"
            />
            <datalist id="groups-list">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="Статус">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as PersonStatus)}>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {PERSON_STATUS_LABEL[st]}
                </option>
              ))}
            </select>
          </Field>
        </div>
          <Field label="Початкові бали">
            <input
              type="number"
              step="0.5"
              className="input"
              value={basePoints}
              onChange={(e) => setBasePoints(e.target.value)}
            />
          </Field>
        <div>
          <span className="label">Позначки</span>
          <div className="flex flex-col gap-2 pt-1">
            {PERSON_TAGS.map((tag) => {
              const m = PERSON_TAG_META[tag]
              return (
                <Toggle
                  key={tag}
                  checked={tags.includes(tag)}
                  onChange={(on) =>
                    setTags((prev) =>
                      on ? [...prev.filter((t) => t !== tag), tag] : prev.filter((t) => t !== tag),
                    )
                  }
                  label={`${m.short} — ${m.label.toLowerCase()}`}
                />
              )
            })}
          </div>
        </div>
        {duties.length > 0 && (
          <div>
            <span className="label">Не йде на ці наряди (за замовчуванням)</span>
            <div className="flex flex-wrap gap-1.5">
              {duties.map((d) => {
                const on = excludedDutyIds.includes(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={clsx(
                      'badge cursor-pointer border',
                      on ? 'border-tint-red/50 bg-tint-red/15 text-tint-red' : 'border-border bg-surface-2 text-fg-muted',
                    )}
                    onClick={() => toggleDuty(d.id, !on)}
                    title={on ? 'Не йде' : 'Йде'}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <Field label="Примітка">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
