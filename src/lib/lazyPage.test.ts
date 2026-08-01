import { describe, it, expect, beforeEach, vi } from 'vitest'

// Полифилл sessionStorage: в node-окружении vitest его нет, а логика «перезагрузились
// один раз» держится именно на нём.
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

let reloads = 0
beforeEach(() => {
  reloads = 0
  vi.stubGlobal('sessionStorage', new MemStorage())
  vi.stubGlobal('window', { location: { reload: () => { reloads++ } } })
})

// Импортируем ПОСЛЕ стабов: модуль читает window/sessionStorage в момент вызова, но так
// надёжнее — исключаем зависимость от порядка загрузки.
async function loadModule() {
  vi.resetModules()
  return await import('./lazyPage')
}

/** Ошибки, которые реально кидают браузеры, когда чанк исчез после деплоя. */
const CHUNK_ERRORS = [
  'Failed to fetch dynamically imported module: https://site/assets/Admin-BaZa9vSK.js', // Chrome
  'error loading dynamically imported module',                                          // Firefox
  'Importing a module script failed.',                                                  // Safari
  'Failed to load module script: Expected a JavaScript module',                         // Vite/прокси
  'ChunkLoadError: Loading chunk 5 failed',                                             // webpack-стиль
]

describe('lazyPage — восстановление после деплоя', () => {
  it('РЕГРЕССИЯ: пропавший после деплоя чанк вызывает ОДНУ перезагрузку, а не экран ошибки', async () => {
    const { lazyPage } = await loadModule()
    // lazy() откладывает вызов загрузчика до рендера, поэтому проверяем саму обёртку:
    // вытаскиваем переданный в неё загрузчик через _payload (внутренности React.lazy).
    const failing = () => Promise.reject(new Error(CHUNK_ERRORS[0]))
    const C = lazyPage(failing as never) as unknown as { _payload: { _result: () => Promise<unknown> } }
    const inner = C._payload._result
    // Промис намеренно «висит» — так Suspense держит лоадер, пока идёт перезагрузка.
    const pending = inner()
    await Promise.race([pending, new Promise((r) => setTimeout(r, 20))])
    expect(reloads).toBe(1)
  })

  it('перезагружаемся только один раз: повторный сбой уходит наверх, без петли', async () => {
    const { lazyPage } = await loadModule()
    sessionStorage.setItem('mi.chunkReload', '1') // как будто перезагрузка уже была
    const C = lazyPage((() => Promise.reject(new Error(CHUNK_ERRORS[0]))) as never) as unknown as {
      _payload: { _result: () => Promise<unknown> }
    }
    await expect(C._payload._result()).rejects.toThrow(/dynamically imported/)
    expect(reloads).toBe(0)
  })

  it('обычная ошибка страницы НЕ вызывает перезагрузку — её должен увидеть ErrorBoundary', async () => {
    const { lazyPage } = await loadModule()
    const C = lazyPage((() => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'submitted')"))) as never) as unknown as {
      _payload: { _result: () => Promise<unknown> }
    }
    await expect(C._payload._result()).rejects.toThrow(/Cannot read properties/)
    expect(reloads).toBe(0)
  })

  it('успешная загрузка снимает флаг — следующий деплой снова получит попытку', async () => {
    const { lazyPage } = await loadModule()
    sessionStorage.setItem('mi.chunkReload', '1')
    const C = lazyPage((() => Promise.resolve({ default: () => null })) as never) as unknown as {
      _payload: { _result: () => Promise<unknown> }
    }
    await C._payload._result()
    expect(sessionStorage.getItem('mi.chunkReload')).toBeNull()
  })

  it('распознаёт формулировки всех браузеров', async () => {
    const { lazyPage } = await loadModule()
    for (const msg of CHUNK_ERRORS) {
      reloads = 0
      sessionStorage.clear()
      const C = lazyPage((() => Promise.reject(new Error(msg))) as never) as unknown as {
        _payload: { _result: () => Promise<unknown> }
      }
      const p = C._payload._result()
      await Promise.race([p, new Promise((r) => setTimeout(r, 20))])
      expect(reloads, `не распознано: ${msg}`).toBe(1)
    }
  })
})
