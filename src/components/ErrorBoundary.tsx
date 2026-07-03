import { Component, type ReactNode } from 'react'

/** Ловит исключения рендера, чтобы одно упавшее место не роняло весь SPA
 *  в белый экран (например, requireClient() кинул из-за отсутствия ключей). */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    // Логируем в консоль — на проде можно завести отправку в мониторинг.
    console.error('Ошибка приложения:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-items-center p-6 text-center">
          <div className="glass-strong max-w-sm rounded-glass p-8">
            <div className="text-4xl">😿</div>
            <h1 className="mt-3 font-display text-xl font-bold">Что-то пошло не так</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Обновите страницу. Если не помогло — напишите организатору.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-alfa mt-5 rounded-2xl px-5 py-2.5 text-sm font-bold"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
