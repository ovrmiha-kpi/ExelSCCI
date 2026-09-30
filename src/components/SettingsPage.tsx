import { useRef, useState, useMemo } from 'react'
import { Download, FlaskConical, Plus, Trash2, Upload, Users } from 'lucide-react'
import clsx from 'clsx'
import { parseImportedData, useStore } from '../store'
import { exportJSON, readFileAsText } from '../lib/export'
import { loadAll } from '../db'
import { useAssignmentCount } from '../lib/queries'
import { newMyropilStay } from '../lib/myropil'
import { newSquadRange, peopleInSquad, peopleOfGroup, squadLabel } from '../lib/squads'
import { Field, PersonTags, Segmented, Toggle } from './ui'
import { THEME_META, type ThemeId } from '../types'
import { DutyTypesEditor } from './DutyTypesPage'
import { todayISO, addDaysISO } from '../lib/dates'
import { canManageUsers } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'
import { AccountsAdmin } from './AccountsAdmin'

export function SettingsPage() {
  const { session, effectiveGroup, setActiveGroup, apiMode } = useAuth()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const replaceAll = useStore((s) => s.replaceAll)
  const resetAll = useStore((s) => s.resetAll)
  const loadDemo = useStore((s) => s.loadDemo)
  const loadGroupC55 = useStore((s) => s.loadGroupC55)
  const people = useStore((s) => s.people)
  const peopleCount = people.length
  const dutyCount = useStore((s) => s.dutyTypes.length)
  const assignmentCount = useAssignmentCount()
  const counts = { p: peopleCount, d: dutyCount, a: assignmentCount }
  const allGroups = [...new Set(people.map((p) => p.group).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'uk'),
  )
  const stays = settings.myropilStays ?? []
  const squadRanges = settings.squadRanges ?? []
  const locked = Boolean(session?.groupLock)
  const canEditGroup = Boolean(effectiveGroup)
  const groupPeople = useMemo(
    () => peopleOfGroup(people, effectiveGroup),
    [people, effectiveGroup],
  )
  /** Кандидати на кв — усі з позначкою кв у списку групи (без привʼязки до діапазону відділення). */
  const kvCandidates = useMemo(
    () => groupPeople.filter((p) => (p.tags ?? []).includes('commander')),
    [groupPeople],
  )

  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const patchSettings = (patch: Parameters<typeof updateSettings>[0]) => {
    if (!canEditGroup && !('theme' in patch)) return
    updateSettings(patch)
  }

  const setSquadCommander = (squadId: string, commanderPersonId: string | null) => {
    patchSettings({
      squadRanges: squadRanges.map((s) =>
        s.id === squadId ? { ...s, commanderPersonId } : s,
      ),
    })
  }

  const onImport = async (file: File) => {
    try {
      const text = await readFileAsText(file)
      const data = parseImportedData(JSON.parse(text))
      const targetGroup = effectiveGroup
      if (!targetGroup) {
        setMsg('Спочатку оберіть робочу групу в канцелярії — імпорт піде в цю групу.')
        return
      }
      const remapped = {
        ...data,
        people: data.people.map((p) => ({ ...p, group: targetGroup })),
        dutyTypes: data.dutyTypes.map((d) => ({ ...d, group: targetGroup })),
      }
      if (
        !confirm(
          `Замінити дані групи «${targetGroup}»? У файлі: ${remapped.people.length} осіб, ${remapped.dutyTypes.length} видів нарядів, ${remapped.assignments.length} записів.` +
            (apiMode ? ' Дані буде збережено на сервері.' : ''),
        )
      )
        return
      replaceAll(remapped)
      setMsg(
        apiMode
          ? `Дані групи «${targetGroup}» відновлено з файлу і синхронізовано з сервером.`
          : `Дані групи «${targetGroup}» відновлено з файлу.`,
      )
    } catch (e) {
      setMsg(`Помилка імпорту: ${(e as Error).message}`)
    }
  }

  return (
    <>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="card flex flex-col gap-3 p-4 lg:col-span-2">
        <h2 className="text-sm font-semibold text-fg">Канцелярія — робоча група</h2>
        <p className="text-xs text-fg-muted">
          Налаштування, види нарядів і журнал синхронізовані з обраною групою: що зміните тут — те саме
          побачите в таблиці, журналі й автопризначенні.
        </p>
        {locked ? (
          <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg">
            Доступ лише до групи: <strong>{session?.groupLock}</strong>
          </p>
        ) : (
          <Field label="Робоча група">
            <select
              className="input max-w-md"
              value={effectiveGroup ?? ''}
              onChange={(e) => setActiveGroup(e.target.value || null)}
            >
              <option value="">— оберіть групу —</option>
              {allGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!effectiveGroup && !locked && (
          <p className="text-xs text-tint-amber">
            Без робочої групи не можна змінювати правила нарядів і види нарядів групи.
          </p>
        )}
      </section>

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-fg">Оформлення</h2>
        <Field label="Тема">
          <Segmented
            value={settings.theme}
            onChange={(v) => patchSettings({ theme: v })}
            options={(Object.keys(THEME_META) as ThemeId[]).map((id) => [id, THEME_META[id].label])}
          />
        </Field>
      </section>

      <section
        className={clsx('card flex flex-col gap-4 p-4', !canEditGroup && 'pointer-events-none opacity-50')}
      >
        <h2 className="text-sm font-semibold text-fg">Правила автопризначення</h2>

        <Field label="Глобальна перерва між будь-якими нарядами, днів">
          <input
            type="number"
            min={0}
            max={30}
            className="input w-32"
            value={settings.cooldownDays}
            onChange={(e) => patchSettings({ cooldownDays: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>

        <Field label="Множник балів у вихідні (сб / нд)">
          <input
            type="number"
            min={1}
            max={5}
            step={0.01}
            className="input w-32"
            value={settings.weekendMultiplier}
            onChange={(e) =>
              patchSettings({ weekendMultiplier: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </Field>

        <Toggle
          checked={settings.avoidRepeatDuty}
          onChange={(v) => patchSettings({ avoidRepeatDuty: v })}
          label="За рівного рейтингу не ставити в той самий наряд, що й минулого разу"
        />
        <Toggle
          checked={settings.randomTies}
          onChange={(v) => patchSettings({ randomTies: v })}
          label="Повні нічиї розбивати випадково (інакше — за алфавітом)"
        />
      </section>

      <section
        className={clsx(
          'card flex flex-col gap-4 p-4 lg:col-span-2',
          !canEditGroup && 'pointer-events-none opacity-50',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-fg">Відділення</h2>
            <p className="mt-0.5 text-xs text-fg-muted">
              Діапазон людей у списку групи (№ за порядком додавання). Кв обирається зі списку
              людей з позначкою «кв» (без привʼязки до діапазону). У «Призначити» можна брати
              людей лише з обраних відділень.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={groupPeople.length === 0}
            onClick={() => {
              const first = groupPeople[0]
              const last = groupPeople[groupPeople.length - 1]
              patchSettings({
                squadRanges: [
                  ...squadRanges,
                  newSquadRange({
                    name: String(squadRanges.length + 1),
                    fromPersonId: first?.id ?? '',
                    toPersonId: last?.id ?? '',
                  }),
                ],
              })
            }}
          >
            <Plus size={14} /> Додати відділення
          </button>
        </div>

        {groupPeople.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-fg-faint">
            Оберіть робочу групу з людьми, щоб задати відділення.
          </p>
        ) : squadRanges.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-fg-faint">
            Відділень ще немає. Додайте, наприклад: 1-ше — з першої по N-ту людину в списку.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {squadRanges.map((squad, idx) => {
              const members = peopleInSquad(groupPeople, squad)
              return (
                <div
                  key={squad.id}
                  className="flex flex-col gap-2 rounded-md border border-border bg-surface-2/50 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-fg-muted">Відд. {idx + 1}</span>
                    <input
                      className="input w-28"
                      placeholder="назва"
                      value={squad.name}
                      onChange={(e) => {
                        const name = e.target.value
                        patchSettings({
                          squadRanges: squadRanges.map((s) =>
                            s.id === squad.id ? { ...s, name } : s,
                          ),
                        })
                      }}
                    />
                    <span className="text-xs text-fg-faint">з</span>
                    <select
                      className="input min-w-44 flex-1"
                      value={squad.fromPersonId}
                      onChange={(e) => {
                        const fromPersonId = e.target.value
                        patchSettings({
                          squadRanges: squadRanges.map((s) =>
                            s.id === squad.id ? { ...s, fromPersonId } : s,
                          ),
                        })
                      }}
                    >
                      {groupPeople.map((p, i) => (
                        <option key={p.id} value={p.id}>
                          №{i + 1} {p.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-fg-faint">по</span>
                    <select
                      className="input min-w-44 flex-1"
                      value={squad.toPersonId}
                      onChange={(e) => {
                        const toPersonId = e.target.value
                        patchSettings({
                          squadRanges: squadRanges.map((s) =>
                            s.id === squad.id ? { ...s, toPersonId } : s,
                          ),
                        })
                      }}
                    >
                      {groupPeople.map((p, i) => (
                        <option key={p.id} value={p.id}>
                          №{i + 1} {p.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-fg-faint">кв</span>
                    <select
                      className="input min-w-44 flex-1"
                      value={squad.commanderPersonId ?? ''}
                      onChange={(e) => setSquadCommander(squad.id, e.target.value || null)}
                      title="Командир відділення (з позначених кв у списку людей)"
                    >
                      <option value="">— не вказано —</option>
                      {kvCandidates.map((p) => {
                        const n = groupPeople.findIndex((x) => x.id === p.id)
                        return (
                          <option key={p.id} value={p.id}>
                            №{n + 1} {p.name}
                          </option>
                        )
                      })}
                      {squad.commanderPersonId &&
                        !kvCandidates.some((p) => p.id === squad.commanderPersonId) && (
                          <option value={squad.commanderPersonId}>
                            {groupPeople.find((p) => p.id === squad.commanderPersonId)?.name ??
                              'Обрано (без позначки кв)'}
                          </option>
                        )}
                    </select>
                    <button
                      type="button"
                      className="btn-ghost btn-sm ml-auto text-tint-red"
                      title="Видалити відділення"
                      onClick={() =>
                        patchSettings({
                          squadRanges: squadRanges.filter((s) => s.id !== squad.id),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-fg-muted" title={squadLabel(squad, groupPeople)}>
                    {members.length === 0 ? (
                      'Діапазон некоректний або люди видалені'
                    ) : (
                      <>
                        {members.length} осіб:{' '}
                        <span className="text-fg">
                          {members[0].name}
                          {members.length > 1 ? ` — ${members[members.length - 1].name}` : ''}
                        </span>
                        {squad.commanderPersonId && (
                          <span className="ml-2 inline-flex items-center gap-1">
                            кв:{' '}
                            <span className="inline-flex items-center gap-0.5 text-fg">
                              {groupPeople.find((p) => p.id === squad.commanderPersonId)?.name ?? '—'}
                              <PersonTags tags={['commander']} />
                            </span>
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {groupPeople.length > 0 && (
          <details className="rounded-md border border-border bg-surface-2/30 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-fg-muted">
              Список групи ({groupPeople.length}) — порядок №
            </summary>
            <ol className="mt-2 max-h-48 list-decimal overflow-y-auto pl-5 text-sm text-fg">
              {groupPeople.map((p) => (
                <li key={p.id} className="py-0.5">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {p.name}
                    <PersonTags tags={p.tags} />
                  </span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>

      <section
        className={clsx(
          'card flex flex-col gap-4 p-4 lg:col-span-2',
          !canEditGroup && 'pointer-events-none opacity-50',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-fg">Миропіль — періоди й групи</h2>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              const from = todayISO()
              patchSettings({
                myropilStays: [
                  ...stays,
                  newMyropilStay({ from, to: addDaysISO(from, 6), groups: [] }),
                ],
              })
            }}
          >
            <Plus size={14} /> Додати період
          </button>
        </div>

        {stays.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-fg-faint">
            Немає періодів
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {stays.map((stay, idx) => (
              <div
                key={stay.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-surface-2/50 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-fg-muted">Період {idx + 1}</span>
                  <input
                    type="date"
                    className="input w-auto"
                    value={stay.from}
                    onChange={(e) => {
                      const next = stays.map((s) =>
                        s.id === stay.id
                          ? { ...s, from: e.target.value, to: s.to < e.target.value ? e.target.value : s.to }
                          : s,
                      )
                      patchSettings({ myropilStays: next })
                    }}
                  />
                  <span className="text-fg-faint">—</span>
                  <input
                    type="date"
                    className="input w-auto"
                    value={stay.to}
                    onChange={(e) => {
                      const next = stays.map((s) =>
                        s.id === stay.id
                          ? {
                              ...s,
                              to: e.target.value,
                              from: s.from > e.target.value ? e.target.value : s.from,
                            }
                          : s,
                      )
                      patchSettings({ myropilStays: next })
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-sm ml-auto text-tint-red"
                    onClick={() =>
                      patchSettings({ myropilStays: stays.filter((s) => s.id !== stay.id) })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div>
                  <p className="mb-1.5 text-xs text-fg-muted">Групи в Мирополі</p>
                  {allGroups.length === 0 ? (
                    <p className="text-xs text-fg-faint">Спочатку додайте групи в «Люди».</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {allGroups.map((g) => {
                        const on = stay.groups.includes(g)
                        return (
                          <button
                            key={g}
                            type="button"
                            className={
                              on
                                ? 'rounded-md border border-sky-600 bg-sky-600 px-2.5 py-1 text-sm font-medium text-white'
                                : 'rounded-md border border-border-strong bg-surface px-2.5 py-1 text-sm font-medium text-fg-muted hover:bg-surface-3'
                            }
                            onClick={() => {
                              const groups = on
                                ? stay.groups.filter((x) => x !== g)
                                : [...stay.groups, g]
                              patchSettings({
                                myropilStays: stays.map((s) =>
                                  s.id === stay.id ? { ...s, groups } : s,
                                ),
                              })
                            }}
                          >
                            {g}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        className="text-[11px] text-fg-faint hover:underline"
                        onClick={() =>
                          patchSettings({
                            myropilStays: stays.map((s) =>
                              s.id === stay.id ? { ...s, groups: [] } : s,
                            ),
                          })
                        }
                      >
                        усі групи
                      </button>
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-fg-faint">
                    {stay.groups.length === 0 ? 'Усі групи' : stay.groups.join(', ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-fg">Дані</h2>
        <p className="text-sm text-fg-muted">
          {counts.p} осіб · {counts.d} видів · {counts.a} записів
          {apiMode
            ? ' · серверне збереження по групі'
            : ' · локально в браузері'}
        </p>
        {apiMode && (
          <p className="text-xs text-fg-muted">
            Імпорт JSON з локальної копії: оберіть робочу групу → «Відновити з файлу» — дані потраплять у
            серверну БД цієї групи. Інші пристрої після логіну з тією ж групою побачать те саме.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            onClick={() => {
              void loadAll().then((data) => exportJSON(data))
            }}
          >
            <Download size={14} /> Завантажити резервну копію
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Відновити з файлу
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
              e.target.value = ''
            }}
          />
        </div>

        {msg && <p className="text-sm text-fg-muted">{msg}</p>}

        <hr className="border-border" />

        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              if (
                counts.p === 0 ||
                confirm('Завантажити групу С-55 з таблиці чергувань? Поточний особовий склад і журнал буде замінено.')
              ) {
                loadGroupC55()
                setMsg('Завантажено групу С-55 (25 осіб, теги ж/к).')
              }
            }}
          >
            <Users size={14} /> Група С-55
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              if (counts.p === 0 || confirm('Завантажити демо-дані? Поточні дані буде замінено.')) {
                loadDemo()
                setMsg('Завантажено демо-дані.')
              }
            }}
          >
            <FlaskConical size={14} /> Демо-дані
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('Видалити ВСІ дані? Цю дію не можна скасувати.')) {
                resetAll()
                setMsg('Дані очищено.')
              }
            }}
          >
            <Trash2 size={14} /> Очистити все
          </button>
        </div>
      </section>
    </div>

      <section className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-fg">Види нарядів — бали і кольори</h2>
        <DutyTypesEditor />
      </section>

      {canManageUsers(session?.role) && (
        <div className="mt-4">
          <AccountsAdmin />
        </div>
      )}
    </>
  )
}
