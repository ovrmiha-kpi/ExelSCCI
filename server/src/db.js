import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
fs.mkdirSync(dataDir, { recursive: true })

const accountsPath = path.join(dataDir, 'accounts.json')
const groupsDir = path.join(dataDir, 'groups')
fs.mkdirSync(groupsDir, { recursive: true })

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function groupFile(groupKey) {
  const safe = String(groupKey).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  return path.join(groupsDir, `${safe}.json`)
}

export function loadAccountsRaw() {
  return readJson(accountsPath, [])
}

export function saveAccountsRaw(list) {
  writeJson(accountsPath, list)
}

export function getBundle(groupKey) {
  const group = String(groupKey || '').trim()
  if (!group) return null
  const raw = readJson(groupFile(group), null)
  if (!raw) {
    return { group, people: [], dutyTypes: [], assignments: [], settings: null }
  }
  return {
    group,
    people: Array.isArray(raw.people) ? raw.people : [],
    dutyTypes: Array.isArray(raw.dutyTypes) ? raw.dutyTypes : [],
    assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
    settings: raw.settings ?? null,
  }
}

export function putBundle(groupKey, bundle) {
  const group = String(groupKey || '').trim()
  if (!group) throw new Error('group required')
  const people = (Array.isArray(bundle.people) ? bundle.people : []).map((p) => ({
    ...p,
    group: p.group || group,
  }))
  const dutyTypes = (Array.isArray(bundle.dutyTypes) ? bundle.dutyTypes : []).map((d) => ({
    ...d,
    group: d.group || group,
  }))
  const assignments = Array.isArray(bundle.assignments) ? bundle.assignments : []
  const settings = bundle.settings ?? null
  writeJson(groupFile(group), {
    group,
    people,
    dutyTypes,
    assignments,
    settings,
    updatedAt: Date.now(),
  })
  return getBundle(group)
}

export function listGroups() {
  if (!fs.existsSync(groupsDir)) return []
  return fs
    .readdirSync(groupsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = readJson(path.join(groupsDir, f), null)
      return raw?.group || f.replace(/\.json$/, '')
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'uk'))
}
