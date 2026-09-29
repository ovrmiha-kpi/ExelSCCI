/** Ролі доступу (локальні акаунти в браузері). */
export type UserRole =
  | 'journalist'
  | 'cmd_section_1'
  | 'cmd_section_2'
  | 'cmd_group'
  | 'cadet'

export type AppTab = 'table' | 'assign' | 'history' | 'people' | 'duties' | 'settings'

export interface Account {
  id: string
  login: string
  password: string
  role: UserRole
  displayName: string
  /** Якщо задано — бачить лише цю групу; null = усі групи. */
  groupLock: string | null
}

export interface SessionUser {
  id: string
  login: string
  role: UserRole
  displayName: string
  groupLock: string | null
}

export const ROLE_META: Record<UserRole, { label: string; short: string }> = {
  journalist: { label: 'Журналіст', short: 'Журналіст' },
  cmd_section_1: { label: 'Командир 1 відділення', short: 'Ком. 1 відд.' },
  cmd_section_2: { label: 'Командир 2 відділення', short: 'Ком. 2 відд.' },
  cmd_group: { label: 'Командир групи', short: 'Ком. групи' },
  cadet: { label: 'Курсант', short: 'Курсант' },
}

export const USER_ROLES = Object.keys(ROLE_META) as UserRole[]

const ALL_TABS: AppTab[] = ['table', 'assign', 'history', 'people', 'duties', 'settings']
const CADET_TABS: AppTab[] = ['table', 'history']

export function tabsForRole(role: UserRole): AppTab[] {
  return role === 'cadet' ? CADET_TABS : ALL_TABS
}

export function isCadet(role: UserRole | null | undefined): boolean {
  return role === 'cadet'
}

export function isJournalist(role: UserRole | null | undefined): boolean {
  return role === 'journalist'
}

export function canWrite(role: UserRole | null | undefined): boolean {
  return !!role && role !== 'cadet'
}

export function canManageUsers(role: UserRole | null | undefined): boolean {
  return role === 'journalist'
}

const ACCOUNTS_KEY = 'dutyrank:accounts:v2'
const SESSION_KEY = 'dutyrank:session:v2'
const LEGACY_ACCOUNTS_KEY = 'dutyrank:accounts:v1'

/** Адмін-акаунт журналіста (засівається при першому запуску). */
export const ADMIN_ACCOUNT: Account = {
  id: 'acc-ovrmiha',
  login: 'ovrmiha',
  password: 'A80cvNys',
  role: 'journalist',
  displayName: 'Журналіст',
  groupLock: null,
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function normalizeAccount(raw: Partial<Account> & { login?: string }): Account | null {
  if (!raw || typeof raw.login !== 'string' || !raw.login.trim()) return null
  const role: UserRole =
    raw.role && raw.role in ROLE_META ? (raw.role as UserRole) : 'cadet'
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `acc-${raw.login.trim().toLowerCase()}`,
    login: raw.login.trim(),
    password: typeof raw.password === 'string' ? raw.password : '',
    role,
    displayName:
      typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName.trim()
        : ROLE_META[role].label,
    groupLock:
      typeof raw.groupLock === 'string' && raw.groupLock.trim() ? raw.groupLock.trim() : null,
  }
}

function toSession(acc: Account): SessionUser {
  return {
    id: acc.id,
    login: acc.login,
    role: acc.role,
    displayName: acc.displayName,
    groupLock: acc.groupLock,
  }
}

function ensureAdmin(list: Account[]): Account[] {
  const idx = list.findIndex((a) => a.login.toLowerCase() === ADMIN_ACCOUNT.login.toLowerCase())
  if (idx < 0) return [{ ...ADMIN_ACCOUNT }, ...list]
  const cur = list[idx]
  const next = {
    ...cur,
    role: 'journalist' as const,
    // Пароль адміна з коду лише якщо акаунт щойно підхоплено без пароля.
    password: cur.password || ADMIN_ACCOUNT.password,
    groupLock: null,
  }
  if (next === cur) return list
  const copy = [...list]
  copy[idx] = next
  return copy
}

export function loadAccounts(): Account[] {
  let raw = readJson<unknown[]>(ACCOUNTS_KEY)
  if (!Array.isArray(raw) || raw.length === 0) {
    raw = readJson<unknown[]>(LEGACY_ACCOUNTS_KEY) ?? []
  }
  const list: Account[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const a = normalizeAccount(item as Partial<Account>)
    if (!a) continue
    const key = a.login.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    list.push(a)
  }
  const withAdmin = ensureAdmin(list)
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(withAdmin))
  return withAdmin.map((a) => ({ ...a }))
}

export function saveAccounts(list: Account[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list))
}

export function loadSession(): SessionUser | null {
  const s = readJson<SessionUser>(SESSION_KEY)
  if (!s || typeof s.login !== 'string' || typeof s.role !== 'string') return null
  if (!(s.role in ROLE_META)) return null
  // Підтягнути актуальний groupLock / роль з акаунта.
  const acc = loadAccounts().find((a) => a.id === s.id || a.login.toLowerCase() === s.login.toLowerCase())
  if (!acc) return null
  const session = toSession(acc)
  saveSession(session)
  return session
}

