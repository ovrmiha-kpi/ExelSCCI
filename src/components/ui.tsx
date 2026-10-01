import { X } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import type { DutyType, PersonStatus, PersonTag } from '../types'
import { PERSON_STATUS_LABEL, PERSON_STATUS_SHORT, PERSON_TAG_META } from '../types'
import { DUTY_COLORS } from '../lib/defaults'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-0 backdrop-blur-[2px] sm:items-start sm:p-4 sm:pt-[6vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={clsx(
          'card flex max-h-[92dvh] w-full flex-col rounded-b-none text-fg shadow-2xl shadow-black/40 sm:max-h-none sm:rounded-lg',
          wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="pr-2 text-base font-semibold text-fg">{title}</h2>
          <button className="btn-ghost btn-sm -mr-1 shrink-0" onClick={onClose} aria-label="Закрити">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        {footer && (
          <div className="safe-pb flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-fg-faint">{hint}</span>}
    </label>
  )
}

export function DutyBadge({
  duty,
  short,
  className,
}: {
  duty: DutyType | undefined
  short?: boolean
  className?: string
}) {
  if (!duty) return <span className={clsx('badge bg-surface-3 text-fg-faint', className)}>—</span>
  return (
    <span
      className={clsx('badge text-white shadow-sm shadow-black/30', className)}
      style={{ backgroundColor: duty.color }}
      title={`${duty.name} · ${duty.points} б.`}
    >
      {short ? duty.short : duty.name}
    </span>
  )
}

const STATUS_STYLE: Record<PersonStatus, string> = {
  roster: 'bg-tint-slate/20 text-tint-slate',
  active: 'bg-tint-emerald/15 text-tint-emerald',
  bedrest: 'bg-tint-amber/15 text-tint-amber',
  leave: 'bg-tint-sky/15 text-tint-sky',
  trip: 'bg-tint-orange/15 text-tint-orange',
  furlough: 'bg-tint-fuchsia/15 text-tint-fuchsia',
  hospital: 'bg-tint-red/15 text-tint-red',
  excluded: 'bg-tint-slate/20 text-tint-slate',
  sick: 'bg-tint-amber/15 text-tint-amber',
}

export function StatusBadge({ status, short }: { status: PersonStatus; short?: boolean }) {
  return (
    <span className={clsx('badge', STATUS_STYLE[status])} title={PERSON_STATUS_LABEL[status]}>
      {short ? PERSON_STATUS_SHORT[status] : PERSON_STATUS_LABEL[status]}
    </span>
  )
}

export function ColorPalette({
  value,
  onChange,
  colors = DUTY_COLORS,
}: {
  value: string
  onChange: (c: string) => void
  colors?: string[]
}) {
  const custom = value && !colors.some((c) => c.toLowerCase() === value.toLowerCase())
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          className={clsx(
            'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
            value.toLowerCase() === c.toLowerCase() ? 'border-fg scale-110' : 'border-transparent',
          )}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
      <label
        className={clsx(
          'relative flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed',
          custom ? 'border-fg' : 'border-border-strong',
        )}
        title="Свій колір"
      >
        <span className="absolute inset-0" style={{ backgroundColor: custom ? value : 'transparent' }} />
        <span className="relative text-[10px] font-bold text-fg-muted">+</span>
        <input
          type="color"
          value={value || '#559a2a'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}

export function TagBadge({ tag }: { tag: PersonTag }) {
  const m = PERSON_TAG_META[tag]
  return (
    <span className={clsx('badge uppercase', m.className)} title={m.label}>
      {m.short}
    </span>
  )
}

export function PersonTags({ tags }: { tags?: PersonTag[] }) {
  if (!tags?.length) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {tags.map((t) => (
        <TagBadge key={t} tag={t} />
      ))}
    </span>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-base font-medium text-fg">{title}</p>
      {children && <div className="max-w-xl text-sm text-fg-muted">{children}</div>}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm select-none">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="relative h-5 w-9 rounded-full bg-surface-4 transition-colors peer-checked:bg-brand-600 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
      <span className="text-fg-muted">{label}</span>
    </label>
  )
}

/** Група кнопок-перемикачів (сегментований контрол). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  title,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<[T, string]>
  title?: string
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5" title={title}>
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)} className={clsx('seg', value === k && 'seg-active')}>
          {label}
        </button>
      ))}
    </div>
  )
}
