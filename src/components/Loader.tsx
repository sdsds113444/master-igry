import { Loader2 } from 'lucide-react'

/** Единый центрированный спиннер загрузки (раньше блок копировался по страницам). */
export default function Loader({ minH = '40vh' }: { minH?: string }) {
  return (
    <div className="grid place-items-center text-ink-soft" style={{ minHeight: minH }}>
      <Loader2 className="animate-spin" />
    </div>
  )
}
