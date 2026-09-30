import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import {
  ADMIN_ACCOUNT,
  ROLE_META,
  USER_ROLES,
  deleteAccountAsync,
  loadAccountsAsync,
  registerAccountAsync,
  upsertAccountAsync,
  type Account,
  type UserRole,
} from '../lib/auth'
import { useAuth } from '../lib/AuthContext'
import { useStore } from '../store'
import { Field } from './ui'

type Draft = {
  login: string
  password: string
  displayName: string
  role: UserRole
  groupLock: string
}

function toDraft(acc: Account): Draft {
  return {
    login: acc.login,
    password: '',
    displayName: acc.displayName,
    role: acc.role,
    groupLock: acc.groupLock ?? '',
  }
}

export function AccountsAdmin() {
  const { session, reloadSession, apiMode } = useAuth()
  const people = useStore((s) => s.people)
  const groups = useMemo(
    () => [...new Set(people.map((p) => p.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk')),
    [people],
  )

  const [accounts, setAccounts] = useState<Account[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('cadet')
  const [groupLock, setGroupLock] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await loadAccountsAsync()
      setAccounts(list)
      setDrafts(() => {
        const next: Record<string, Draft> = {}
        for (const a of list) next[a.id] = toDraft(a)
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [apiMode])

  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMsg(null)
    const res = await registerAccountAsync(
      {
        login,
        password,
        displayName: displayName.trim() || undefined,
        role,
        groupLock: groupLock || null,
      },
      { allowPrivilegedRoles: true },
    )
    if (!res.ok) {
      setError(res.error)
      return
    }
    setLogin('')
    setPassword('')
    setDisplayName('')
    setRole('cadet')
    setGroupLock('')
    setMsg(`Створено: ${res.account.login}`)
    await refresh()
  }

  const save = async (acc: Account) => {
    const d = drafts[acc.id]
    if (!d) return
    setError(null)
    setMsg(null)
    const patch: Partial<Account> & { id: string } = {
      id: acc.id,
      login: d.login.trim(),
      displayName: d.displayName.trim(),
      role: d.role,
      groupLock: d.groupLock || null,
    }
    if (d.password.trim()) patch.password = d.password.trim()
    const res = await upsertAccountAsync(patch)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setMsg(`Збережено: ${res.account.login}`)
    await refresh()
    if (session?.id === acc.id) reloadSession()
  }

  const remove = async (acc: Account) => {
    if (!session) return
    if (!confirm(`Видалити акаунт «${acc.login}»?`)) return
    setError(null)
    const res = await deleteAccountAsync(acc.id, session.id)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setMsg(`Видалено: ${acc.login}`)
    await refresh()
  }

  return (
    <section className="card flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Акаунти</h2>
        <p className="mt-0.5 text-xs text-fg-muted">
          Доступ: усі групи або лише одна. Журнал і налаштування привʼязані до групи.
          {apiMode ? ' Збереження на сервері.' : ' Збереження в браузері.'}
        </p>
      </div>

      <form
        onSubmit={(e) => void create(e)}
        className="grid grid-cols-1 gap-3 rounded-md border border-border bg-surface-2/40 p-3 md:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="Логін">
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} required />
        </Field>
        <Field label="Пароль">
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Імʼя">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Роль">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Доступ">
          <select className="input" value={groupLock} onChange={(e) => setGroupLock(e.target.value)}>
            <option value="">Усі групи</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                Лише група: {g}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full">
            <Plus size={14} /> Створити
          </button>
        </div>
      </form>

      {error && <p className="alert-danger px-3 py-2 text-sm">{error}</p>}
      {msg && <p className="text-sm text-fg-muted">{msg}</p>}
      {loading && <p className="text-sm text-fg-muted">Завантаження акаунтів…</p>}

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">Усі акаунти</h3>
        <div className="flex flex-col gap-3">
          {accounts.map((acc) => {
            const d = drafts[acc.id] ?? toDraft(acc)
            const isAdmin = acc.login.toLowerCase() === ADMIN_ACCOUNT.login.toLowerCase()
            return (
              <div
                key={acc.id}
                className="grid grid-cols-1 gap-2 rounded-md border border-border bg-surface-2/30 p-3 md:grid-cols-2 lg:grid-cols-3"
              >
                <Field label="Логін">
                  <input
                    className="input"
                    value={d.login}
                    disabled={isAdmin}
                    onChange={(e) => setDraft(acc.id, { login: e.target.value })}
                  />
                </Field>
                <Field label="Новий пароль">
                  <input
                    type="password"
                    className="input"
                    value={d.password}
                    placeholder="без змін"
                    onChange={(e) => setDraft(acc.id, { password: e.target.value })}
                  />
                </Field>
                <Field label="Імʼя">
                  <input
                    className="input"
                    value={d.displayName}
                    onChange={(e) => setDraft(acc.id, { displayName: e.target.value })}
                  />
                </Field>
                <Field label="Роль">
                  {isAdmin ? (
                    <input className="input" value={ROLE_META.journalist.label} disabled />
                  ) : (
                    <select
                      className="input"
                      value={d.role}
                      onChange={(e) => setDraft(acc.id, { role: e.target.value as UserRole })}
                    >
                      {USER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_META[r].label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Доступ">
                  {isAdmin ? (
                    <input className="input" value="Усі групи" disabled />
                  ) : (
                    <select
                      className="input"
                      value={d.groupLock}
                      onChange={(e) => setDraft(acc.id, { groupLock: e.target.value })}
                    >
                      <option value="">Усі групи</option>
                      {groups.map((g) => (
                        <option key={g} value={g}>
                          Лише: {g}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <div className="flex items-end gap-2">
                  <button type="button" className="btn-primary flex-1" onClick={() => void save(acc)}>
                    <Save size={14} /> Зберегти
                  </button>
                  {!isAdmin && session?.id !== acc.id && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm text-tint-red"
                      title="Видалити"
                      onClick={() => void remove(acc)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
