import { X } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import type { DutyType, PersonStatus } from '../types'
import { PERSON_STATUS_LABEL } from '../types'

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
  title: string
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[6vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={clsx(
          'card w-full shadow-xl',
          wide ? 'max-w-4xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm -mr-1" onClick={onClose} aria-label="Закрити">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-3">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div>
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
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function DutyBadge({ duty, short }: { duty: DutyType | undefined; short?: boolean }) {
  if (!duty) return <span className="badge bg-slate-100 text-slate-500">—</span>
  return (
    <span
      className="badge text-white"
      style={{ backgroundColor: duty.color }}
      title={`${duty.name} · ${duty.points} б.`}
    >
      {short ? duty.short : duty.name}
    </span>
  )
}

const STATUS_STYLE: Record<PersonStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  sick: 'bg-amber-100 text-amber-800',
  leave: 'bg-sky-100 text-sky-800',
  excluded: 'bg-slate-200 text-slate-600',
}

export function StatusBadge({ status }: { status: PersonStatus }) {
  return <span className={clsx('badge', STATUS_STYLE[status])}>{PERSON_STATUS_LABEL[status]}</span>
}

export function EmptyState({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-base font-medium text-slate-700">{title}</p>
      {children && <div className="text-sm text-slate-500">{children}</div>}
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
      <span className="relative h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
      <span>{label}</span>
    </label>
  )
}