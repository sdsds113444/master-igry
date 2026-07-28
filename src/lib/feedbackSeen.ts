import type { TeamScore } from '../data/mock'

/** Отслеживание «команда уже видела эту обратную связь».
 *
 *  Серверного read-state по оценкам нет (в отличие от чата с тренером), поэтому
 *  сравниваем СЛЕПОК содержимого: если тренер переоценил работу, дописал комментарий
 *  или перезалил файл ОС — слепок меняется, и команда снова видит пометку «новое».
 *  Хранение локальное: у команды один общий код на всех, серверный read-state всё равно
 *  был бы общим и первый зашедший гасил бы уведомление остальным. */

const SEEN_PREFIX = 'mi.feedbackSeen.'

/** Слепок оценки: меняется при любой правке, которую команде важно заметить.
 *  vok намеренно НЕ включён — он справочный и в итог не идёт. */
export function feedbackSignature(s: TeamScore): string {
  return [
    s.cases,
    s.bonus,
    s.superBonusVok ?? 0,
    (s.feedback ?? '').trim(),
    s.feedbackFile ?? '',
  ].join('|')
}

/** Тренер написал что-то словами или приложил файл — а не только выставил балл.
 *  От этого зависит формулировка уведомления: обещать «обратную связь» там, где её
 *  нет, нельзя — команда откроет блок и не найдёт ничего, кроме цифры. */
export function hasWrittenFeedback(s: TeamScore): boolean {
  return !!((s.feedback ?? '').trim() || s.feedbackFile)
}

/** Есть ли вообще что показывать. Пустая строка оценки появляется штатно — например,
 *  когда тренер снимает галку «сдала» (scoring.ts пишет нули) — и уведомлять о ней
 *  не о чем. */
function isMeaningful(s: TeamScore): boolean {
  return s.cases > 0 || s.bonus > 0 || (s.superBonusVok ?? 0) > 0 || hasWrittenFeedback(s)
}

/** Игры, по которым появилась новая (или изменившаяся) обратная связь.
 *  Порядок — как в переданном списке игр, чтобы UI не прыгал. */
export function newFeedbackGames(
  scores: Record<string, TeamScore>,
  seen: Record<string, string>,
  gameOrder: string[],
): string[] {
  return gameOrder.filter((id) => {
    const s = scores[id]
    if (!s || !isMeaningful(s)) return false
    return seen[id] !== feedbackSignature(s)
  })
}

/** Слепки всех текущих оценок — то, что записываем как «просмотрено». */
export function signaturesOf(scores: Record<string, TeamScore>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [id, s] of Object.entries(scores)) out[id] = feedbackSignature(s)
  return out
}

export function getSeenFeedback(teamId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(SEEN_PREFIX + teamId)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Чужой/битый формат не должен ронять кабинет — молча считаем, что ничего не видели.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function markFeedbackSeen(teamId: string, scores: Record<string, TeamScore>): void {
  try {
    // Мержим, а не перезаписываем: вкладка со старым снимком иначе затирала бы слепки,
    // записанные более свежей, и уже просмотренная игра снова становилась бы «новой».
    const merged = { ...getSeenFeedback(teamId), ...signaturesOf(scores) }
    localStorage.setItem(SEEN_PREFIX + teamId, JSON.stringify(merged))
  } catch {
    // Переполненное или отключённое хранилище — не повод ломать страницу:
    // худшее последствие в том, что пометка «новое» покажется ещё раз.
  }
}
