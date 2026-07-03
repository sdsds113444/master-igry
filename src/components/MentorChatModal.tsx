import Dialog from './Dialog'
import ChatThread from './ChatThread'

/** Приватный чат «команда ↔ тренер» (channel='mentor'). Переиспользуется
 *  и в кабинете команды (свой teamId), и в админке (по каждой команде).
 *  Вся логика сообщений — в общем ChatThread, обвязка модалки — в Dialog. */
export default function MentorChatModal({
  open,
  onClose,
  teamId,
  teamName,
  asAdmin = false,
}: {
  open: boolean
  onClose: () => void
  teamId: string
  teamName: string
  asAdmin?: boolean
}) {
  const heading = asAdmin ? `Чат с командой «${teamName}»` : 'Чат команды с тренером'
  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel={heading}
      panelClassName="flex max-h-[80vh] w-full max-w-md flex-col"
      title={<span className="truncate">{heading}</span>}
    >
      <div className="flex min-h-0 flex-1 flex-col p-4 pt-2">
        <ChatThread
          teamId={teamId}
          channel="mentor"
          asAdmin={asAdmin}
          active={open}
          scrollClass="min-h-[160px] flex-1 rounded-2xl sf-1 p-3"
          msgPlaceholder={asAdmin ? 'Ответить команде…' : 'Написать тренеру…'}
          emptyText={asAdmin ? 'Команда ещё не писала. Можете написать первыми.' : 'Пока пусто — напишите тренеру вопрос.'}
        />
      </div>
    </Dialog>
  )
}
