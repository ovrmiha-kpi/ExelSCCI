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
          `Замінити поточні дані? У файлі: ${data.people.length} осіб, ${data.dutyTypes.length} видів нарядів, ${data.assignments.length} записів.`,
        )
      )
        return
      replaceAll(data)
      setMsg('Дані відновлено з файлу.')
    } catch (e) {
      setMsg(`Помилка імпорту: ${(e as Error).message}`)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Правила автопризначення</h2>

        <Field
          label="Мінімальна перерва між нарядами, днів"
          hint="0 — можна щодня; 1 — не два дні поспіль; 2 — мінімум один вільний день між нарядами. Якщо людей не вистачає, правило порушується з попередженням."
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
          label="За рівного рейтингу не ставити в той самий наряд, що й минулого разу"
        />
        <Toggle
          checked={settings.randomTies}
          onChange={(v) => updateSettings({ randomTies: v })}
          label="Повні нічиї розбивати випадково (інакше — за алфавітом)"
        />

        <div className="rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          <p className="mb-1 font-medium text-slate-700">Як обирається людина</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Тільки «У строю», не зайняті цього дня, з дотриманням перерви.</li>
            <li>Найменше балів (початкові + за всі наряди).</li>
            <li>Не ходив у цей самий наряд минулого разу (якщо увімкнено).</li>
            <li>Найдовше відпочивав.</li>
            <li>Рідше ходив саме в цей вид наряду.</li>
            <li>Випадково / за алфавітом.</li>
          </ol>
          <p className="mt-2">
            Наряди з більшою вартістю роздаються першими, тому найбільш «відпочилі» отримують найважчі.
          </p>
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-slate-800">Дані</h2>
        <p className="text-sm text-slate-600">
          Усе зберігається в цьому браузері (localStorage): {counts.p} осіб, {counts.d} видів нарядів, {counts.a}{' '}
          записів. Регулярно робіть резервну копію — файл можна відкрити на іншому комп’ютері.
        </p>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => exportJSON(exportData())}>
            <Download size={14} /> Завантажити резервну копію
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Відновити з файлу
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
              if (counts.p === 0 || confirm('Завантажити демо-дані? Поточні дані буде замінено.')) {
                loadDemo()
                setMsg('Завантажено демо-дані.')
              }
            }}
          >
            <FlaskConical size={14} /> Демо-дані
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('Видалити ВСІ дані? Цю дію не можна скасувати.')) {
                resetAll()
                setMsg('Дані очищено.')
              }
            }}
          >
            <Trash2 size={14} /> Очистити все
          </button>
        </div>
      </section>
    </div>
  )
}
