import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

/**
 * Число, которое «докручивается» от прошлого значения к новому (count-up). На первом
 * появлении это эффектный старт (0 → 4.9), при фоновом обновлении — плавный переход
 * от предыдущего значения к новому, а не рывок. При prefers-reduced-motion показываем
 * сразу конечное значение без анимации.
 */
export default function CountUp({
  value,
  decimals = 0,
  duration = 0.9,
  className,
}: {
  value: number
  decimals?: number
  duration?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(reduce ? value : 0)
  const prev = useRef(reduce ? value : 0)

  useEffect(() => {
    if (reduce) {
      setDisplay(value)
      prev.current = value
      return
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    })
    prev.current = value
    return () => controls.stop()
  }, [value, duration, reduce])

  return <span className={className}>{display.toFixed(decimals)}</span>
}
