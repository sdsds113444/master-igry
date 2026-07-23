/* ================= МОК-ДАННЫЕ ДЛЯ ДЕМО =================
   Данные ненастоящие — для демонстрации визуала и логики.
   Позже заменим на Supabase (реальные команды/баллы/задания). */

import { teamTotal } from '../lib/scoring'

export type GameStatus = 'done' | 'current' | 'locked'

export interface Game {
  id: string
  num: number
  week: number
  title: string
  skill: string
  emoji: string
  accent: string
  status: GameStatus
  /** Ссылки на ассеты из БД (когда игра приходит из Supabase). В демо — не заданы. */
  video_url?: string | null
  file_url?: string | null
  /** Дедлайн сдачи (ISO). Из него живёт плашка обратного отсчёта, и по нему же RLS
   *  закрывает приём ответов. null — дедлайн не задан, приём не ограничен. */
  deadline_at?: string | null
}

export interface TeamScore {
  cases: number // общая оценка за кейсы (0–3)
  bonus: number // +1 за нестандарт
  vok?: number // % VOC
  superBonusVok?: number // +3 за лучший VOC недели
  feedback?: string // текст обратной связи тренера
}

export interface Team {
  id: string
  code: string
  name: string
  site: string
  mentor: string
  hue: number
  perGame: Record<string, TeamScore>
  total: number
  rank?: number
}

export interface FeedItem {
  id: string
  kind: 'video' | 'task' | 'rating' | 'announce'
  title: string
  text: string
  date: string
  emoji: string
}

export interface CaseItem {
  id: string
  title: string
  difficulty: 'Лёгкий' | 'Средний' | 'Сложный'
  text: string
  image?: string
}

/** Демо-дедлайн: ближайшая пятница 13:00. Нужен, чтобы плашка обратного отсчёта была
 *  видна и в демо-режиме — иначе она не попадает в приёмку и «на демо было иначе». */
function nextFriday1300(): string {
  const d = new Date()
  d.setHours(13, 0, 0, 0)
  const untilFriday = (5 - d.getDay() + 7) % 7
  d.setDate(d.getDate() + (untilFriday === 0 && Date.now() > d.getTime() ? 7 : untilFriday))
  return d.toISOString()
}

/* ---- 7 игр сезона ---- */
export const GAMES: Game[] = [
  // Демо-статусы согласованы с лентой FEED (неделя 4, «Эмпатия» идёт, итоги недели 3):
  // так демо-режим показывает живой сезон, а не пустой пресезон при непустой ленте.
  { id: 'detective', num: 1, week: 1, title: 'Детектив КЦ', skill: 'Найти боль клиента и решить в одном касании', emoji: '🕵️', accent: '#ef3124', status: 'done' },
  { id: 'noforward', num: 2, week: 2, title: 'Не перекладывай!', skill: 'Взять проблему на себя, не переводить', emoji: '🙅', accent: '#f0782b', status: 'done' },
  { id: 'iknow', num: 3, week: 3, title: 'Продуктовый «Я знаю всё»', skill: 'Знание продуктов и регламентов', emoji: '🧠', accent: '#e8b21e', status: 'done' },
  { id: 'empathy', num: 4, week: 4, title: 'Эмпатия в реальном времени', skill: 'Услышать эмоцию раньше, чем ответить', emoji: '💗', accent: '#d6338f', status: 'current', deadline_at: nextFriday1300() },
  { id: 'onecall', num: 5, week: 5, title: 'Один звонок — одно решение', skill: 'Решать вопрос за один контакт стабильно', emoji: '🎯', accent: '#8b46d6', status: 'locked' },
  { id: 'captains', num: 6, week: 6, title: 'Битва капитанов', skill: 'Капитан показывает всё на письме', emoji: '⚔️', accent: '#3f74e0', status: 'locked' },
  { id: 'marathon', num: 7, week: 7, title: 'Альфа-марафон сезона', skill: 'Финал: публичная аттестация площадки', emoji: '🏁', accent: '#1ea672', status: 'locked' },
]

/** Стартовый мультик КОЯ (из письма-приглашения). */
export const START_VIDEO = '/video/mult-start.mp4'

/** Маппинг «игра → мультик КОЯ».
 *  Локальные файлы для превью. Для живого сайта заменить на ссылки
 *  YouTube/VK (скрытые) — большие mp4 нельзя раздавать с бесплатного хостинга.
 *  ПРОВЕРЬ ПОРЯДОК: сейчас МУЛЬТ2→Детектив … МУЛЬТ8→Марафон. */
