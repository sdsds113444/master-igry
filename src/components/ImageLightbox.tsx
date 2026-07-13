import { ImageIcon } from 'lucide-react'
import Dialog from './Dialog'

/** Модалка-лайтбокс: скриншот кейса на весь экран, чтобы читать мелкий текст. */
export default function ImageLightbox({
  open,
  onClose,
  src,
  alt,
}: {
  open: boolean
  onClose: () => void
  src: string
  alt: string
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel={alt}
      panelClassName="w-full max-w-[96vw] max-h-[96dvh] overflow-auto sm:max-w-[92vw]"
      title={<><ImageIcon size={17} className="shrink-0 text-alfa" /> <span className="truncate">{alt}</span></>}
    >
      <div className="grid place-items-center p-3 pt-2">
        <img src={src} alt={alt} className="max-h-[85dvh] w-auto max-w-full rounded-xl" />
      </div>
    </Dialog>
  )
}
