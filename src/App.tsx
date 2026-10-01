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
  { id: 'duties', label: 'Наряди', icon: ListChecks },
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
  const { session, logout, effectiveGroup, authReady, apiMode } = useAuth()
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
  const [apiRetrying, setApiRetrying] = useState(false)

  useEffect(() => {
    if (!authReady) return
    void hydrate()
  }, [authReady, hydrate])

  useEffect(() => {
    if (!authReady || !hydrated || !session) return
    void setWorkspaceGroup(effectiveGroup)
  }, [authReady, hydrated, session, effectiveGroup, setWorkspaceGroup])

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

  if (!authReady) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!apiMode) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertTriangle size={36} className="text-tint-amber" />
        <div className="max-w-md space-y-2">
          <p className="text-lg font-semibold text-fg">Сервер недоступний</p>
          <p className="text-sm text-fg-muted">
            Збереження лише на бекенді. Локальний режим повністю вимкнено. Оновіть сторінку після відновлення API.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={apiRetrying}
          onClick={() => {
            setApiRetrying(true)
            window.location.reload()
          }}
        >
          {apiRetrying ? 'Завантаження…' : 'Спробувати знову'}
        </button>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-full flex-col">
        <LoginPage onSuccess={handleLogin} />
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="safe-pt sticky top-0 z-40 shrink-0 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-2 px-3 py-2 md:gap-4 md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <img src="./favicon.svg" alt="" className="h-7 w-7 shrink-0" />
            <span className="text-base font-bold tracking-tight text-fg">ExcelCSSI</span>
            <span className="truncate text-xs text-fg-faint">
              {ROLE_META[session.role].short}
              {effectiveGroup ? ` · ${effectiveGroup}` : ''}
            </span>
          </div>
          <nav className="ml-auto hidden items-center gap-1 overflow-x-auto md:flex">
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
                  <span>{t.label}</span>
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
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-1">
            <button
              className="btn-ghost btn-sm"
              title={`Тема: ${THEME_META[theme].label}. Клік — наступна`}
              onClick={() => updateSettings({ theme: nextTheme(theme) })}
            >
              <ThemeIcon size={16} />
              <span className="hidden lg:inline">{THEME_META[theme].label}</span>
            </button>
            <button className="btn-ghost btn-sm" title="Вийти" onClick={handleLogout}>
              <LogOut size={16} />
              <span className="hidden lg:inline">Вийти</span>
            </button>
          </div>
        </div>
      </header>

      <main
        className={clsx(
          'w-full flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0',
          tab === 'history' ? '' : 'mx-auto max-w-screen-2xl px-3 py-3 md:px-4 md:py-4',
        )}
      >
        {dbError && (
          <div className="mb-3 flex items-start gap-2 alert-danger px-3 py-2 text-sm md:items-center">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 md:mt-0" />
            <span className="min-w-0 break-words">Помилка збереження в базу: {dbError}</span>
            <button className="btn-ghost btn-sm ml-auto shrink-0" onClick={() => useStore.setState({ dbError: null })}>
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

      <nav
        className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden"
        aria-label="Навігація"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-1 pt-1">
          {visibleTabs.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => go(t.id)}
                className={clsx(
                  'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] font-medium transition-colors',
                  active ? 'text-brand-400' : 'text-fg-faint',
                )}
              >
                <span
                  className={clsx(
                    'relative inline-flex h-8 w-8 items-center justify-center rounded-lg',
                    active && 'bg-brand-600/20',
                  )}
                >
                  <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
                  {t.id === 'people' && peopleCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-3.5 rounded-full bg-brand-600 px-1 text-[9px] leading-3.5 text-white tabular-nums">
                      {peopleCount > 99 ? '99+' : peopleCount}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