export function saveSession(user: SessionUser | null): void {
  if (!user) localStorage.removeItem(SESSION_KEY)
  else localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function loginWithPassword(login: string, password: string): SessionUser | null {
  const accounts = loadAccounts()
  const found = accounts.find(
    (a) => a.login.trim().toLowerCase() === login.trim().toLowerCase() && a.password === password,
  )
  if (!found) return null
  const session = toSession(found)
  saveSession(session)
  return session
}

export function logout(): void {
  saveSession(null)
}

export type RegisterInput = {
  login: string
  password: string
  displayName?: string
  role?: UserRole
  groupLock?: string | null
}

export function registerAccount(
  input: RegisterInput,
  opts?: { allowPrivilegedRoles?: boolean },
): { ok: true; user: SessionUser; account: Account } | { ok: false; error: string } {
  // Створення акаунтів лише через адмінку журналіста (allowPrivilegedRoles).
  if (!opts?.allowPrivilegedRoles) {
    return { ok: false, error: 'Немає прав на створення акаунтів' }
  }

  const login = input.login.trim()
  const password = input.password
  if (login.length < 3) return { ok: false, error: 'Логін має містити щонайменше 3 символи' }
  if (password.length < 4) return { ok: false, error: 'Пароль має містити щонайменше 4 символи' }

  const role: UserRole = input.role && input.role in ROLE_META ? input.role : 'cadet'

  const accounts = loadAccounts()
  if (accounts.some((a) => a.login.toLowerCase() === login.toLowerCase())) {
    return { ok: false, error: 'Такий логін уже зайнятий' }
  }

  const account: Account = {
    id: `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    login,
    password,
    role,
    displayName: (input.displayName ?? '').trim() || ROLE_META[role].label,
    groupLock:
      typeof input.groupLock === 'string' && input.groupLock.trim() ? input.groupLock.trim() : null,
  }
  saveAccounts([...accounts, account])
  return { ok: true, user: toSession(account), account }
}

export function upsertAccount(
  patch: Partial<Account> & { id: string },
): { ok: true; account: Account } | { ok: false; error: string } {
  const accounts = loadAccounts()
  const idx = accounts.findIndex((a) => a.id === patch.id)
  if (idx < 0) return { ok: false, error: 'Акаунт не знайдено' }
  const cur = accounts[idx]
  const login = (patch.login ?? cur.login).trim()
  if (login.length < 3) return { ok: false, error: 'Логін занадто короткий' }
  if (
    accounts.some((a, i) => i !== idx && a.login.toLowerCase() === login.toLowerCase())
  ) {
    return { ok: false, error: 'Такий логін уже зайнятий' }
  }
  const role = patch.role && patch.role in ROLE_META ? patch.role : cur.role
  const next: Account = {
    ...cur,
    login,
    password: typeof patch.password === 'string' && patch.password ? patch.password : cur.password,
    role,
    displayName:
      typeof patch.displayName === 'string' && patch.displayName.trim()
        ? patch.displayName.trim()
        : cur.displayName,
    groupLock:
      patch.groupLock === undefined
        ? cur.groupLock
        : patch.groupLock && patch.groupLock.trim()
          ? patch.groupLock.trim()
          : null,
  }
  // Адмін ovrmiha завжди журналіст без локу групи.
  if (next.login.toLowerCase() === ADMIN_ACCOUNT.login.toLowerCase()) {
    next.role = 'journalist'
    next.groupLock = null
  }
  const list = [...accounts]
  list[idx] = next
  saveAccounts(list)
  return { ok: true, account: next }
}

export function deleteAccount(id: string, actorId: string): { ok: true } | { ok: false; error: string } {
  const accounts = loadAccounts()
  const target = accounts.find((a) => a.id === id)
  if (!target) return { ok: false, error: 'Акаунт не знайдено' }
  if (target.id === actorId) return { ok: false, error: 'Не можна видалити власний акаунт' }
  if (target.login.toLowerCase() === ADMIN_ACCOUNT.login.toLowerCase()) {
    return { ok: false, error: 'Не можна видалити акаунт журналіста' }
  }
  saveAccounts(accounts.filter((a) => a.id !== id))
  return { ok: true }
}

export function refreshSessionFromAccounts(session: SessionUser | null): SessionUser | null {
  if (!session) return null
  const acc = loadAccounts().find(
    (a) => a.id === session.id || a.login.toLowerCase() === session.login.toLowerCase(),
  )
  if (!acc) {
    saveSession(null)
    return null
  }
  const next = toSession(acc)
  saveSession(next)
  return next
}

/** Фільтр людей за локом / робочою групою. */
export function filterByGroupLock<T extends { group: string }>(
  items: T[],
  groupLock: string | null | undefined,
): T[] {
  if (!groupLock) return items
  return items.filter((p) => p.group === groupLock)
}

const ACTIVE_GROUP_PREFIX = 'dutyrank:activeGroup:'

export function loadActiveGroup(accountId: string): string | null {
  try {
    const v = localStorage.getItem(ACTIVE_GROUP_PREFIX + accountId)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function saveActiveGroup(accountId: string, group: string | null): void {
  try {
    const key = ACTIVE_GROUP_PREFIX + accountId
    if (!group) localStorage.removeItem(key)
    else localStorage.setItem(key, group)
  } catch {
    /* ignore */
  }
}

/**
 * Робоча група: lock акаунта має пріоритет; інакше вибрана в канцелярії.
 * null — усі групи / ще не обрано.
 */
export function effectiveGroupOf(
  session: SessionUser | null | undefined,
  activeGroup: string | null | undefined,
): string | null {
  if (!session) return null
  if (session.groupLock) return session.groupLock
  return activeGroup && activeGroup.trim() ? activeGroup.trim() : null
}

export function canAccessGroup(
  session: SessionUser | null | undefined,
  group: string,
): boolean {
  if (!session) return false
  if (!session.groupLock) return true
  return session.groupLock === group
}
