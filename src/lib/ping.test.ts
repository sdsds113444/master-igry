import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Фейковый WebAudio: в node-окружении его нет, а нам важно проверить именно ту логику,
// из-за отсутствия которой звук молчал в бою (новый контекст на каждый звук + нет resume).

const instances: FakeCtx[] = []

class FakeOsc {
  frequency = { value: 0 }
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
  onended: (() => void) | null = null
}
class FakeGain {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
  connect = vi.fn()
  disconnect = vi.fn()
}
class FakeCtx {
  state: 'suspended' | 'running' = 'suspended'
  currentTime = 0
  destination = {}
  resume = vi.fn(async () => { this.state = 'running' })
  createOscillator = vi.fn(() => new FakeOsc())
  createGain = vi.fn(() => new FakeGain())
  constructor() { instances.push(this) }
}

function makeWindow(withAudio = true) {
  const listeners: Record<string, Array<() => void>> = {}
  return {
    ...(withAudio ? { AudioContext: FakeCtx } : {}),
    addEventListener: (ev: string, cb: () => void) => { (listeners[ev] ??= []).push(cb) },
    __fire: (ev: string) => (listeners[ev] ?? []).forEach((cb) => cb()),
  }
}

function setWindow(w: unknown) {
  ;(globalThis as unknown as { window: unknown }).window = w
}

describe('ping (звук уведомлений)', () => {
  beforeEach(() => {
    vi.resetModules() // модуль держит контекст в замыкании — сбрасываем между тестами
    instances.length = 0
    setWindow(makeWindow())
  })
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window
  })

  it('переиспользует ОДИН AudioContext, а не создаёт новый на каждый сигнал', async () => {
    const { playPing } = await import('./ping')
    playPing(); playPing(); playPing()
    // Раньше на каждый звук создавался новый контекст — браузер их лимитирует (~6 на страницу).
    expect(instances).toHaveLength(1)
  })

  it('будит уснувший контекст перед сигналом — без resume() звука не будет', async () => {
    const { playPing } = await import('./ping')
    playPing()
    expect(instances[0].resume).toHaveBeenCalled()
  })

  it('играет короткий тон: заводит осциллятор, стартует и останавливает его', async () => {
    const { playPing } = await import('./ping')
    playPing()
    const ctx = instances[0]
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1)
    const osc = ctx.createOscillator.mock.results[0].value as FakeOsc
    expect(osc.frequency.value).toBe(880)
    expect(osc.start).toHaveBeenCalled()
    expect(osc.stop).toHaveBeenCalled()
  })

  it('initPing будит звук на первом жесте пользователя (правило автоплея браузера)', async () => {
    const w = makeWindow()
    setWindow(w)
    const { initPing } = await import('./ping')
    initPing()
    expect(instances).toHaveLength(0) // до жеста контекст не создаём
    w.__fire('pointerdown')
    expect(instances).toHaveLength(1)
    expect(instances[0].resume).toHaveBeenCalled()
  })

  it('не падает, когда WebAudio недоступен', async () => {
    setWindow(makeWindow(false))
    const { playPing, initPing } = await import('./ping')
    expect(() => { initPing(); playPing() }).not.toThrow()
  })
})
