import { createContext, useContext, useMemo, useState, useCallback, useEffect, type ReactNode } from 'react'
import {
  canAccessGroup,
  effectiveGroupOf,
  loadActiveGroup,
  loadSession,
  loginWithPasswordAsync,
  logout as clearSession,
  restoreApiSession,
  refreshSessionFromAccounts,
  saveActiveGroup,
  type SessionUser,
} from '../lib/auth'
import { detectApiMode, isApiMode } from '../lib/api'

type AuthContextValue = {
  session: SessionUser | null
  /** Вибрана в канцелярії група (ігнорується, якщо є groupLock). */
  activeGroup: string | null
  /** Фактична робоча група для фільтрів і prefs. */
  effectiveGroup: string | null
  apiMode: boolean
  authReady: boolean
  setActiveGroup: (group: string | null) => void
  login: (login: string, password: string) => Promise<SessionUser | null>
  logout: () => void
  reloadSession: () => void
  canAccessGroup: (group: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null)
  const [activeGroup, setActiveGroupState] = useState<string | null>(null)
  const [apiMode, setApiMode] = useState(false)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const api = await detectApiMode()
      if (cancelled) return
      setApiMode(api)
      const s = api ? await restoreApiSession() : loadSession()
      if (cancelled) return
      setSession(s)
      if (s) {
        setActiveGroupState(s.groupLock ?? loadActiveGroup(s.id))
      }
      setAuthReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setActiveGroupState(null)
      return
    }
    if (session.groupLock) {
      setActiveGroupState(session.groupLock)
      return
    }
    setActiveGroupState(loadActiveGroup(session.id))
  }, [session?.id, session?.groupLock])

  const setActiveGroup = useCallback(
    (group: string | null) => {
      if (!session) return
      if (session.groupLock) return
      const next = group && group.trim() ? group.trim() : null
      saveActiveGroup(session.id, next)
      setActiveGroupState(next)
    },
    [session],
  )

  const login = useCallback(async (loginName: string, password: string) => {
    const user = await loginWithPasswordAsync(loginName, password)
    setApiMode(isApiMode())
    setSession(user)
    if (user) {
      const ag = user.groupLock ?? loadActiveGroup(user.id)
      setActiveGroupState(ag)
    }
    return user
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
    setActiveGroupState(null)
  }, [])

  const reloadSession = useCallback(() => {
    if (isApiMode()) {
      void restoreApiSession().then((s) => setSession(s))
      return
    }
    setSession((prev) => refreshSessionFromAccounts(prev))
  }, [])

  const effectiveGroup = effectiveGroupOf(session, activeGroup)

  const value = useMemo(
    () => ({
      session,
      activeGroup,
      effectiveGroup,
      apiMode,
      authReady,
      setActiveGroup,
      login,
      logout,
      reloadSession,
      canAccessGroup: (group: string) => canAccessGroup(session, group),
    }),
    [session, activeGroup, effectiveGroup, apiMode, authReady, setActiveGroup, login, logout, reloadSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

/** @deprecated використовуйте useEffectiveGroup */
export function useGroupLock(): string | null {
  return useAuth().effectiveGroup
}

export function useEffectiveGroup(): string | null {
  return useAuth().effectiveGroup
}
