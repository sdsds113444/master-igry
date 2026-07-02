/* ================= МОК-ДАННЫЕ ДЛЯ ДЕМО =================
   Данные ненастоящие — для демонстрации визуала и логики.
   Позже заменим на Supabase (реальные команды/баллы/задания). */

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
}

export interface TeamScore {
  cases: number // очки за кейсы (0–30)
  bonus: number // +1 за нестандарт
  superBonus: number // +3 за лучший FCR недели
  fcr: number // % FCR
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
}

/* ---- 7 игр сезона ---- */
export const GAMES: Game[] = [
  { id: 'detective', num: 1, week: 1, title: 'Детектив КЦ', skill: 'Найти боль клиента и решить в одном касании', emoji: '🕵️', accent: '#ef3124', status: 'done' },
  { id: 'noforward', num: 2, week: 2, title: 'Не перекладывай!', skill: 'Взять проблему на себя, не переводить', emoji: '🙅', accent: '#f0782b', status: 'done' },
  { id: 'iknow', num: 3, week: 3, title: 'Продуктовый «Я знаю всё»', skill: 'Знание продуктов и регламентов', emoji: '🧠', accent: '#e8b21e', status: 'done' },
  { id: 'empathy', num: 4, week: 4, title: 'Эмпатия в реальном времени', skill: 'Услышать эмоцию раньше, чем ответить', emoji: '💗', accent: '#d6338f', status: 'current' },
  { id: 'onecall', num: 5, week: 5, title: 'Один звонок — одно решение', skill: 'Держать высокий FCR стабильно', emoji: '🎯', accent: '#8b46d6', status: 'locked' },
  { id: 'captains', num: 6, week: 6, title: 'Битва капитанов', skill: 'Капитан показывает всё на письме', emoji: '⚔️', accent: '#3f74e0', status: 'locked' },
  { id: 'marathon', num: 7, week: 7, title: 'Альфа-марафон сезона', skill: 'Финал: публичная аттестация площадки', emoji: '🏁', accent: '#1ea672', status: 'locked' },
]

export const CURRENT_GAME = GAMES.find((g) => g.status === 'current')!

/** Демо-ролик (mp4). В бою заменяется на ссылку YouTube/VK/Rutube эпизода КОЯ. */
export const DEMO_VIDEO =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'

/** Контакт тренера для кнопки «написать» (в бою — реальный МАКС/Telegram/почта). */
export const MENTOR_CONTACT = 'mailto:trener.kc@alfabank.ru?subject=Мастер%20игры%20—%20команда%20KOYA-04'

/* ---- Команды ---- */
const NAMES = [
  'Красные панды', 'Мастера FCR', 'Один звонок', 'Эмпаты', 'Барсы КЦ', 'Детективы',
  'Альфа-волки', 'Голос клиента', 'Без перевода', 'Скорость 300', 'Финал-бро', 'Тёплый приём',
  'Решалы', 'Капитаны', 'Первый контакт', 'Огонь-команда', 'Сервис-герои', 'Панда-сила',
  'Клиент №1', 'Топ-линия', 'Экспертиза', 'Разрулим', 'Ноль перезвонов', 'Про-операторы',
  'Точка А', 'Молния', 'Дримтим КЦ', 'Максимум', 'Эталон', 'Легенды линии',
]
const SITES = ['Москва', 'Барнаул', 'Ульяновск', 'Владимир', 'Ростов-на-Дону', 'Екатеринбург']
const MENTORS = ['Юля Логинова', 'Алина Ж.', 'Ж. Бикулева', 'С. Лепёшкин', 'Д. Косов', 'И. Наставник']

// детерминированный псевдослучайный генератор (стабильный демо-рейтинг)
function seeded(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export const TEAMS: Team[] = NAMES.map((name, i) => {
  const perGame: Record<string, TeamScore> = {}
  let total = 0
  const strength = 0.35 + seeded(i, 1) * 0.6 // «сила» команды
  for (const g of GAMES) {
    if (g.status === 'locked') {
      perGame[g.id] = { cases: 0, bonus: 0, superBonus: 0, fcr: 0 }
      continue
    }
    const played = g.status === 'done' || (g.status === 'current' && seeded(i, g.num) > 0.5)
    if (!played) {
      perGame[g.id] = { cases: 0, bonus: 0, superBonus: 0, fcr: 0 }
      continue
    }
    const cases = Math.round((18 + seeded(i, g.num + 2) * 12) * strength) // до ~30
    const bonus = seeded(i, g.num + 5) > 0.7 ? 1 : 0
    const superBonus = seeded(i, g.num + 9) > 0.86 ? 3 : 0
    const fcr = Math.round(70 + seeded(i, g.num + 11) * 26)
    perGame[g.id] = { cases, bonus, superBonus, fcr }
    total += cases + bonus + superBonus
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

/** Команда, под которой «залогинен» демо-пользователь */
export const MY_TEAM_CODE = 'KOYA-04'

/* ---- Лента доски ---- */
export const FEED: FeedItem[] = [
  { id: 'f1', kind: 'video', emoji: '🎬', title: 'Мультик недели 4 — «Эмпатия в реальном времени»', text: 'Новый эпизод КОЯ уже на доске! Смотрим до старта заданий.', date: 'Сегодня, 09:00' },
  { id: 'f2', kind: 'task', emoji: '📩', title: 'Задания недели 4 разосланы', text: 'Кейсы в кабинетах команд. Дедлайн — пятница, 15:00 МСК.', date: 'Сегодня, 09:05' },
  { id: 'f3', kind: 'rating', emoji: '📊', title: 'Рейтинг обновлён по итогам недели 3', text: '«Красные панды» вырвались вперёд. Смотрите таблицу справа 👉', date: 'Пятница, 17:00' },
  { id: 'f4', kind: 'announce', emoji: '🏆', title: 'Супер-бонус недели 3', text: '+3 очка команде с лучшим FCR. Поздравляем!', date: 'Пятница, 17:10' },
]

/* ---- Задание недели (кабинет команды) ---- */
export const CURRENT_TASK = {
  gameId: CURRENT_GAME.id,
  title: CURRENT_GAME.title,
  skill: CURRENT_GAME.skill,
  deadline: 'Пятница, 15:00 МСК',
  videoTitle: 'Мультик КОЯ — эпизод 4',
  fileName: 'Кейсы_Эмпатия_неделя4.xlsx',
  cases: [
    {
      id: 'c1',
      title: 'Злой клиент — переключали три раза',
      difficulty: 'Сложный',
      text: 'Клиент звонит четвёртый раз за день, его уже трижды переводили между отделами. Он на грани: «Вы там вообще друг с другом разговариваете?!». Задача — снять эмоцию и решить вопрос здесь и сейчас.',
    },
    {
      id: 'c2',
      title: 'Растерянный клиент — пенсионерка',
      difficulty: 'Средний',
      text: 'Пожилая клиентка не понимает, почему не прошёл платёж за ЖКХ, боится остаться должна. Нужно объяснить спокойно, простыми словами, и довести до решения.',
    },
    {
      id: 'c3',
      title: 'Многоуровневый клиент — три вопроса сразу',
      difficulty: 'Сложный',
      text: 'Клиент вываливает три проблемы в одном звонке и торопится. Задача — услышать главную боль, структурировать и закрыть всё за один контакт.',
    },
  ] as CaseItem[],
}
