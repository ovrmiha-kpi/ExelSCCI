/**
 * Zero-dependency ExelSCCI API (same routes as Express server).
 * Use when npm registry is unreachable from the VM.
 */
import http from 'node:http'
import crypto from 'node:crypto'
import { getBundle, putBundle, listGroups, loadAccountsRaw, saveAccountsRaw } from './db.js'

const PORT = Number(process.env.PORT || 8787)
const JWT_SECRET = process.env.JWT_SECRET || 'exelscci-dev-secret-change-me'
const JWT_DAYS = Number(process.env.JWT_DAYS || 30)
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'ovrmiha'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'A80cvNys'
const ROLES = new Set(['journalist', 'cmd_section_1', 'cmd_section_2', 'cmd_group', 'cadet'])

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(String(password), salt, 32)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false
  if (stored.startsWith('scrypt$')) {
    const [, saltHex, hashHex] = stored.split('$')
    const hash = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32)
    const a = Buffer.from(hashHex, 'hex')
    const b = hash
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }
  // bcrypt hashes need bcryptjs — not available offline
  return false
}

function uuid() {
  return crypto.randomUUID()
}

function normalizeAccount(raw) {
  if (!raw || typeof raw.login !== 'string' || !raw.login.trim()) return null
  const role = ROLES.has(raw.role) ? raw.role : 'cadet'
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `acc-${uuid()}`,
    login: raw.login.trim(),
    passwordHash:
      typeof raw.passwordHash === 'string'
        ? raw.passwordHash
        : typeof raw.password_hash === 'string'
          ? raw.password_hash
          : '',
    role,
    displayName:
      typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName.trim()
        : role,
    groupLock:
      typeof raw.groupLock === 'string' && raw.groupLock.trim()
        ? raw.groupLock.trim()
        : typeof raw.group_lock === 'string' && raw.group_lock.trim()
          ? raw.group_lock.trim()
          : null,
  }
}

function publicAccount(a) {
  return {
    id: a.id,
    login: a.login,
    role: a.role,
    displayName: a.displayName,
    groupLock: a.groupLock,
  }
}

function ensureAdminAccount() {
  const list = loadAccountsRaw().map(normalizeAccount).filter(Boolean)
  const idx = list.findIndex((a) => a.login.toLowerCase() === ADMIN_LOGIN.toLowerCase())
  if (idx >= 0) {
    saveAccountsRaw(list)
    return
  }
  list.unshift({
    id: `acc-${uuid()}`,
    login: ADMIN_LOGIN,
    passwordHash: hashPassword(ADMIN_PASSWORD),
    role: 'journalist',
    displayName: 'Журналіст',
    groupLock: null,
  })
  saveAccountsRaw(list)
}

function listAccounts() {
  return loadAccountsRaw().map(normalizeAccount).filter(Boolean).map(publicAccount)
}

function findAccountByLogin(login) {
  const key = String(login || '').trim().toLowerCase()
  return (
    loadAccountsRaw()
      .map(normalizeAccount)
      .filter(Boolean)
      .find((a) => a.login.toLowerCase() === key) || null
  )
}

function verifyLogin(login, password) {
  const acc = findAccountByLogin(login)
  if (!acc || !acc.passwordHash) return null
  if (!verifyPassword(password, acc.passwordHash)) return null
  return publicAccount(acc)
}

function signToken(user) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      login: user.login,
      role: user.role,
      displayName: user.displayName,
      groupLock: user.groupLock,
      exp: Math.floor(Date.now() / 1000) + JWT_DAYS * 86400,
    }),
  )
  const data = `${header}.${payload}`
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest())
  return `${data}.${sig}`
}

function verifyToken(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw new Error('bad token')
  const [header, payload, sig] = parts
  const data = `${header}.${payload}`
  const expect = b64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest())
  if (sig !== expect) throw new Error('bad sig')
  const body = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) throw new Error('expired')
  return {
    id: body.sub,
    login: body.login,
    role: body.role,
    displayName: body.displayName,
    groupLock: body.groupLock ?? null,
  }
}

function canAccessGroup(user, group) {
  if (!user) return false
  if (!user.groupLock) return true
  return user.groupLock === group
}

function upsertAccount(input) {
  const login = String(input.login || '').trim()
  if (login.length < 3) throw new Error('Логін має містити щонайменше 3 символи')
  const role = ROLES.has(input.role) ? input.role : 'cadet'
  const displayName =
    typeof input.displayName === 'string' && input.displayName.trim()
      ? input.displayName.trim()
      : role
  const groupLock =
    typeof input.groupLock === 'string' && input.groupLock.trim() ? input.groupLock.trim() : null

  const list = loadAccountsRaw().map(normalizeAccount).filter(Boolean)
  const existing =
    (input.id && list.find((a) => a.id === input.id)) ||
    list.find((a) => a.login.toLowerCase() === login.toLowerCase())

  if (existing) {
    if (typeof input.password === 'string' && input.password.length >= 4) {
      existing.passwordHash = hashPassword(input.password)
    }
    existing.login = login
    existing.role = role
    existing.displayName = displayName
    existing.groupLock = groupLock
    saveAccountsRaw(list)
    return publicAccount(existing)
  }

  if (typeof input.password !== 'string' || input.password.length < 4) {
    throw new Error('Пароль має містити щонайменше 4 символи')
  }
  if (list.some((a) => a.login.toLowerCase() === login.toLowerCase())) {
    throw new Error('Такий логін уже зайнятий')
  }
  const acc = {
    id: input.id || `acc-${uuid()}`,
    login,
    passwordHash: hashPassword(input.password),
    role,
    displayName,
    groupLock,
  }
  list.push(acc)
  saveAccountsRaw(list)
  return publicAccount(acc)
}

