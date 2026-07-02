import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, Sparkles } from 'lucide-react'
import Background from '../components/Background'

export default function Login() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()

  function enter(e: React.FormEvent) {
    e.preventDefault()
    // Демо: любой код пускает на доску. Позже — проверка через Supabase.
    navigate('/board')
  }

  return (
    <div className="grid min-h-full place-items-center p-4">
      <Background />
      <div className="glass-strong w-full max-w-4xl overflow-hidden rounded-[32px] md:grid md:grid-cols-[1.05fr_1fr]">
        {/* Сцена с маскотом */}
        <div className="relative hidden min-h-[420px] md:block">
          <img
            src="/koya/koya-sit-crop.jpg"
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
                Командный чемпионат контакт-центра. Решай кейсы, набирай очки, стань «Мастером игры».
              </p>
            </div>
          </div>
        </div>

        {/* Форма входа */}
        <div className="flex flex-col justify-center p-8 sm:p-10">
          <img src="/koya-favicon.svg" alt="" className="mb-4 h-12 w-12" />
          <h1 className="font-display text-3xl font-extrabold leading-tight">
            <span className="text-gradient">Мастер игры</span>
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            Вход для команды. Введите код команды — его выдаёт организатор.
          </p>

          <form onSubmit={enter} className="mt-6 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-soft">
                Код команды
              </span>
              <div className="flex items-center gap-2 rounded-2xl border border-black/5 bg-white/70 px-4 py-3 focus-within:border-alfa/40">
                <KeyRound size={18} className="text-ink-soft" />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="KOYA-04"
                  className="w-full bg-transparent text-lg font-bold tracking-wider outline-none placeholder:text-ink-soft/40"
                />
              </div>
            </label>

            <button type="submit" className="btn-alfa flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-base font-bold">
              Войти в игру <ArrowRight size={18} />
            </button>
          </form>

          <p className="mt-5 rounded-xl bg-white/50 px-3 py-2 text-center text-xs text-ink-soft">
            Демо: любой код открывает доску. Попробуйте <b>KOYA-04</b>.
          </p>
        </div>
      </div>
    </div>
  )
}
