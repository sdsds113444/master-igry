import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

/** Модалка с видео-плеером для «мультиков КОЯ». */
export default function VideoModal({
  open,
  onClose,
  title,
  src,
}: {
  open: boolean
  onClose: () => void
  title: string
  src: string
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="glass-strong relative z-10 w-full max-w-3xl overflow-hidden rounded-[28px] p-3"
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          >
            <div className="flex items-center justify-between px-2 py-2">
              <div className="flex items-center gap-2 font-display text-[15px] font-extrabold">
                🎬 {title}
              </div>
              <button
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/60 text-ink-soft transition-colors hover:bg-white hover:text-alfa"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl bg-black">
              <video
                src={src}
                poster="/koya/koya-hero-crop.jpg"
                controls
                className="aspect-video w-full"
              />
            </div>
            <p className="px-2 py-2 text-xs text-ink-soft">
              Демо-ролик. Сюда организатор загрузит мультик КОЯ — эпизод недели
              (ссылкой на YouTube/VK/Rutube или файлом).
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