export const GAME_VIDEO: Record<string, string> = {
  detective: '/video/mult-2.mp4', // игра 1 — Детектив
  noforward: '/video/mult-3.mp4', // игра 2 — Не перекладывай
  iknow: '/video/mult-4.mp4', // игра 3 — Продуктовый «Я знаю всё»
  empathy: '/video/mult-5.mp4', // игра 4 — Эмпатия (текущая)
  onecall: '/video/mult-6.mp4', // игра 5 — Один звонок
  captains: '/video/mult-7.mp4', // игра 6 — Битва капитанов
  marathon: '/video/mult-8.mp4', // игра 7 — Альфа-марафон
}

/** Файл с кейсами для скачивания (реальные кейсы ФЛ, без эталонных ответов). */
export const GAME_FILE: Record<string, string> = {
  detective: '/files/cases-detective.xlsx',
  noforward: '/files/cases-noforward.xlsx',
  iknow: '/files/cases-iknow.xlsx',
  empathy: '/files/cases-empathy.xlsx',
  onecall: '/files/cases-onecall.xlsx',
  captains: '/files/cases-captains.xlsx',
  marathon: '/files/cases-marathon.xlsx',
}


/* ---- Команды ---- */
const NAMES = [
  'Красные панды', 'Мастера сервиса', 'Один звонок', 'Эмпаты', 'Барсы КЦ', 'Детективы',
  'Альфа-волки', 'Голос клиента', 'Без перевода', 'Скорость 300', 'Финал-бро', 'Тёплый приём',
  'Решалы', 'Капитаны', 'Первый контакт', 'Огонь-команда', 'Сервис-герои', 'Панда-сила',
  'Клиент №1', 'Топ-линия', 'Экспертиза', 'Разрулим', 'Ноль перезвонов', 'Про-операторы',
  'Точка А', 'Молния', 'Дримтим КЦ', 'Максимум', 'Эталон', 'Легенды линии',
]
const SITES = ['Москва', 'Барнаул', 'Ульяновск', 'Владимир', 'Ростов-на-Дону', 'Екатеринбург']
const MENTORS = ['Иванов Иван', 'Петрова Мария', 'Сидоров Сидор', 'Кузнецова Анна', 'Смирнов Олег', 'Фёдорова Дарья']

// детерминированный псевдослучайный генератор (стабильный демо-рейтинг)
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const FEEDBACK_POOL = [
  'Сильный ответ — клиенту не пришлось бы перезванивать. Добавьте больше живой эмпатии в первом кейсе.',
  'Во 2-м кейсе проскочило «переведу в отдел» — за это снял балл. В остальном — отлично!',
  'Эталонное решение по 3-му кейсу, забираю в примеры для онбординга 👏',
  'Хорошо, но ответы суховаты: признайте эмоцию клиента словами, а не дежурным «понимаю».',
  'Отличная командная работа. Не хватило конкретики: что именно оператор делает здесь и сейчас.',
]

export const TEAMS: Team[] = NAMES.map((name, i) => {
  const perGame: Record<string, TeamScore> = {}
  let total = 0
  const strength = 0.35 + seeded(i, 1) * 0.6 // «сила» команды
  for (const g of GAMES) {
    if (g.status === 'locked') {
      perGame[g.id] = { cases: 0, bonus: 0, vok: 0, superBonusVok: 0 }
      continue
    }
    const played = g.status === 'done' || (g.status === 'current' && seeded(i, g.num) > 0.5)
    if (!played) {
      perGame[g.id] = { cases: 0, bonus: 0, vok: 0, superBonusVok: 0 }
      continue
    }
    // Общий балл за кейсы 0..3: сильнее команда (strength) → выше балл, плюс лёгкий разброс.
    const cases = Math.min(3, Math.max(0, Math.round(strength * 3 + (seeded(i, g.num + 2) - 0.5))))
    const bonus = seeded(i, g.num + 5) > 0.7 ? 1 : 0
    const vok = Math.round(70 + seeded(i, g.num + 19) * 26)
    const superBonusVok = seeded(i, g.num + 23) > 0.86 ? 3 : 0
    const feedback =
      seeded(i, g.num + 13) > 0.45
        ? FEEDBACK_POOL[Math.floor(seeded(i, g.num + 17) * FEEDBACK_POOL.length)]
        : undefined
    perGame[g.id] = { cases, bonus, vok, superBonusVok, feedback }
    total += teamTotal({ cases, bonus, superBonusVok })
  }
  return {
    id: `t${i + 1}`,
    code: `KOYA-${String(i + 1).padStart(2, '0')}`,
    name,
    site: SITES[i % SITES.length],
    mentor: MENTORS[i % MENTORS.length],
    hue: Math.round(seeded(i, 3) * 360),
    perGame,
    total,
  }
})
  .sort((a, b) => b.total - a.total)
  .map((t, idx) => ({ ...t, rank: idx + 1 } as Team & { rank: number })) as (Team & { rank: number })[]

