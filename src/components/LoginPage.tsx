import { useState } from 'react'
import { LogIn, Loader2 } from 'lucide-react'
import type { SessionUser } from '../lib/auth'
import { Field } from './ui'
import { useAuth } from '../lib/AuthContext'

export function LoginPage({ onSuccess }: { onSuccess: (user: SessionUser) => void }) {
  const auth = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user = await auth.login(login, password)
      if (!user) {
        setError('Невірний логін або пароль')
        return
      }
      onSuccess(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка входу')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <form
        onSubmit={(e) => void submit(e)}
        className="card flex w-full max-w-md flex-col gap-4 border-border p-6 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <img src="./favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-fg">ExelSCCI</h1>
            <p className="text-xs text-fg-muted">
              Вхід{auth.apiMode ? ' · сервер' : auth.authReady ? ' · локально' : ''}
            </p>
          </div>
        </div>

        <Field label="Логін">
          <input
            className="input"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
            disabled={busy}
          />
        </Field>
        <Field label="Пароль">
          <input
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </Field>

        {error && <p className="alert-danger px-3 py-2 text-sm">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={busy || !auth.authReady}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Увійти
        </button>
      </form>
    </div>
  )
}
