import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getBundle, putBundle, listGroups } from './db.js'
import {
  authMiddleware,
  canAccessGroup,
  ensureAdminAccount,
  listAccounts,
  requireJournalist,
  signToken,
  upsertAccount,
  deleteAccount,
  verifyLogin,
} from './auth.js'
import { replaceAccounts } from './accounts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)
const STATIC_DIR = process.env.STATIC_DIR || ''

ensureAdminAccount()

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '20mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'exelscci' })
})

app.post('/api/auth/login', (req, res) => {
  const user = verifyLogin(req.body?.login, req.body?.password)
  if (!user) {
    res.status(401).json({ error: 'Невірний логін або пароль' })
    return
  }
  const token = signToken(user)
  res.json({ token, user })
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user })
})

app.get('/api/accounts', authMiddleware, requireJournalist, (_req, res) => {
  res.json({ accounts: listAccounts() })
})

app.put('/api/accounts', authMiddleware, requireJournalist, (req, res) => {
  try {
    const accounts = replaceAccounts(req.body?.accounts ?? [])
    res.json({ accounts })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.post('/api/accounts', authMiddleware, requireJournalist, (req, res) => {
  try {
    const account = upsertAccount(req.body ?? {})
    res.json({ account })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.delete('/api/accounts/:id', authMiddleware, requireJournalist, (req, res) => {
  try {
    const ok = deleteAccount(req.params.id)
    if (!ok) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.get('/api/groups', authMiddleware, (_req, res) => {
  res.json({ groups: listGroups() })
})

app.get('/api/groups/:group/bundle', authMiddleware, (req, res) => {
  const group = decodeURIComponent(req.params.group)
  if (!canAccessGroup(req.user, group)) {
    res.status(403).json({ error: 'Немає доступу до цієї групи' })
    return
  }
  const bundle = getBundle(group)
  res.json({
    group,
    people: bundle?.people ?? [],
    dutyTypes: bundle?.dutyTypes ?? [],
    assignments: bundle?.assignments ?? [],
    settings: bundle?.settings ?? null,
  })
})

app.put('/api/groups/:group/bundle', authMiddleware, (req, res) => {
  const group = decodeURIComponent(req.params.group)
  if (!canAccessGroup(req.user, group)) {
    res.status(403).json({ error: 'Немає доступу до цієї групи' })
    return
  }
  if (req.user.role === 'cadet') {
    res.status(403).json({ error: 'Курсант не може змінювати дані' })
    return
  }
  try {
    const saved = putBundle(group, req.body ?? {})
    res.json(saved)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

if (STATIC_DIR) {
  const dir = path.resolve(STATIC_DIR)
  app.use(express.static(dir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(dir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`[exelscci-server] http://0.0.0.0:${PORT}`)
})
