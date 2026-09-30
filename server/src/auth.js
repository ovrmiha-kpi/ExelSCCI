import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuid } from 'uuid'
import { loadAccountsRaw, saveAccountsRaw } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'exelscci-dev-secret-change-me'
const JWT_DAYS = Number(process.env.JWT_DAYS || 30)
const ROLES = new Set(['journalist', 'cmd_section_1', 'cmd_section_2', 'cmd_group', 'cadet'])

export const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'ovrmiha'
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'A80cvNys'

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

export function ensureAdminAccount() {
  const list = loadAccountsRaw().map(normalizeAccount).filter(Boolean)
  const idx = list.findIndex((a) => a.login.toLowerCase() === ADMIN_LOGIN.toLowerCase())
  if (idx >= 0) {
    saveAccountsRaw(list)
    return
  }
  list.unshift({
    id: `acc-${uuid()}`,
    login: ADMIN_LOGIN,
    passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
    role: 'journalist',
    displayName: 'Журналіст',
    groupLock: null,
  })
  saveAccountsRaw(list)
}

export function listAccounts() {
  return loadAccountsRaw().map(normalizeAccount).filter(Boolean).map(publicAccount)
}

export function findAccountByLogin(login) {
  const key = String(login || '').trim().toLowerCase()
  return loadAccountsRaw().map(normalizeAccount).filter(Boolean).find((a) => a.login.toLowerCase() === key) || null
}

export function verifyLogin(login, password) {
  const acc = findAccountByLogin(login)
  if (!acc || !acc.passwordHash) return null
  if (!bcrypt.compareSync(String(password || ''), acc.passwordHash)) return null
  return publicAccount(acc)
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      login: user.login,
      role: user.role,
      displayName: user.displayName,
      groupLock: user.groupLock,
    },
    JWT_SECRET,
    { expiresIn: `${JWT_DAYS}d` },
  )
}

export function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = {
      id: payload.sub,
      login: payload.login,
      role: payload.role,
      displayName: payload.displayName,
      groupLock: payload.groupLock ?? null,
    }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function requireJournalist(req, res, next) {
  if (req.user?.role !== 'journalist') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

export function canAccessGroup(user, group) {
  if (!user) return false
  if (!user.groupLock) return true
  return user.groupLock === group
}

export function upsertAccount(input) {
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
      existing.passwordHash = bcrypt.hashSync(input.password, 10)
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
    passwordHash: bcrypt.hashSync(input.password, 10),
    role,
    displayName,
    groupLock,
  }
  list.push(acc)
  saveAccountsRaw(list)
  return publicAccount(acc)
}

export function deleteAccount(id) {
  const list = loadAccountsRaw().map(normalizeAccount).filter(Boolean)
  const acc = list.find((a) => a.id === id)
  if (!acc) return false
  if (acc.login.toLowerCase() === ADMIN_LOGIN.toLowerCase()) {
    throw new Error('Не можна видалити адмін-акаунт')
  }
  saveAccountsRaw(list.filter((a) => a.id !== id))
  return true
}