function deleteAccount(id) {
  const list = loadAccountsRaw().map(normalizeAccount).filter(Boolean)
  const acc = list.find((a) => a.id === id)
  if (!acc) return false
  if (acc.login.toLowerCase() === ADMIN_LOGIN.toLowerCase()) {
    throw new Error('Не можна видалити адмін-акаунт')
  }
  saveAccountsRaw(list.filter((a) => a.id !== id))
  return true
}

function replaceAccounts(list) {
  const next = []
  for (const raw of Array.isArray(list) ? list : []) {
    const login = String(raw.login || '').trim()
    if (!login) continue
    const role = ['journalist', 'cmd_section_1', 'cmd_section_2', 'cmd_group', 'cadet'].includes(raw.role)
      ? raw.role
      : 'cadet'
    const displayName =
      typeof raw.displayName === 'string' && raw.displayName.trim() ? raw.displayName.trim() : role
    const groupLock =
      typeof raw.groupLock === 'string' && raw.groupLock.trim() ? raw.groupLock.trim() : null
    const id = raw.id || `acc-${uuid()}`
    let passwordHash = ''
    if (typeof raw.passwordHash === 'string' && (raw.passwordHash.startsWith('scrypt$') || raw.passwordHash.startsWith('$2'))) {
      passwordHash = raw.passwordHash
    } else if (typeof raw.password === 'string' && raw.password.length >= 4) {
      passwordHash = hashPassword(raw.password)
    } else {
      passwordHash = hashPassword('1111')
    }
    next.push({ id, login, passwordHash, role, displayName, groupLock })
  }
  saveAccountsRaw(next)
  ensureAdminAccount()
  return listAccounts()
}

function send(res, status, data, origin) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return null
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function authUser(req) {
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  if (!token) return null
  try {
    return verifyToken(token)
  } catch {
    return null
  }
}

ensureAdminAccount()

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '*'
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    })
    res.end()
    return
  }

  const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const path = u.pathname

  try {
    if (req.method === 'GET' && path === '/api/health') {
      send(res, 200, { ok: true, service: 'exelscci' }, origin)
      return
    }

    if (req.method === 'POST' && path === '/api/auth/login') {
      const body = await readBody(req)
      const user = verifyLogin(body?.login, body?.password)
      if (!user) {
        send(res, 401, { error: 'Невірний логін або пароль' }, origin)
        return
      }
      send(res, 200, { token: signToken(user), user }, origin)
      return
    }

    const user = authUser(req)

    if (req.method === 'GET' && path === '/api/auth/me') {
      if (!user) {
        send(res, 401, { error: 'Unauthorized' }, origin)
        return
      }
      send(res, 200, { user }, origin)
      return
    }

    if (path === '/api/accounts') {
      if (!user) {
        send(res, 401, { error: 'Unauthorized' }, origin)
        return
      }
      if (user.role !== 'journalist') {
        send(res, 403, { error: 'Forbidden' }, origin)
        return
      }
      if (req.method === 'GET') {
        send(res, 200, { accounts: listAccounts() }, origin)
        return
      }
      if (req.method === 'PUT') {
        const body = await readBody(req)
        send(res, 200, { accounts: replaceAccounts(body?.accounts ?? []) }, origin)
        return
      }
      if (req.method === 'POST') {
        const body = await readBody(req)
        send(res, 200, { account: upsertAccount(body ?? {}) }, origin)
        return
      }
    }

    const delAcc = path.match(/^\/api\/accounts\/([^/]+)$/)
    if (req.method === 'DELETE' && delAcc) {
      if (!user) {
        send(res, 401, { error: 'Unauthorized' }, origin)
        return
      }
      if (user.role !== 'journalist') {
        send(res, 403, { error: 'Forbidden' }, origin)
        return
      }
      const ok = deleteAccount(decodeURIComponent(delAcc[1]))
      if (!ok) {
        send(res, 404, { error: 'Not found' }, origin)
        return
      }
      send(res, 200, { ok: true }, origin)
      return
    }

    if (req.method === 'GET' && path === '/api/groups') {
      if (!user) {
        send(res, 401, { error: 'Unauthorized' }, origin)
        return
      }
      send(res, 200, { groups: listGroups() }, origin)
      return
    }

    const bundle = path.match(/^\/api\/groups\/([^/]+)\/bundle$/)
    if (bundle) {
      if (!user) {
        send(res, 401, { error: 'Unauthorized' }, origin)
        return
      }
      const group = decodeURIComponent(bundle[1])
      if (!canAccessGroup(user, group)) {
        send(res, 403, { error: 'Немає доступу до цієї групи' }, origin)
        return
      }
      if (req.method === 'GET') {
        const b = getBundle(group)
        send(
          res,
          200,
          {
            group,
            people: b?.people ?? [],
            dutyTypes: b?.dutyTypes ?? [],
            assignments: b?.assignments ?? [],
            settings: b?.settings ?? null,
          },
          origin,
        )
        return
      }
      if (req.method === 'PUT') {
        if (user.role === 'cadet') {
          send(res, 403, { error: 'Курсант не може змінювати дані' }, origin)
          return
        }
        const body = await readBody(req)
        send(res, 200, putBundle(group, body ?? {}), origin)
        return
      }
    }

    send(res, 404, { error: 'Not found' }, origin)
  } catch (e) {
    send(res, 400, { error: e instanceof Error ? e.message : String(e) }, origin)
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[exelscci-server] http://0.0.0.0:${PORT}`)
})
