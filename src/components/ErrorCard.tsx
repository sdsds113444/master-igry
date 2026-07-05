/** Единая карточка «не удалось загрузить» с кнопкой перезагрузки страницы.
 *  Раньше эта разметка была скопирована в Board и TeamCabinet. */
export default function ErrorCard({
  title,
  hint = 'Проверьте соединение и обновите страницу.',
}: {
  title: string
  hint?: string
}) {
  return (
    <div className="glass rounded-glass p-8 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      <button onClick={() => window.location.reload()} className="btn-alfa mt-4 rounded-2xl px-5 py-2.5 text-sm font-bold">
        Обновить
      </button>
    </div>
  )
}
