import { Film } from 'lucide-react'
import Dialog from './Dialog'

/** Модалка с видео-плеером для «мультиков КОЯ». */
export default function VideoModal({
  open,
  onClose,
  title,
  src,
  captions,
}: {
  open: boolean
  onClose: () => void
  title: string
  src: string
  /** Путь к .vtt-дорожке субтитров (WCAG 1.2.2). Когда появятся файлы —
   *  просто передавайте сюда путь, и субтитры включатся автоматически. */
  captions?: string
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel={title || 'Видео'}
      panelClassName="w-full max-w-3xl"
      title={<><Film size={17} className="shrink-0 text-alfa" /> <span className="truncate">{title}</span></>}
    >
      <div className="p-3 pt-2">
        <div className="overflow-hidden rounded-2xl bg-black">
          <video src={src} poster="/koya/koya-hero-crop.webp" controls className="aspect-video w-full">
            {captions && (
              <track kind="captions" src={captions} srcLang="ru" label="Русские субтитры" default />
            )}
          </video>
        </div>
        <p className="px-1 pt-2 text-xs text-ink-soft">
          Мультик КОЯ — эпизод недели. Посмотрите всей командой перед тем, как решать кейсы <span aria-hidden="true">🐾</span>
        </p>
      </div>
    </Dialog>
  )
}
