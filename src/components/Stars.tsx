import { Star } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

/** Золотые звёзды рейтинга (как на карточке «РЕЙТИНГ ГЕРОЯ»).
 *  animate — поочерёдно «загораются» слева направо (эффект для геройской карточки).
 *  Прочие вызовы без пропа работают как раньше (мгновенный статичный рендер). */
export default function Stars({ value, size = 18, animate: doAnimate = false }: { value: number; size?: number; animate?: boolean }) {
  const reduce = useReducedMotion()
  const full = Math.floor(value)
  const half = value - full >= 0.5
  const play = doAnimate && !reduce
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const active = i < full
        const isHalf = i === full && half
        const goldStar = (active || isHalf) && (
          <span
            className="absolute overflow-hidden"
            style={{ width: isHalf ? size / 2 : size, height: size }}
          >
            <Star size={size} style={{ color: 'var(--color-gold)' }} fill="currentColor" strokeWidth={0} />
          </span>
        )
        return (
          <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
            <Star size={size} className="absolute text-black/10" fill="currentColor" strokeWidth={0} />
            {play ? (
              <motion.span
                className="absolute inset-0"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.12, type: 'spring', stiffness: 300, damping: 14 }}
              >
                {goldStar}
              </motion.span>
            ) : (
              goldStar
            )}
          </span>
        )
      })}
    </div>
  )
}
