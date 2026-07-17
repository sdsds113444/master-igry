// Звуковой сигнал «пришло сообщение» — общий для админки и кабинета команды.
//
// Почему не `new AudioContext()` на каждый звук (как было в Admin.tsx): браузер не даёт
// играть звук, пока пользователь не взаимодействовал со страницей, и контекст, созданный
// до первого жеста, остаётся в состоянии 'suspended' — время в нём не идёт, osc.start()
// молчит. Поэтому здесь: ОДИН контекст на страницу + разблокировка по первому
// клику/нажатию клавиши (initPing) + resume() перед каждым сигналом.
//
// Ограничение браузера, которое обойти нельзя: пока по странице ни разу не кликнули,
// звука не будет вообще. После первого клика работает до закрытия вкладки.

let ctx: AudioContext | null = null
let unlockBound = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!ctx) {
    try { ctx = new Ctx() } catch { return null }
  }
  return ctx
}

/** Повесить разблокировку звука на первый жест пользователя. Вызывается один раз при старте. */
export function initPing(): void {
  if (unlockBound || typeof window === 'undefined') return
  unlockBound = true
  const unlock = () => {
    const c = getCtx()
    // Контекст может снова уснуть (смена вкладки/устройства вывода) — резюмим на каждом
    // жесте, а не однократно. На уже работающем контексте resume() — дешёвый no-op.
    if (c && c.state === 'suspended') void c.resume()
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

/** Короткий «пинг» о новом сообщении. Звук не критичен — все ошибки глотаем. */
export function playPing(): void {
  try {
    const c = getCtx()
    if (!c) return
    if (c.state === 'suspended') void c.resume() // до первого жеста останется suspended — это норма
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.frequency.value = 880
    const t = c.currentTime
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    osc.start(t)
    osc.stop(t + 0.36)
    // Контекст НЕ закрываем (он переиспользуется), но узлы отцепляем — иначе они копятся.
    osc.onended = () => { try { osc.disconnect(); gain.disconnect() } catch { /* уже отцеплены */ } }
  } catch { /* звук не критичен */ }
}
