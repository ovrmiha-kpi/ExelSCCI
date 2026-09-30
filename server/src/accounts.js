import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { loadAccountsRaw, saveAccountsRaw } from './db.js'
import { ensureAdminAccount, listAccounts, ADMIN_LOGIN } from './auth.js'

/** Replace all accounts (passwords plaintext in import). */
export function replaceAccounts(list) {
  const next = []
  for (const raw of Array.isArray(list) ? list : []) {
    const login = String(raw.login || '').trim()
    if (!login) continue
    const role = ['journalist', 'cmd_section_1', 'cmd_section_2', 'cmd_group', 'cadet'].includes(
      raw.role,
    )
      ? raw.role
      : 'cadet'
    const displayName =
      typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName.trim()
        : role
    const groupLock =
      typeof raw.groupLock === 'string' && raw.groupLock.trim() ? raw.groupLock.trim() : null
    const id = raw.id || `acc-${uuid()}`
    let passwordHash = ''
    if (typeof raw.passwordHash === 'string' && raw.passwordHash.startsWith('$2')) {
      passwordHash = raw.passwordHash
    } else if (typeof raw.password === 'string' && raw.password.length >= 4) {
      passwordHash = bcrypt.hashSync(raw.password, 10)
    } else {
      passwordHash = bcrypt.hashSync('1111', 10)
    }
    next.push({ id, login, passwordHash, role, displayName, groupLock })
  }
  if (!next.some((a) => a.login.toLowerCase() === ADMIN_LOGIN.toLowerCase())) {
    // keep ensureAdmin after save
  }
  saveAccountsRaw(next)
  ensureAdminAccount()
  return listAccounts()
}
