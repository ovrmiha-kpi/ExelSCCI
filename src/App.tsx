import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Eclipse,
  ListChecks,
  Loader2,
  LogOut,
  Moon,
  Settings,
  Sun,
  Table2,
  Users,
  Wand2,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { useStore } from './store'
import { THEME_META, type ThemeId } from './types'
import { nextTheme } from './lib/theme'
import { loadUiPrefs, saveUiPrefs } from './lib/uiPrefs'
import { isCadet, ROLE_META, tabsForRole, type AppTab, type SessionUser } from './lib/auth'
import { useAuth } from './lib/AuthContext'
import { LoginPage } from './components/LoginPage'

const RatingTable = lazy(() => import('./components/RatingTable').then((m) => ({ default: m.RatingTable })))
const CadetRatingPage = lazy(() =>
  import('./components/CadetRatingPage').then((m) => ({ default: m.CadetRatingPage })),
)
const AssignPage = lazy(() => import('./components/AssignPage').then((m) => ({ default: m.AssignPage })))
const SchedulePage = lazy(() => import('./components/SchedulePage').then((m) => ({ default: m.SchedulePage })))
const CadetSchedulePage = lazy(() =>
  import('./components/CadetSchedulePage').then((m) => ({ default: m.CadetSchedulePage })),
)
const PeoplePage = lazy(() => import('./components/PeoplePage').then((m) => ({ default: m.PeoplePage })))
const DutyTypesPage = lazy(() => import('./components/DutyTypesPage').then((m) => ({ default: m.DutyTypesPage })))
const SettingsPage = lazy(() => import('./components/SettingsPage').then((m) => ({ default: m.SettingsPage })))

const TAB_META: Array<{ id: AppTab; label: string; icon: typeof Table2 }> = [
  { id: 'table', label: 'Таблиця', icon: Table2 },
  { id: 'assign', label: 'Призначити', icon: Wand2 },
  { id: 'history', label: 'Журнал', icon: CalendarDays },
  { id: 'people', label: 'Люди', icon: Users },
  { id: 'duties', label: 'Види нарядів', icon: ListChecks },
  { id: 'settings', label: 'Налаштування', icon: Settings },
]

const THEME_ICON: Record<ThemeId, typeof Sun> = {
  light: Sun,
  dark: Moon,
  midnight: Eclipse,
}

function readTab(allowed: AppTab[], group?: string | null): AppTab {
  const h = window.location.hash.replace('#', '') as AppTab
  if (allowed.includes(h)) return h
  const pref = loadUiPrefs(group).lastTab as AppTab | undefined
  if (pref && allowed.includes(pref)) return pref
  return allowed[0] ?? 'table'
}

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-fg-muted">
      <Loader2 size={18} className="animate-spin" /> Завантаження…
    </div>
  )
}