/* ---- Лента доски ---- */
export const FEED: FeedItem[] = [
  { id: 'f1', kind: 'video', emoji: '🎬', title: 'Мультик недели 4 — «Эмпатия в реальном времени»', text: 'Новый эпизод КОЯ уже на доске! Смотрим до старта заданий.', date: 'Сегодня, 09:00' },
  { id: 'f2', kind: 'task', emoji: '📩', title: 'Задания недели 4 разосланы', text: 'Кейсы в кабинетах команд. Дедлайн — пятница, 13:00 МСК.', date: 'Сегодня, 09:05' },
  { id: 'f3', kind: 'rating', emoji: '📊', title: 'Рейтинг обновлён по итогам недели 3', text: '«Красные панды» вырвались вперёд.', date: 'Пятница, 17:00' },
  { id: 'f4', kind: 'announce', emoji: '🏆', title: 'Супер-бонус недели 3', text: '+3 очка за лучший VOC недели. Поздравляем!', date: 'Пятница, 17:10' },
]

/* ---- Состав команды (капитан редактирует) ---- */
export const ROSTER_SEED = [
  'Иванов Иван (капитан)', 'Петров Пётр', 'Сидоров Сидор', 'Кузнецов Кирилл', 'Смирнова Анна',
  'Волкова Вера', 'Новиков Никита', 'Морозова Мария', 'Соколов Семён', 'Егорова Елена',
]

/* ---- Чат команды (демо) ---- */
export const TEAM_CHAT_SEED = [
  { author: 'Петров Пётр', text: 'Народ, глянули мультик? В первом кейсе клиента реально жалко 😅', time: '10:02', me: false },
  { author: 'Сидоров Сидор', text: 'Ага. Предлагаю в ответе сразу признать эмоцию и извиниться за ситуацию на кассе.', time: '10:05', me: false },
  { author: 'Иванов Иван (капитан)', text: 'Согласен. Я соберу общий ответ к четвергу, скидывайте формулировки сюда.', time: '10:07', me: true },
]

/* ---- Правила игры (из «параметры_игры») ---- */
export const RULES = [
  { icon: '🎮', title: 'Формат', text: 'Онлайн-игра между командами контакт-центра. Сезон — 9 недель, 7 игр.' },
  { icon: '👥', title: 'Команды', text: 'Команды по 10 человек. Капитан регистрирует состав в личном кабинете.' },
  { icon: '🎯', title: 'Цель', text: 'Прокачать решение вопроса на звонке/в чате — без перезвона и переводов.' },
  { icon: '🗓️', title: 'Ритм недели', text: 'Понедельник — мультик + кейсы в кабинете. До пятницы 13:00 МСК капитан сдаёт ответ команды.' },
  { icon: '⭐', title: 'Оценка кейсов', text: '0 — не сдали · 1 — более 3 ошибок · 2 — менее 3 ошибок · 3 — без ошибок (по каждому кейсу).' },
  { icon: '➕', title: 'Бонусы', text: 'Бонус +1 за нестандартное решение кейса. Супер-бонус +3 — команде с лучшим VOC недели.' },
  { icon: '📝', title: 'Проверка', text: 'Тренер (1 на 1–2 команды) даёт обратную связь и ставит балл. Рейтинг обновляется в пятницу.' },
  { icon: '🏆', title: 'Победитель', text: 'Команда с наибольшей суммой баллов за сезон. Итоги — в конце сезона.' },
]

/* ---- Призы (из презы) ----
   accent — для мягкого свечения карточки (box-shadow).
   chipBg / chipFg — доступная пара для бейджа «место» (раньше белый текст на
   золоте/серебре давал 1.6:1, теперь каждая пара ≥5.7:1). */
export const PRIZES = [
  { place: '1 место', emoji: '🥇', title: 'Корпоратив на 100 000 ₽', text: 'Организация праздника для команды-победителя.', accent: '#ffc244', chipBg: '#ffc244', chipFg: '#4a3400' },
  { place: '2 место', emoji: '🥈', title: 'Мерч Альфы', text: 'Фирменные наборы каждому участнику команды.', accent: '#c9cdd6', chipBg: '#c9cdd6', chipFg: '#2c3038' },
  { place: '3 место', emoji: '🐾', title: 'Коины', text: 'Коины команде — обменяете на мерч в Альфа-маркете.', accent: '#ef3124', chipBg: '#c81e12', chipFg: '#ffffff' },
]

/** Приписка под блоком призов — сроки подведения итогов и вручения (регламент). */
export const PRIZES_NOTE =
  'Итоги подводятся не позднее 2 недель после финала сезона. Праздник для команды-победителя реализуется в течение 3 месяцев с даты объявления результатов.'
