import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import {
  listMessages, sendMessage, subscribeMessages, getDisplayName, setDisplayName,
  type ChatMsg, type ChatChannel,
} from '../lib/db'

/** Единый чат-тред: список сообщений + «представьтесь» + поле ввода + подписка realtime.
 *  Раньше эта логика и разметка были скопированы в TeamCabinet и MentorChatModal —
 *  теперь один источник, и обработка ошибок отправки/загрузки в одном месте. */
export default function ChatThread({
  teamId,
  channel = 'team',
  asAdmin = false,
  active = true,
  scrollClass = 'max-h-72',
  namePlaceholder = 'Как вас называть в чате?',
  msgPlaceholder = 'Написать…',
  emptyText = 'Пока пусто — напишите первыми.',
}: {
  teamId: string
  channel?: ChatChannel
  asAdmin?: boolean
  /** false → не грузим/не подписываемся (например, модалка закрыта). */
  active?: boolean
  scrollClass?: string
  namePlaceholder?: string
  msgPlaceholder?: string
  emptyText?: string
}) {
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [myName, setMyName] = useState(asAdmin ? 'Тренер' : (getDisplayName() ?? ''))
  const [confirmed, setConfirmed] = useState(asAdmin || !!getDisplayName())
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const LOAD_ERROR = 'Не удалось загрузить сообщения.'

  /** Дописать недостающие сообщения (дедуп по id — история/сокет/опрос могут пересекаться). */
  function mergeMessages(incoming: ChatMsg[]) {
    setChat((c) => {
      const seen = new Set(c.map((x) => x.id))
      const fresh = incoming.filter((m) => !seen.has(m.id))
      return fresh.length ? [...c, ...fresh] : c
    })
  }

  // Автопрокрутка к последним сообщениям: список рендерится хронологически сверху
  // вниз, новые приходят в конец — без этого свежий ответ тренера и своё
  // отправленное сообщение оставались бы за нижней кромкой видимой области.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.length])

  useEffect(() => {
    if (!active || !teamId) return
    let unsub: { unsubscribe(): void } | null = null
    let cancelled = false

    async function load() {
      try {
        const msgs = await listMessages(teamId, channel)
        if (cancelled) return
        // merge, а не setChat: если сокет успел доставить сообщение раньше, чем
        // догрузилась история, полная замена затёрла бы его.
        mergeMessages(msgs)
      } catch {
        if (!cancelled) setError(LOAD_ERROR)
      }
      // dedup по id — на случай повторной доставки (реконнект/двойная подписка в dev).
      // Если начальная загрузка упала, но сообщения потом доехали (опрос-фолбэк/сокет) —
      // гасим устаревший баннер ошибки загрузки (ошибку ОТПРАВКИ не трогаем).
      const liveSub = subscribeMessages(teamId, (m) => {
        mergeMessages([m])
        setError((prev) => (prev === LOAD_ERROR ? '' : prev))
      }, channel)
      if (cancelled) { liveSub.unsubscribe(); return }
      unsub = liveSub
    }
    load()

    return () => { cancelled = true; unsub?.unsubscribe() }
  }, [teamId, channel, active])

  function saveName(e: React.FormEvent) {
    e.preventDefault()
    const n = myName.trim()
    if (!n) return
    setDisplayName(n)
    setMyName(n)
    setConfirmed(true)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    setError('')
    try {
      await sendMessage(teamId, asAdmin ? 'Тренер' : (getDisplayName() ?? myName), text, channel)
      // Сразу дотягиваем историю: в polling-режиме (сокет заблокирован) своё сообщение
      // иначе появится только через ~8с — человек решит, что не отправилось, и зашлёт дубль.
      try {
        mergeMessages(await listMessages(teamId, channel))
      } catch { /* не страшно: доедет следующим опросом или по сокету */ }
    } catch {
      // Возвращаем текст только в ПУСТОЕ поле: отправка идёт секунды, за это время
      // пользователь мог начать печатать новое сообщение — не затираем его.
      setInput((cur) => (cur ? cur : text))
      setError('Сообщение не отправилось — попробуйте ещё раз.')
    }
  }

  return (
    <>
      <div ref={listRef} className={`space-y-2 overflow-y-auto pr-1 ${scrollClass}`}>
        {chat.map((m) => (
          <div key={m.id} className={`flex ${m.me ? 'justify-end' : ''}`}>
            <div className={`max-w-[82%] rounded-2xl px-3 py-2 ${m.me ? 'bg-alfa text-white' : 'sf-3'}`}>
              {!m.me && (
                <div className="text-xs font-bold text-ink-soft">
                  {m.role === 'admin' ? '🧑‍🏫 Тренер' : m.author}
                </div>
              )}
              <div className="text-sm">{m.text}</div>
              <div className={`mt-0.5 text-xs ${m.me ? 'text-white/80' : 'text-ink-soft'}`}>{m.time}</div>
            </div>
          </div>
        ))}
        {chat.length === 0 && <p className="py-3 text-center text-xs text-ink-soft">{emptyText}</p>}
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-danger" role="alert">{error}</p>}

      {!confirmed ? (
        <form onSubmit={saveName} className="mt-3 flex gap-2">
          <input
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
            placeholder={namePlaceholder}
            className="field flex-1 px-4 py-2.5 text-sm outline-none"
          />
          <button type="submit" className="btn-alfa rounded-2xl px-4 py-2.5 text-sm font-bold">Ок</button>
        </form>
      ) : (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={msgPlaceholder}
            maxLength={4000}
            className="field flex-1 px-4 py-2.5 text-sm outline-none"
          />
          <button type="submit" aria-label="Отправить сообщение" className="btn-alfa grid h-[42px] w-[42px] shrink-0 place-items-center rounded-2xl">
            <Send size={16} />
          </button>
        </form>
      )}
    </>
  )
}