export default function App() {
  const { session, logout, effectiveGroup } = useAuth()
  const allowedTabs = useMemo(
    () => (session ? tabsForRole(session.role) : (['table'] as AppTab[])),
    [session],
  )
  const [tab, setTab] = useState<AppTab>(() =>
    session ? readTab(tabsForRole(session.role), session.groupLock) : 'table',
  )
  const hydrated = useStore((s) => s.hydrated)
  const hydrate = useStore((s) => s.hydrate)
  const setWorkspaceGroup = useStore((s) => s.setWorkspaceGroup)
  const dbError = useStore((s) => s.dbError)
  const peopleCount = useStore((s) => s.people.length)
  const theme = useStore((s) => s.settings.theme)
  const updateSettings = useStore((s) => s.updateSettings)
  const cadet = isCadet(session?.role)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!hydrated || !session) return
    void setWorkspaceGroup(effectiveGroup)
  }, [hydrated, session, effectiveGroup, setWorkspaceGroup])

  useEffect(() => {
    if (!session) return
    const allowed = tabsForRole(session.role)
    const onHash = () => {
      const t = readTab(allowed, effectiveGroup)
      setTab(t)
      saveUiPrefs({ lastTab: t }, effectiveGroup)
    }
    window.addEventListener('hashchange', onHash)
    const current = window.location.hash.replace('#', '') as AppTab
    if (!allowed.includes(current)) {
      const next = readTab(allowed, effectiveGroup)
      history.replaceState(null, '', `#${next}`)
      setTab(next)
      saveUiPrefs({ lastTab: next }, effectiveGroup)
    }
    return () => window.removeEventListener('hashchange', onHash)
  }, [session, effectiveGroup])

  const go = (t: AppTab) => {
    if (!allowedTabs.includes(t)) return
    history.replaceState(null, '', `#${t}`)
    setTab(t)
    saveUiPrefs({ lastTab: t }, effectiveGroup)
  }

  const handleLogin = (user: SessionUser) => {
    const allowed = tabsForRole(user.role)
    const next = readTab(allowed, user.groupLock)
    history.replaceState(null, '', `#${next}`)
    setTab(next)
    saveUiPrefs({ lastTab: next }, user.groupLock)
  }

  const handleLogout = () => {
    logout()
    history.replaceState(null, '', ' ')
  }

  const ThemeIcon = THEME_ICON[theme] ?? Moon
  const visibleTabs = TAB_META.filter((t) => allowedTabs.includes(t.id))

  if (!session) {
    return (
      <div className="flex min-h-full flex-col">
        <LoginPage onSuccess={handleLogin} />
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-2">
          <div className="flex items-center gap-2">
            <img src="./favicon.svg" alt="" className="h-7 w-7" />
            <span className="text-base font-bold tracking-tight text-fg">ExelSCCI</span>
            <span className="hidden text-xs text-fg-faint sm:inline">
              {ROLE_META[session.role].short}
              {effectiveGroup ? ` · ${effectiveGroup}` : ''}
            </span>
          </div>
          <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
            {visibleTabs.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                    active ? 'bg-brand-600 text-white' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                  )}
                >
                  <Icon size={15} />
                  <span className="hidden md:inline">{t.label}</span>
                  {t.id === 'people' && peopleCount > 0 && (
                    <span
                      className={clsx(
                        'rounded-full px-1.5 text-[10px] tabular-nums',
                        active ? 'bg-white/20' : 'bg-surface-4 text-fg-muted',
                      )}
                    >
                      {peopleCount}
                    </span>
                  )}
                </button>
              )
            })}
            <button
              className="btn-ghost btn-sm ml-1 shrink-0"
              title={`Тема: ${THEME_META[theme].label}. Клік — наступна`}
              onClick={() => updateSettings({ theme: nextTheme(theme) })}
            >
              <ThemeIcon size={16} />
              <span className="hidden sm:inline">{THEME_META[theme].label}</span>
            </button>
            <button className="btn-ghost btn-sm shrink-0" title="Вийти" onClick={handleLogout}>
              <LogOut size={16} />
              <span className="hidden sm:inline">Вийти</span>
            </button>
          </nav>
        </div>
      </header>

      <main
        className={clsx(
          'w-full flex-1',
          tab === 'history' ? '' : 'mx-auto max-w-screen-2xl px-4 py-4',
        )}
      >
        {dbError && (
          <div className="mb-3 flex items-center gap-2 alert-danger px-3 py-2 text-sm">
            <AlertTriangle size={16} />
            <span>Помилка збереження в базу: {dbError}</span>
            <button className="btn-ghost btn-sm ml-auto" onClick={() => useStore.setState({ dbError: null })}>
              <X size={14} />
            </button>
          </div>
        )}
        {!hydrated ? (
          <Spinner />
        ) : (
          <Suspense fallback={<Spinner />}>
            {tab === 'table' && (cadet ? <CadetRatingPage /> : <RatingTable />)}
            {tab === 'assign' && !cadet && <AssignPage onDone={() => go('table')} />}
            {tab === 'history' && (cadet ? <CadetSchedulePage /> : <SchedulePage />)}
            {tab === 'people' && !cadet && <PeoplePage />}
            {tab === 'duties' && !cadet && <DutyTypesPage />}
            {tab === 'settings' && !cadet && <SettingsPage />}
          </Suspense>
        )}
      </main>
    </div>
  )
}
