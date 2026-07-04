import { useState } from 'react'
import { Loader2, Send, CheckCircle2, Bug, HelpCircle, Lightbulb } from 'lucide-react'
import Dialog from './Dialog'
import { submitFeedback, type FeedbackCategory } from '../lib/db'

const CATS: { id: FeedbackCategory; label: string; icon: typeof Bug }[] = [
  { id: 'bug', label: 'Баг', icon: Bug },
  { id: 'question', label: 'Вопрос', icon: HelpCircle },
  { id: 'idea', label: 'Идея', icon: Lightbulb },
]

/** Форма обратной связи тестировщиков: что делал / что ожидал / что получилось.
 *  Пишет в bug_reports — видно организатору в админке. Доступна с любой страницы. */
export default function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [did, setDid] = useState('')
  const [expected, setExpected] = useState('')
  const [got, setGot] = useState('')
  const [device, setDevice] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setCategory('bug'); setDid(''); setExpected(''); setGot(''); setDevice('')
    setSending(false); setSent(false); setError('')
  }
  function close() {
    onClose()
    setTimeout(reset, 300) // после анимации закрытия
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!did.trim() || sending) return
    setSending(true)
    setError('')
    try {
      await submitFeedback({ category, did: did.trim(), expected: expected.trim(), got: got.trim(), device: device.trim() })
      setSent(true)
    } catch {
      setError('Не отправилось — проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} ariaLabel="Оставить отзыв" title={<><Bug size={18} className="text-alfa" /> Оставить отзыв</>}>
      <div className="p-4 pt-2">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={40} className="text-success" />
            <p className="font-display text-lg font-bold">Спасибо!</p>
            <p className="text-sm text-ink-soft">Отзыв отправлен организатору. Можно закрыть окно.</p>
            <button onClick={close} className="btn-alfa mt-2 rounded-2xl px-5 py-2.5 text-sm font-bold">Готово</button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <div className="flex gap-2">
              {CATS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${
                    category === c.id ? 'bg-alfa text-white' : 'sf-2 text-ink-soft sf-hover'
                  }`}
                >
                  <c.icon size={14} /> {c.label}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">Что делали? *</span>
              <textarea
                value={did}
                onChange={(e) => setDid(e.target.value)}
                rows={2}
                required
                placeholder="Например: зашёл в кабинет, нажал «Отправить тренеру»…"
                className="field w-full resize-none p-3 text-sm outline-none"
              />
            </label>

            {category === 'bug' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">Что ожидали увидеть?</span>
                  <input
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                    placeholder="Сообщение «Отправлено»"
                    className="field w-full px-3 py-2 text-sm outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">Что получилось на самом деле?</span>
                  <input
                    value={got}
                    onChange={(e) => setGot(e.target.value)}
                    placeholder="Ничего не произошло / ошибка"
                    className="field w-full px-3 py-2 text-sm outline-none"
                  />
                </label>
              </>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">Устройство и браузер (по желанию)</span>
              <input
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="iPhone, Safari / ПК, Chrome"
                className="w-full rounded-xl border border-black/5 sf-2 px-3 py-2 text-sm outline-none focus:border-alfa/40"
              />
            </label>

            {error && <p className="text-sm font-semibold text-danger" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={sending || !did.trim()}
              className="btn-alfa flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              {sending ? <><Loader2 size={16} className="animate-spin" /> Отправляю…</> : <><Send size={16} /> Отправить</>}
            </button>
          </form>
        )}
      </div>
    </Dialog>
  )
}
