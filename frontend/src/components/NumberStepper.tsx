type Props = {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  className?: string
}

export function NumberStepper({ value, min, max, onChange, className = '' }: Props) {
  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(value - 1, min))}
        disabled={value <= min}
        className="w-9 h-9 rounded-lg border border-line text-ink-soft hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg leading-none"
        aria-label="減らす"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-bold select-none">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(value + 1, max))}
        disabled={value >= max}
        className="w-9 h-9 rounded-lg border border-line text-ink-soft hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg leading-none"
        aria-label="増やす"
      >
        ＋
      </button>
    </div>
  )
}
