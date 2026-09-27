import { useRef, useState } from 'react'
import { Download, FlaskConical, Trash2, Upload } from 'lucide-react'
import { exportData, parseImportedData, useStore } from '../store'
import { exportJSON, readFileAsText } from '../lib/export'
import { Field, Toggle } from './ui'

export function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const replaceAll = useStore((s) => s.replaceAll)
  const resetAll = useStore((s) => s.resetAll)
  const loadDemo = useStore((s) => s.loadDemo)
  const peopleCount = useStore((s) => s.people.length)
  const dutyCount = useStore((s) => s.dutyTypes.length)
  const assignmentCount = useStore((s) => s.assignments.length)
  const counts = { p: peopleCount, d: dutyCount, a: assignmentCount }

  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const onImport = async (file: File) => {
    try {
      const text = await readFileAsText(file)
      const data = parseImportedData(JSON.parse(text))
      if (
        !confirm(
          `Заменить текущие данные? В файле: ${data.people.length} чел., ${data.dutyTypes.length} видов нарядов, ${data.assignments.length} записей.`,
        )
      )
        return
      replaceAll(data)
      setMsg('Данные восстановлены из файла.')
    } catch (e) {
      setMsg(`Ошибка импорта: ${(e as Error).message}`)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Правила автоназначения</h2>

        <Field
          label="Минимальный перерыв между нарядами, дней"
          hint="0 — можно каждый день; 1 — не два дня подряд; 2 — минимум один свободный день между нарядами. Если людей не хватает, правило нарушается с предупреждением."
        >
          <input
            type="number"
            min={0}
            max={30}
            className="input w-32"
            value={settings.cooldownDays}
            onChange={(e) => updateSettings({ cooldownDays: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>

        <Toggle
          checked={settings.avoidRepeatDuty}
          onChange={(v) => updateSettings({ avoidRepeatDuty: v })}
          label="При равном рейтинге не ставить в тот же наряд, что и в прошлый раз"
        />
        <Toggle
          checked={settings.randomTies}
          onChange={(v) => updateSettings({ randomTies: v })}
          label="Полные ничьи разбивать случайно (иначе — по алфавиту)"
        />

        <div className="rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          <p className="mb-1 font-medium text-slate-700">Как выбирается человек</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Только «В строю», не занятые в этот день, с соблюдением перерыва.</li>
            <li>Меньше всего баллов (начальные + за все наряды).</li>
            <li>Не ходил в этот же наряд в прошлый раз (если включено).</li>
            <li>Дольше всех отдыхал.</li>
            <li>Реже ходил именно в этот вид наряда.</li>
            <li>Случайно / по алфавиту.</li>
          </ol>
          <p className="mt-2">
            Наряды с большей стоимостью раздаются первыми, поэтому самые «отдохнувшие» получают самые тяжёлые.
          </p>
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Данные</h2>
        <p className="text-sm text-slate-600">
          Всё хранится в этом браузере (localStorage): {counts.p} чел., {counts.d} видов нарядов, {counts.a} записей.
          Регулярно делайте резервную копию — файл можно открыть на другом компьютере.
        </p>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => exportJSON(exportData())}>
            <Download size={14} /> Скачать резервную копию
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Восстановить из файла
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
              e.target.value = ''
            }}
          />
        </div>

        {msg && <p className="text-sm text-slate-700">{msg}</p>}

        <hr className="border-slate-200" />

        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              if (counts.p === 0 || confirm('Загрузить демо-данные? Текущие данные будут заменены.')) {
                loadDemo()
                setMsg('Загружены демо-данные.')
              }
            }}
          >
            <FlaskConical size={14} /> Демо-данные
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('Удалить ВСЕ данные? Это действие нельзя отменить.')) {
                resetAll()
                setMsg('Данные очищены.')
              }
            }}
          >
            <Trash2 size={14} /> Очистить всё
          </button>
        </div>
      </section>
    </div>
  )
}
