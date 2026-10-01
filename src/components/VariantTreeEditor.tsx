import { Plus, Trash2 } from 'lucide-react'
import type { DutyVariant } from '../types'
import { newVariant } from '../lib/defaults'

/** Редактор дерева підпунктів (можна додавати вкладені рівні). */
export function VariantTreeEditor({
  variants,
  onChange,
  zeroPoints,
  depth = 0,
}: {
  variants: DutyVariant[]
  onChange: (next: DutyVariant[]) => void
  zeroPoints?: boolean
  depth?: number
}) {
  const updateAt = (index: number, patch: Partial<DutyVariant>) => {
    const next = variants.map((v, i) => (i === index ? { ...v, ...patch } : v))
    onChange(next)
  }

  const setChildren = (index: number, children: DutyVariant[]) => {
    const next = variants.map((v, i) =>
      i === index ? { ...v, children: children.length ? children : undefined } : v,
    )
    onChange(next)
  }

  return (
    <div
      className={
        depth === 0
          ? 'mt-2 space-y-2 rounded border border-border bg-surface-2 p-2'
          : 'mt-1.5 space-y-1.5 border-l border-border pl-2'
      }
    >
      {depth === 0 && (
        <p className="text-[10px] text-fg-faint">
          Назва · коротко · бали · осіб. Осіб і бали — на листках (без вкладених).
        </p>
      )}
      {variants.map((v, vi) => {
        const hasChildren = (v.children?.length ?? 0) > 0
        return (
          <div key={v.id} className="rounded-md bg-surface/40 p-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                className="input min-w-0 flex-1 py-0.5 text-xs"
                value={v.name}
                placeholder="Назва"
                onChange={(e) => updateAt(vi, { name: e.target.value })}
              />
              <input
                className="input w-16 py-0.5 text-center text-xs uppercase"
                maxLength={8}
                value={v.short}
                title="Коротко"
                onChange={(e) => updateAt(vi, { short: e.target.value.toUpperCase() })}
              />
              <input
                type="number"
                step="0.5"
                className="input w-14 py-0.5 text-center text-xs"
                value={zeroPoints ? 0 : v.points}
                disabled={zeroPoints || hasChildren}
                title={hasChildren ? 'Бали задаються на вкладених підпунктах' : 'Бали'}
                onChange={(e) => updateAt(vi, { points: Number(e.target.value) || 0 })}
              />
              <input
                type="number"
                min={1}
                className="input w-12 py-0.5 text-center text-xs"
                value={v.defaultSlots ?? 1}
                disabled={hasChildren}
                title={
                  hasChildren
                    ? 'Кількість осіб задається на вкладених підпунктах'
                    : 'Скільки людей на цей підпункт'
                }
                onChange={(e) =>
                  updateAt(vi, {
                    defaultSlots: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                  })
                }
              />
              <button
                type="button"
                className="btn-ghost btn-sm"
                title="Додати вкладений підпункт"
                onClick={() =>
                  setChildren(vi, [
                    ...(v.children ?? []),
                    newVariant(zeroPoints ? { points: 0 } : undefined),
                  ])
                }
              >
                <Plus size={12} />
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm text-tint-red"
                onClick={() => onChange(variants.filter((_, i) => i !== vi))}
              >
                <Trash2 size={12} />
              </button>
            </div>
            {hasChildren && (
              <VariantTreeEditor
                variants={v.children!}
                onChange={(children) => setChildren(vi, children)}
                zeroPoints={zeroPoints}
                depth={depth + 1}
              />
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="btn-secondary btn-sm"
        onClick={() => onChange([...variants, newVariant(zeroPoints ? { points: 0 } : undefined)])}
      >
        <Plus size={12} /> {depth === 0 ? 'Підпункт' : 'Вкладений'}
      </button>
    </div>
  )
}
