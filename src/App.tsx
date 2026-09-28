import { useEffect, useState } from 'react'
import { CalendarDays, ListChecks, Settings, Table2, Users, Wand2 } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from './store'
import { RatingTable } from './components/RatingTable'
import { AssignPage } from './components/AssignPage'
import { HistoryPage } from './components/HistoryPage'
import { PeoplePage } from './components/PeoplePage'
import { DutyTypesPage } from './components/DutyTypesPage'
import { SettingsPage } from './components/SettingsPage'

type Tab = 'table' | 'assign' | 'history' | 'people' | 'duties' | 'settings'

const TABS: Array<{ id: Tab; label: string; icon: typeof Table2 }> = [
  { id: 'table', label: 'Таблиця', icon: Table2 },
  { id: 'assign', label: 'Призначити', icon: Wand2 },
  { id: 'history', label: 'Журнал', icon: CalendarDays },
  { id: 'people', label: 'Люди', icon: Users },
  { id: 'duties', label: 'Види нарядів', icon: ListChecks },
  { id: 'settings', label: 'Налаштування', icon: Settings },
]

function readTab(): Tab {
  const h = window.location.hash.replace('#', '') as Tab
  return TABS.some((t) => t.id === h) ? h : 'table'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readTab)
  const peopleCount = useStore((s) => s.people.length)

  useEffect(() => {
    const onHash = () => setTab(readTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (t: Tab) => {
    history.replaceState(null, '', `#${t}`)
    setTab(t)
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-2">
          <div className="flex items-center gap-2">
            <img src="./favicon.svg" alt="" className="h-7 w-7" />
            <span className="text-base font-bold tracking-tight text-slate-900">DutyRank</span>
            <span className="hidden text-xs text-slate-500 sm:inline">облік нарядів за рейтингом</span>
          </div>
          <nav className="ml-auto flex gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                    active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  <Icon size={15} />
                  <span className="hidden md:inline">{t.label}</span>
                  {t.id === 'people' && peopleCount > 0 && (
                    <span
                      className={clsx(
                        'rounded-full px-1.5 text-[10px] tabular-nums',
                        active ? 'bg-white/20' : 'bg-slate-200 text-slate-700',
                      )}
                    >
                      {peopleCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-4">
        {tab === 'table' && <RatingTable />}
        {tab === 'assign' && <AssignPage onDone={() => go('table')} />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'people' && <PeoplePage />}
        {tab === 'duties' && <DutyTypesPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
