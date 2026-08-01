import { lazy, type ComponentType } from 'react'

/** Ключ «мы уже перезагружались из-за пропавшего чанка» — в sessionStorage, чтобы
 *  жить в пределах вкладки и не превратиться в вечный цикл перезагрузок. */
const RELOADED_KEY = 'mi.chunkReload'

/** Похоже ли исключение на «не смог подгрузить кусок приложения».
 *
 *  Текст различается у браузеров и сборщиков, поэтому проверяем по нескольким приметам,
 *  а не по одной строке: Chrome даёт «Failed to fetch dynamically imported module»,
 *  Firefox — «error loading dynamically imported module», Safari — «Importing a module
 *  script failed», плюс общий для Vite «Failed to load module script». */
function looksLikeChunkError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '')
  return /dynamically imported module|Importing a module script failed|Failed to load module script|ChunkLoadError|error loading dynamically imported/i.test(msg)
}

/** lazy() с автоматическим восстановлением после деплоя.
 *
 *  Зачем: страницы разделены на чанки, и Vite подставляет в их имена хэш содержимого.
 *  После выкатки старые файлы исчезают. У человека с уже открытой вкладкой (а у тренера
 *  админка открыта весь день, у команд — доска) переход на страницу дёргает файл, которого
 *  на сервере больше нет: динамический импорт падает, ErrorBoundary показывает «Что-то
 *  пошло не так», и выглядит это как поломка сайта, хотя достаточно перезагрузки.
 *  Ровно так admin и «сломалась» после деплоя 01.08.2026.
 *
 *  Что делаем: ловим именно этот класс ошибки и один раз перезагружаем вкладку — она
 *  получит свежий index.html с актуальными именами чанков. Флаг в sessionStorage не даёт
 *  зациклиться, если файл недоступен по другой причине (например, нет сети): второй раз
 *  ошибка пойдёт наверх, к ErrorBoundary, как и раньше. */
export function lazyPage<T extends ComponentType<unknown>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load()
      // Успешная загрузка снимает флаг: следующий деплой снова получит одну попытку.
      sessionStorage.removeItem(RELOADED_KEY)
      return mod
    } catch (e) {
      if (looksLikeChunkError(e) && !sessionStorage.getItem(RELOADED_KEY)) {
        sessionStorage.setItem(RELOADED_KEY, '1')
        window.location.reload()
        // Возвращаем «вечное ожидание»: пока идёт перезагрузка, Suspense держит лоадер,
        // и человек не успевает увидеть мелькнувший экран ошибки.
        return new Promise<{ default: T }>(() => {})
      }
      throw e
    }
  })
}
