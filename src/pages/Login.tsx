import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, Loader2, Sparkles } from 'lucide-react'
import Background from '../components/Background'
import ThemeToggle from '../components/ThemeToggle'
import { getSession, signInByCode, TooManyAttemptsError } from '../lib/db'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Login() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const ses = getSession()
    if (ses) navigate(ses.role === 'admin' ? '/admin' : '/board', { replace: true })
  }, [navigate])

  async function enter(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const session = await signInByCode(code)
      if (!session) {
        setError('Код не найден. Проверьте и попробуйте ещё раз.')
        return
      }
      navigate(session.role === 'admin' ? '/admin' : '/board')
    } catch (e) {
      if (e instanceof TooManyAttemptsError) {
        setError('Слишком много попыток. Подождите пару минут и попробуйте снова.')
      } else {
        setError('Не удалось войти. Проверьте соединение и попробуйте ещё раз.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-full place-items-center p-4">
      <Background />
      <ThemeToggle className="fixed right-4 top-4 z-10" />
      <div className="glass-strong w-full max-w-4xl overflow-hidden rounded-glass md:grid md:grid-cols-[1.05fr_1fr]">
        {/* Сцена с маскотом */}
        <div className="relative hidden min-h-[420px] md:block">
          <img
            src="/koya/koya-sit-crop.webp"
            alt="Маскот КОЯ"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: 'center 38%' }}
          />
          <div className="absolute bottom-5 left-5 right-5">
            <div className="glass-dark rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Sparkles size={16} style={{ color: 'var(--color-gold)' }} />
                Сезон 1 · 7 игр · 9 недель
              </div>
              <p className="mt-1 text-xs text-white/80">
                Командный чемпионат контакт-центра. Решай кейсы, набирай очки, стань героем линии.
              </p>
            </div>
          </div>
        </div>

        {/* Форма входа */}
        <div className="flex flex-col justify-center p-8 sm:p-10">
          {/* Инфо о сезоне — на мобильном панель с маскотом скрыта, поэтому дублируем здесь */}
          <div className="mb-4 flex items-center gap-2 rounded-2xl sf-1 px-3 py-2 text-xs font-bold md:hidden">
            <Sparkles size={15} style={{ color: 'var(--color-gold)' }} />
            Сезон 1 · 7 игр · 9 недель
          </div>
          <img src="/koya-favicon.svg" alt="" className="mb-4 h-12 w-12" />
          <h1 className="font-display text-3xl font-extrabold leading-tight">
            Герои <span className="text-gradient">на линии</span>
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Вход для команды. Введите код команды — его выдаёт организатор.
          </p>

          <form onSubmit={enter} className="mt-6 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Код команды
              </span>
              <div className="flex items-center gap-2 rounded-2xl border border-black/5 sf-2 px-4 py-3 focus-within:border-alfa/40">
                <KeyRound size={18} className="text-ink-soft" />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="KOYA-04"
                  className="w-full bg-transparent text-lg font-bold tracking-wider outline-none placeholder:text-ink-soft/70"
                />
              </div>
            </label>

            {error && <p className="text-sm font-semibold text-danger" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="btn-alfa flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-base font-bold disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <>Войти в игру <ArrowRight size={18} /></>}
            </button>
          </form>

          <p className="mt-5 rounded-xl sf-1 px-3 py-2 text-center text-xs text-ink-soft">
            {isSupabaseConfigured
              ? <>Код команды выдаёт организатор. Нет кода — напишите тренеру.</>
              : <>Демо-режим: любой код открывает доску, <b>DEMO-ADMIN</b> — админку.</>}
          </p>
        </div>
      </div>
    </div>
  )
}
