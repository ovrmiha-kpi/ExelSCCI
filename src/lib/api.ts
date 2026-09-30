/** Клієнт REST API (Oracle Cloud / локальний server/). */

const TOKEN_KEY = 'exelscci:apiToken'

export type ApiUser = {
  id: string
  login: string
  role: string
  displayName: string
  groupLock: string | null
}

export type GroupBundle = {
  group: string
  people: unknown[]
  dutyTypes: unknown[]
  assignments: unknown[]
  settings: unknown | null
}

let apiAvailable: boolean | null = null

/** База API: порожньо = той самий origin (/api). */
export function apiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? ''
  if (!raw) return ''
  return raw.replace(/\/$/, '')
}

export async function detectApiMode(): Promise<boolean> {
  if (import.meta.env.VITE_USE_API === '1' || import.meta.env.VITE_USE_API === 'true') {
    apiAvailable = true
    return true
  }
  if (apiBase()) {
    apiAvailable = await apiHealth()
    return apiAvailable
  }
  // Dev proxy / same-origin nginx
  apiAvailable = await apiHealth()
  return apiAvailable
}

export function isApiMode(): boolean {
  return apiAvailable === true
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* ignore */
  }
}

function url(path: string): string {
  const base = apiBase()
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${p}` : p
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(url(path), { ...init, headers })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
  }
  if (!res.ok) {
    const err = (data as { error?: string } | null)?.error || res.statusText || 'Request failed'
    throw new Error(err)
  }
  return data as T
}

export async function apiHealth(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = window.setTimeout(() => ctrl.abort(), 1500)
    const r = await fetch(url('/api/health'), { signal: ctrl.signal })
    window.clearTimeout(t)
    return r.ok
  } catch {
    return false
  }
}

export async function apiLogin(login: string, password: string) {
  const data = await request<{ token: string; user: ApiUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  })
  setToken(data.token)
  return data
}

export async function apiMe() {
  return request<{ user: ApiUser }>('/api/auth/me')
}

export async function apiListGroups() {
  return request<{ groups: string[] }>('/api/groups')
}

export async function apiGetBundle(group: string) {
  return request<GroupBundle>(`/api/groups/${encodeURIComponent(group)}/bundle`)
}

export async function apiPutBundle(
  group: string,
  bundle: {
    people: unknown[]
    dutyTypes: unknown[]
    assignments: unknown[]
    settings: unknown | null
  },
) {
  return request<GroupBundle>(`/api/groups/${encodeURIComponent(group)}/bundle`, {
    method: 'PUT',
    body: JSON.stringify(bundle),
  })
}

export async function apiListAccounts() {
  return request<{
    accounts: Array<{
      id: string
      login: string
      role: string
      displayName: string
      groupLock: string | null
    }>
  }>('/api/accounts')
}

export async function apiReplaceAccounts(accounts: unknown[]) {
  return request<{ accounts: unknown[] }>('/api/accounts', {
    method: 'PUT',
    body: JSON.stringify({ accounts }),
  })
}

export async function apiUpsertAccount(account: unknown) {
  return request<{ account: unknown }>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify(account),
  })
}

export async function apiDeleteAccount(id: string) {
  return request<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
