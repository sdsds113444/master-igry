import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Короткий залп конфетти в брендовых цветах. Рендерится поверх контейнера
 * (position: absolute; inset: 0; pointer-events: none) и осыпается один раз.
 * Показывать через ключ/условие, чтобы сыграл единожды (напр. при входе в топ-3).
 * При prefers-reduced-motion не рендерит ничего.
 */
const COLORS = ['#ef3124', '#ffc244', '#6a4bd6', '#b6208f', '#46c08d', '#ff6a5c']

export default function Confetti({ count = 36 }: { count?: number }) {
  const reduce = useReducedMotion()

  // Параметры частиц фиксируем один раз, чтобы ре-рендер родителя не перезапускал залп.
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100, // %
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6, // px
        delay: Math.random() * 0.25, // s
        duration: 1.4 + Math.random() * 1.1, // s
        drift: (Math.random() - 0.5) * 120, // px горизонтального сноса
        spin: 180 + Math.random() * 540, // deg
        rounded: Math.random() > 0.5,
      })),
    [count],
  )

  if (reduce) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: p.rounded ? '999px' : '2px',
          }}
          initial={{ y: '-10%', x: 0, opacity: 0, rotate: 0 }}
          animate={{
            y: '120%',
            x: p.drift,
            opacity: [0, 1, 1, 0],
            rotate: p.spin,
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}
