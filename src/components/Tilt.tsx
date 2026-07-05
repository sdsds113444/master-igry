import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion'

/**
 * 3D-наклон «открытки»: содержимое слегка поворачивается вслед за курсором (desktop)
 * и наклоном телефона (гироскоп, best-effort). Только визуальный эффект — верстку
 * внутри не трогает. Уважает prefers-reduced-motion: там наклон полностью выключен.
 *
 * Внешний слой задаёт perspective, внутренний поворачивается по rotateX/rotateY через
 * пружину (useSpring) — движение плавно догоняет курсор и мягко возвращается в ноль.
 * Лёгкий baseline-scale (1.04) прячет края картинки при повороте.
 */
export default function Tilt({
  children,
  max = 7,
  className,
  style,
}: {
  children: ReactNode
  max?: number
  className?: string
  style?: CSSProperties
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  // Позиция указателя в пределах элемента: -0.5..0.5 по каждой оси.
  const px = useMotionValue(0)
  const py = useMotionValue(0)

  const spring = { stiffness: 150, damping: 18, mass: 0.4 }
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [max, -max]), spring)
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-max, max]), spring)

  // Гироскоп (моб): gamma — наклон влево/вправо, beta — вперёд/назад. Держим телефон
  // под ~45° как «ноль», делим на 45° и зажимаем в -0.5..0.5. iOS без разрешения
  // событие не шлёт — тогда просто нет наклона, ничего не ломается.
  // Слушаем ТОЛЬКО пока элемент в зоне видимости: иначе deviceorientation дёргал бы
  // спринги, даже когда баннер прокручен за экран.
  useEffect(() => {
    if (reduce) return
    const el = ref.current
    if (!el) return
    let listening = false
    function onOrient(e: DeviceOrientationEvent) {
      const g = e.gamma ?? 0
      const b = (e.beta ?? 0) - 45
      px.set(Math.max(-0.5, Math.min(0.5, g / 45)))
      py.set(Math.max(-0.5, Math.min(0.5, b / 45)))
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !listening) {
        window.addEventListener('deviceorientation', onOrient)
        listening = true
      } else if (!entry.isIntersecting && listening) {
        window.removeEventListener('deviceorientation', onOrient)
        listening = false
      }
    })
    io.observe(el)
    return () => {
      io.disconnect()
      if (listening) window.removeEventListener('deviceorientation', onOrient)
    }
  }, [reduce, px, py])

  if (reduce) {
    // Без анимаций — прозрачная обёртка, чтобы разметка не менялась.
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, perspective: 900 }}
      onPointerMove={(e) => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        px.set((e.clientX - r.left) / r.width - 0.5)
        py.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onPointerLeave={() => {
        px.set(0)
        py.set(0)
      }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          scale: 1.04,
          transformStyle: 'preserve-3d',
          height: '100%',
          width: '100%',
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}
