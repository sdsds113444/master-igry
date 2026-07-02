import { Star } from 'lucide-react'

/** Золотые звёзды рейтинга (как на карточке «РЕЙТИНГ ГЕРОЯ»). */
export default function Stars({ value, size = 18 }: { value: number; size?: number }) {
  const full = Math.floor(value)
  const half = value - full >= 0.5
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const active = i < full
        const isHalf = i === full && half
        return (
          <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
            <Star size={size} className="absolute text-black/10" fill="currentColor" strokeWidth={0} />
            {(active || isHalf) && (
              <span
                className="absolute overflow-hidden"
                style={{ width: isHalf ? size / 2 : size, height: size }}
              >
                <Star size={size} style={{ color: 'var(--color-gold)' }} fill="currentColor" strokeWidth={0} />
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}
