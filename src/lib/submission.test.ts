import { describe, it, expect } from 'vitest'
import {
  hasMeaningfulText,
  isRealSubmission,
  hasServerSubmission,
  hasUnsentDraft,
} from './submission'

describe('hasMeaningfulText', () => {
  it('буквы и цифры считаются текстом', () => {
    expect(hasMeaningfulText('ответ')).toBe(true)
    expect(hasMeaningfulText('7')).toBe(true)
    expect(hasMeaningfulText('ok')).toBe(true)
  })

  it('пустое и одни знаки препинания — не текст', () => {
    expect(hasMeaningfulText('')).toBe(false)
    expect(hasMeaningfulText('   \n\t ')).toBe(false)
    expect(hasMeaningfulText(',')).toBe(false)
    expect(hasMeaningfulText('...  !!! ---')).toBe(false)
  })

  it('эмодзи без букв ответом не считается', () => {
    expect(hasMeaningfulText('👍')).toBe(false)
  })
})

describe('isRealSubmission', () => {
  it('текст без файла — сдача', () => {
    expect(isRealSubmission('наш ответ', null)).toBe(true)
  })

  it('файл без текста — сдача', () => {
    expect(isRealSubmission('', 'otvety.xlsx')).toBe(true)
  })

  it('пустая заготовка — не сдача', () => {
    expect(isRealSubmission('', null)).toBe(false)
    expect(isRealSubmission('  ,  ', null)).toBe(false)
  })
})

describe('hasServerSubmission — судим только по базе', () => {
  it('нет строки в базе — нет сдачи', () => {
    expect(hasServerSubmission(null)).toBe(false)
  })

  it('пустая строка в базе (файл не догрузился) сдачей не считается', () => {
    expect(hasServerSubmission({ answer: '', fileName: null })).toBe(false)
  })

  it('сохранённый текст — сдача', () => {
    expect(hasServerSubmission({ answer: 'разбор кейсов', fileName: null })).toBe(true)
  })

  it('сохранённый файл — сдача', () => {
    expect(hasServerSubmission({ answer: '', fileName: 'otvety.xlsx' })).toBe(true)
  })
})

describe('hasUnsentDraft — черновик, которого нет в базе', () => {
  it('РЕГРЕССИЯ: набрал в поле, но не отправил — это НЕ сдача, но черновик показать надо', () => {
    const saved = null
    const draft = 'Здравствуйте! По первому кейсу мы бы сделали так...'
    expect(hasServerSubmission(saved)).toBe(false) // «ваш ответ сохранён» показывать нельзя
    expect(hasUnsentDraft(draft, saved)).toBe(true) // но и молча терять текст нельзя
  })

  it('в поле ровно то, что в базе — черновика нет', () => {
    const saved = { answer: 'наш ответ', fileName: null }
    expect(hasUnsentDraft('наш ответ', saved)).toBe(false)
  })

  it('в поле дописали поверх сохранённого — черновик есть', () => {
    const saved = { answer: 'наш ответ', fileName: null }
    expect(hasUnsentDraft('наш ответ и ещё абзац', saved)).toBe(true)
  })

  it('поле пустое — черновика нет, даже если в базе что-то есть', () => {
    expect(hasUnsentDraft('', { answer: 'наш ответ', fileName: null })).toBe(false)
  })

  it('в поле одни знаки препинания — за черновик не считаем', () => {
    expect(hasUnsentDraft('   ...  ', null)).toBe(false)
  })

  it('сдавали только файлом, потом набрали текст и не отправили — черновик есть', () => {
    const saved = { answer: '', fileName: 'otvety.xlsx' }
    expect(hasServerSubmission(saved)).toBe(true)
    expect(hasUnsentDraft('дополнение к ответу', saved)).toBe(true)
  })
})
