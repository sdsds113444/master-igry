import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Send, X, Loader2 } from 'lucide-react'
import { listMessages, sendMessage, subscribeMessages, getDisplayName, setDisplayName, type ChatMsg } from '../lib/db'

/** Приватный чат «команда ↔ тренер» (channel='mentor'). Переиспользуется
 *  и в кабинете команды (свой teamId), и в админке (по каждой команде). */
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
  const [loading, setLoading] = useState(true)
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [myName, setMyName] = useState(asAdmin ? 'Тренер' : (getDisplayName() ?? ''))
  const nameConfirmed = asAdmin || !!getDisplayName()

  useEffect(() => {
    if (!open) return
    let unsub: { unsubscribe(): void } | null = null
    let cancelled = false

    async function load() {
      setLoading(true)
      const msgs = await listMessages(teamId, 'mentor')
      if (cancelled) return
      setChat(msgs)
      setLoading(false)
      const liveSub = subscribeMessages(teamId, (m) => setChat((c) => [...c, m]), 'mentor')
      if (cancelled) { liveSub.unsubscribe(); return }
      unsub = liveSub
    }
    load()

    return () => { cancelled = true; unsub?.unsubscribe() }
  }, [open, teamId])

  function saveName(e: React.FormEvent) {
    e.preventDefault()
    const n = myName.trim()
    if (!n) return
    setDisplayName(n)
    setMyName(n)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    await sendMessage(teamId, asAdmin ? 'Тренер' : (getDisplayName() ?? myName), text, 'mentor')
  }

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
            className="glass-strong relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-[28px] p-4"
            style={{ maxHeight: '80vh' }}
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          >
            <div className="flex items-center justify-between px-1 pb-3">
              <div className="font-display text-[15px] font-extrabold">
                {asAdmin ? `Чат с командой «${teamName}»` : 'Личный чат с тренером'}
              </div>
              <button
                onClick={onClose}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/60 text-ink-soft transition-colors hover:bg-white hover:text-alfa"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-[160px] flex-1 space-y-2 overflow-y-auto rounded-2xl bg-white/40 p-3">
              {loading ? (
                <div className="grid h-full place-items-center text-ink-soft">
                  <Loader2 className="animate-spin" />
                </div>
              ) : chat.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-soft">
                  {asAdmin ? 'Команда ещё не писала. Можете написать первыми.' : 'Пока пусто — напишите тренеру вопрос.'}
                </p>
              ) : (
                chat.map((m) => (
                  <div key={m.id} className={`flex ${m.me ? 'justify-end' : ''}`}>
                    <div className={`max-w-[82%] rounded-2xl px-3 py-2 ${m.me ? 'bg-alfa text-white' : 'bg-white/85'}`}>
                      {!m.me && <div className="text-[11px] font-bold text-ink-soft">{m.author}</div>}
                      <div className="text-sm">{m.text}</div>
                      <div className={`mt-0.5 text-[10px] ${m.me ? 'text-white/70' : 'text-ink-soft/70'}`}>{m.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {!nameConfirmed ? (
              <form onSubmit={saveName} className="mt-3 flex gap-2">
                <input
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  placeholder="Как вас называть в чате?"
                  className="flex-1 rounded-2xl border border-black/5 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-alfa/40"
                  autoFocus
                />
                <button type="submit" className="btn-alfa rounded-2xl px-4 py-2.5 text-sm font-bold">Ок</button>
              </form>
            ) : (
              <form onSubmit={send} className="mt-3 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={asAdmin ? 'Ответить команде…' : 'Написать тренеру…'}
                  className="flex-1 rounded-2xl border border-black/5 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-alfa/40"
                  autoFocus
                />
                <button type="submit" className="btn-alfa grid h-[42px] w-[42px] shrink-0 place-items-center rounded-2xl">
                  <Send size={16} />
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
