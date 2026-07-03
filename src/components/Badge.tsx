import type { CSSProperties, ReactNode } from 'react'

/** Пилюля-бейдж единой формы (сложность кейса, статус игры, место приза).
 *  Цвет задаётся либо utility-классами через className (напр. bg-success/15
 *  text-success), либо произвольной парой bg/fg через style. */
export default function Badge({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${className}`}
      style={style}
    >
      {children}
    </span>
  )
}
