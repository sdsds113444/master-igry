import type { ChatMsg, MsgEventKind } from './db'

/** Версия сообщения = серверное время правки. Сравниваем числом, а не строкой:
 *  PostgREST отдаёт «…+00:00», а локальный фолбэк — «…Z», лексикографически это
 *  разные порядки. Неправленое сообщение = версия 0. */
export function editedTs(m: Pick<ChatMsg, 'editedAt'>): number {
  if (!m.editedAt) return 0
  const t = Date.parse(m.editedAt)
  return Number.isNaN(t) ? 0 : t
}

/** Слияние ленты чата с пачкой пришедших сообщений.
 *
 *  В чат сыплется из трёх источников сразу — начальная история, realtime-сокет и
 *  фоллбэк-опрос раз в 8 секунд (сокет режут мобильные операторы и периметр банка).
 *  Они свободно пересекаются и приходят вперемешку, поэтому:
 *
 *  • дедуп по id — одно и то же сообщение из двух источников не двоится;
 *  • правка (тот же id, другой текст) обновляет строку НА МЕСТЕ, а не добавляет;
 *  • побеждает более свежая версия по editedAt, а НЕ пришедшая последней: снимок
 *    истории мог выехать до правки, а доехать после — иначе он откатывал бы уже
 *    показанный новый текст (в сокет-режиме — до перезагрузки страницы);
 *  • kind='update' (событие правки по сокету) с незнакомым id игнорируется: это
 *    значит лишь, что сообщение старше загруженного окна истории (limit 200), и
 *    приклеивать его в конец ленты как новое нельзя.
 *
 *  fresh — действительно новые сообщения (их и только их можно озвучивать).
 *  Если ничего не поменялось, next === current: вызывающий вернёт тот же массив
 *  и лишней перерисовки не будет. */
export function mergeChat(
  current: ChatMsg[],
  incoming: ChatMsg[],
  kind: MsgEventKind = 'insert',
): { next: ChatMsg[]; fresh: ChatMsg[] } {
  const idx = new Map(current.map((x, i) => [x.id, i]))
  let updated: ChatMsg[] | null = null // копию делаем лениво — только если что-то изменилось
  const fresh: ChatMsg[] = []
  const freshIds = new Set<string>()

  for (const m of incoming) {
    const i = idx.get(m.id)
    if (i === undefined) {
      if (kind === 'update') continue
      if (!freshIds.has(m.id)) { freshIds.add(m.id); fresh.push(m) }
      continue
    }
    const cur = (updated ?? current)[i]
    if (editedTs(m) < editedTs(cur)) continue // пришла версия старее показанной
    if (cur.text === m.text && cur.editedAt === m.editedAt) continue
    updated ??= current.slice()
    updated[i] = m
  }

  if (!fresh.length && !updated) return { next: current, fresh }
  return { next: [...(updated ?? current), ...fresh], fresh }
}
