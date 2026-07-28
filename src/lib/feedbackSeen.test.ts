import { describe, it, expect, beforeEach } from 'vitest'
import type { TeamScore } from '../data/mock'
import {
  feedbackSignature, newFeedbackGames, signaturesOf, getSeenFeedback, markFeedbackSeen,
  hasWrittenFeedback,
} from './feedbackSeen'

// Тесты идут в node-окружении, где localStorage нет. Ставим минимальную заглушку
// здесь, а не в общей конфигурации, чтобы не влиять на остальные тесты.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size },
} as Storage

const base: TeamScore = { cases: 2, bonus: 0, vok: 0, superBonusVok: 0, feedback: '', feedbackFile: null, feedbackFileName: null }
const ORDER = ['detective', 'noforward', 'iknow']

describe('feedbackSignature', () => {
  it('одинаковые оценки дают одинаковый слепок', () => {
    expect(feedbackSignature(base)).toBe(feedbackSignature({ ...base }))
  })

  it('меняется при изменении балла за кейсы', () => {
    expect(feedbackSignature({ ...base, cases: 3 })).not.toBe(feedbackSignature(base))
  })

  it('меняется при появлении комментария тренера', () => {
    expect(feedbackSignature({ ...base, feedback: 'Молодцы' })).not.toBe(feedbackSignature(base))
  })

  it('меняется при перезаливке файла ОС', () => {
    const a = feedbackSignature({ ...base, feedbackFile: 'team/detective/feedback/a.docx' })
    const b = feedbackSignature({ ...base, feedbackFile: 'team/detective/feedback/b.docx' })
    expect(a).not.toBe(b)
  })

  it('не реагирует на VOC — он справочный и в итог не идёт', () => {
    expect(feedbackSignature({ ...base, vok: 87 })).toBe(feedbackSignature(base))
  })

  it('не реагирует на переименование файла без смены пути', () => {
    const a = feedbackSignature({ ...base, feedbackFile: 'p/f.docx', feedbackFileName: 'Отчёт.docx' })
    const b = feedbackSignature({ ...base, feedbackFile: 'p/f.docx', feedbackFileName: 'Отчёт (1).docx' })
    expect(a).toBe(b)
  })

  it('пустой комментарий и пробелы — это одно и то же', () => {
    expect(feedbackSignature({ ...base, feedback: '   ' })).toBe(feedbackSignature({ ...base, feedback: '' }))
  })
})

describe('newFeedbackGames', () => {
  it('первая оценка — новая', () => {
    expect(newFeedbackGames({ detective: base }, {}, ORDER)).toEqual(['detective'])
  })

  it('уже просмотренная — не новая', () => {
    const seen = signaturesOf({ detective: base })
    expect(newFeedbackGames({ detective: base }, seen, ORDER)).toEqual([])
  })

  it('переоценка после просмотра снова считается новой', () => {
    const seen = signaturesOf({ detective: base })
    const updated = { detective: { ...base, cases: 3 } }
    expect(newFeedbackGames(updated, seen, ORDER)).toEqual(['detective'])
  })

  it('игры без оценки не попадают в новые', () => {
    expect(newFeedbackGames({}, {}, ORDER)).toEqual([])
  })

  it('сохраняет порядок игр, а не порядок ключей объекта', () => {
    const scores = { iknow: base, detective: base }
    expect(newFeedbackGames(scores, {}, ORDER)).toEqual(['detective', 'iknow'])
  })

  it('видели одну игру — новой считается только вторая', () => {
    const seen = signaturesOf({ detective: base })
    const scores = { detective: base, noforward: base }
    expect(newFeedbackGames(scores, seen, ORDER)).toEqual(['noforward'])
  })
})

describe('пустые и бессодержательные оценки', () => {
  const empty: TeamScore = { cases: 0, bonus: 0, vok: 0, superBonusVok: 0, feedback: '', feedbackFile: null, feedbackFileName: null }

  it('строка из одних нулей не считается новостью', () => {
    // Так выглядит оценка после снятия галки «сдала» — уведомлять не о чем.
    expect(newFeedbackGames({ detective: empty }, {}, ORDER)).toEqual([])
  })

  it('ноль за кейсы, но с комментарием — это новость', () => {
    const s = { ...empty, feedback: 'Ответ не по теме, разберём на встрече' }
    expect(newFeedbackGames({ detective: s }, {}, ORDER)).toEqual(['detective'])
  })

  it('ноль за кейсы, но с файлом ОС — это новость', () => {
    const s = { ...empty, feedbackFile: 'team/detective/feedback/os.docx' }
    expect(newFeedbackGames({ detective: s }, {}, ORDER)).toEqual(['detective'])
  })

  it('только балл, без комментария и файла — новость есть, но текста ОС нет', () => {
    // Ровно случай 3 команд на проде: балл стоит, а разбора нет.
    expect(newFeedbackGames({ detective: base }, {}, ORDER)).toEqual(['detective'])
    expect(hasWrittenFeedback(base)).toBe(false)
  })

  it('hasWrittenFeedback: пробелы в комментарии за текст не считаются', () => {
    expect(hasWrittenFeedback({ ...base, feedback: '   ' })).toBe(false)
    expect(hasWrittenFeedback({ ...base, feedback: 'Молодцы' })).toBe(true)
    expect(hasWrittenFeedback({ ...base, feedbackFile: 'p/f.docx' })).toBe(true)
  })
})

describe('хранение просмотренного', () => {
  beforeEach(() => localStorage.clear())

  it('записали — прочитали', () => {
    markFeedbackSeen('t1', { detective: base })
    expect(getSeenFeedback('t1')).toEqual({ detective: feedbackSignature(base) })
  })

  it('у разных команд своё состояние', () => {
    markFeedbackSeen('t1', { detective: base })
    expect(getSeenFeedback('t2')).toEqual({})
  })

  it('битые данные в хранилище не роняют чтение', () => {
    localStorage.setItem('mi.feedbackSeen.t1', 'не json')
    expect(getSeenFeedback('t1')).toEqual({})
  })

  it('массив вместо объекта тоже не роняет', () => {
    localStorage.setItem('mi.feedbackSeen.t1', '[1,2,3]')
    expect(getSeenFeedback('t1')).toEqual({})
  })

  it('после отметки просмотра новых не остаётся', () => {
    const scores = { detective: base, noforward: { ...base, cases: 1 } }
    markFeedbackSeen('t1', scores)
    expect(newFeedbackGames(scores, getSeenFeedback('t1'), ORDER)).toEqual([])
  })

  it('отметка мержится, а не затирает записи другой вкладки', () => {
    // Вкладка А видела обе игры, вкладка Б держит снимок только с первой.
    markFeedbackSeen('t1', { detective: base, noforward: base })
    markFeedbackSeen('t1', { detective: base })
    const seen = getSeenFeedback('t1')
    expect(Object.keys(seen).sort()).toEqual(['detective', 'noforward'])
    expect(newFeedbackGames({ detective: base, noforward: base }, seen, ORDER)).toEqual([])
  })
})
