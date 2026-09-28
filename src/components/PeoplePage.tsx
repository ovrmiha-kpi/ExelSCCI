import { useMemo, useState } from 'react'
import { ClipboardPaste, Pencil, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { Person, PersonStatus } from '../types'
import { PERSON_STATUS_LABEL } from '../types'
import { computeStats } from '../lib/stats'
import { todayISO } from '../lib/dates'
import { parsePeopleList } from '../lib/export'
import { EmptyState, Field, Modal } from './ui'

const STATUSES = Object.keys(PERSON_STATUS_LABEL) as PersonStatus[]

export function PeoplePage() {
  const people = useStore((s) => s.people)
  const assignments = useStore((s) => s.assignments)
  const addPerson = useStore((s) => s.addPerson)
  const addPeopleBulk = useStore((s) => s.addPeopleBulk)
  const updatePerson = useStore((s) => s.updatePerson)
  const removePerson = useStore((s) => s.removePerson)

  const [editing, setEditing] = useState<Person | 'new' | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [search, setSearch] = useState('')

  const stats = useMemo(() => computeStats(people, assignments, {}, todayISO()), [people, assignments])

  const groups = useMemo(() => [...new Set(people.map((p) => p.group).filter(Boolean))].sort(), [people])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...people]
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.group.toLowerCase().includes(q))
      .sort((a, b) => a.group.localeCompare(b.group, 'uk') || a.name.localeCompare(b.name, 'uk'))
  }, [people, search])

  const bulkParsed = useMemo(() => parsePeopleList(bulkText), [bulkText])

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <input
          className="input w-56"
          placeholder="Пошук"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-sm text-slate-500">
          {people.length} осіб · у строю {people.filter((p) => p.status === 'active').length}
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
                <th className="th">ПІБ</th>
                <th className="th">Група</th>
                <th className="th">Статус</th>
                <th className="th text-center">Нарядів</th>
                <th className="th text-center">Бали</th>
                <th className="th">Примітка</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = stats.get(p.id)
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="td font-medium">{p.name}</td>
                    <td className="td text-slate-600">{p.group || '—'}</td>
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
                    <td className="td max-w-56 truncate text-xs text-slate-500">{p.note}</td>
                    <td className="td text-right whitespace-nowrap">
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(p)}>
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn-ghost btn-sm text-red-600"
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
        <p className="mb-2 text-sm text-slate-600">
          По одній людині в рядку. Через <code>;</code>, табуляцію або кому можна вказати групу та стартові бали:{' '}
          <code>ПІБ;Група;Бали</code>. Скопійовані з Excel колонки підійдуть як є.
        </p>
        <textarea
          className="input h-56 font-mono text-xs"
          placeholder={'Шевченко Т.Г.;1 взвод;12\nКоваленко О.В.;1 взвод\nБондаренко І.М.'}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        {bulkParsed.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Розпізнано: {bulkParsed.length}. Приклад: <b>{bulkParsed[0].name}</b>
            {bulkParsed[0].group && ` · ${bulkParsed[0].group}`}
            {bulkParsed[0].basePoints !== 0 && ` · ${bulkParsed[0].basePoints} б.`}
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
  const [name, setName] = useState(person?.name ?? '')
  const [group, setGroup] = useState(person?.group ?? '')
  const [status, setStatus] = useState<PersonStatus>(person?.status ?? 'active')
  const [basePoints, setBasePoints] = useState(String(person?.basePoints ?? 0))
  const [note, setNote] = useState(person?.note ?? '')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={person ? 'Редагувати' : 'Нова людина'}
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
        <Field
          label="Початкові бали"
          hint="Якщо переносите облік з Excel — впишіть сюди накопичені бали, щоб рейтинг не обнулився."
        >
          <input
            type="number"
            step="0.5"
            className="input"
            value={basePoints}
            onChange={(e) => setBasePoints(e.target.value)}
          />
        </Field>
        <Field label="Примітка">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
