import type { AppData, Assignment, DutyType, Person, PersonTag } from '../types'
import { PERSON_STATUS_LABEL } from '../types'
import type { PersonStats } from './stats'
import { formatShort, todayISO } from './dates'
import { parseNameAndTags } from './groupC55'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportJSON(data: AppData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  download(blob, `ExelSCCI-backup-${todayISO()}.json`)
}

export async function exportRatingXLSX(
  rows: PersonStats[],
  dutyTypes: DutyType[],
  mode: 'count' | 'points',
) {
  const XLSX = await import('xlsx')
  const header = [
    '№',
    'ПІБ',
    'Група',
    'Статус',
    ...dutyTypes.map((d) => `${d.name} (${mode === 'count' ? 'разів' : 'бали'})`),
    'Всього нарядів',
    'Початкові бали',
    'Бали за наряди',
    'Разом балів',
    'Останній наряд',
    'Днів відпочинку',
  ]
  const body = rows.map((s, i) => [
    i + 1,
    s.person.name,
    s.person.group,
    PERSON_STATUS_LABEL[s.person.status],
    ...dutyTypes.map((d) =>
      mode === 'count' ? (s.countByDuty[d.id] ?? 0) : (s.pointsByDuty[d.id] ?? 0),
    ),
    s.count,
    s.person.basePoints,
    s.earnedPoints,
    s.points,
    s.lastDate ? formatShort(s.lastDate) : '',
    s.daysSinceLast ?? '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([header, ...body])
  ws['!cols'] = header.map((h, i) => ({ wch: i === 1 ? 28 : Math.max(8, Math.min(24, h.length + 2)) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Рейтинг')
  XLSX.writeFile(wb, `ExelSCCI-rating-${todayISO()}.xlsx`)
}

export async function exportJournalXLSX(
  assignments: Assignment[],
  people: Person[],
  dutyTypes: DutyType[],
) {
  const XLSX = await import('xlsx')
  const pById = new Map(people.map((p) => [p.id, p]))
  const dById = new Map(dutyTypes.map((d) => [d.id, d]))
  const header = ['Дата', 'Наряд', 'ПІБ', 'Група', 'Бали', 'Джерело', 'Примітка']
  const body = [...assignments]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((a) => {
      const p = pById.get(a.personId)
      const d = dById.get(a.dutyTypeId)
      return [
        formatShort(a.date),
        d?.name ?? '—',
        p?.name ?? '—',
        p?.group ?? '',
        a.points,
        a.source === 'auto' ? 'авто' : 'вручну',
        a.note,
      ]
    })
  const ws = XLSX.utils.aoa_to_sheet([header, ...body])
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 30 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Журнал')
  XLSX.writeFile(wb, `ExelSCCI-journal-${todayISO()}.xlsx`)
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(r.error)
    r.readAsText(file, 'utf-8')
  })
}

/**
 * Розбір вставленого списку людей. Кожен рядок: `ПІБ`, `ПІБ;Група`, `ПІБ;Група;Бали`.
 * У ПІБ розпізнаються позначки `(ж)` і `(к)`.
 * Роздільники: `;`, `\t`, `,`.
 */
export function parsePeopleList(
  text: string,
): Array<{ name: string; group: string; basePoints: number; tags: PersonTag[] }> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[;\t,]/).map((s) => s.trim())
      const parsed = parseNameAndTags(parts[0] ?? '')
      const group = parts[1] ?? ''
      const basePoints = Number(parts[2] ?? 0) || 0
      return { name: parsed.name, group, basePoints, tags: parsed.tags }
    })
    .filter((r) => r.name.length > 0)
}
