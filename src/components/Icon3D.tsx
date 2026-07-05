import type { ImgHTMLAttributes, ReactNode } from 'react'

export const ICON_3D = {
  bonusPlus: '/icons/koya-bonus-plus-3d.webp',
  coin: '/icons/koya-coin-3d.webp',
  crown: '/icons/koya-crown-3d.webp',
  feedRating: '/icons/koya-feed-rating-3d.webp',
  feedTask: '/icons/koya-feed-task-3d.webp',
  feedVideo: '/icons/koya-feed-video-3d.webp',
  gameCaptains: '/icons/koya-game-captains-3d.webp',
  gameDetective: '/icons/koya-game-detective-3d.webp',
  gameEmpathy: '/icons/koya-game-empathy-3d.webp',
  gameIknow: '/icons/koya-game-iknow-3d.webp',
  gameMarathon: '/icons/koya-game-marathon-3d.webp',
  gameNoforward: '/icons/koya-game-noforward-3d.webp',
  gameOnecall: '/icons/koya-game-onecall-3d.webp',
  medalSilver: '/icons/koya-medal-silver-3d.webp',
  prizeMerch: '/icons/koya-prize-merch-3d.webp',
  rankFire: '/icons/koya-rank-fire-3d.webp',
  rankGrowth: '/icons/koya-rank-growth-3d.webp',
  rankStrength: '/icons/koya-rank-strength-3d.webp',
  reviewNote: '/icons/koya-review-note-3d.webp',
  ruleCalendar: '/icons/koya-rule-calendar-3d.webp',
  ruleFormat: '/icons/koya-rule-format-3d.webp',
  ruleTeams: '/icons/koya-rule-teams-3d.webp',
  star: '/icons/koya-star-3d.webp',
  trophy: '/icons/koya-trophy-3d.webp',
} as const

export type Icon3DName = keyof typeof ICON_3D

export const GAME_ICON_3D: Record<string, Icon3DName> = {
  detective: 'gameDetective',
  noforward: 'gameNoforward',
  iknow: 'gameIknow',
  empathy: 'gameEmpathy',
  onecall: 'gameOnecall',
  captains: 'gameCaptains',
  marathon: 'gameMarathon',
}

export const FEED_ICON_3D: Record<string, Icon3DName> = {
  video: 'feedVideo',
  task: 'feedTask',
  rating: 'feedRating',
  announce: 'trophy',
}

export const EMOJI_ICON_3D: Record<string, Icon3DName> = {
  '🎮': 'ruleFormat',
  '👥': 'ruleTeams',
  '🎯': 'gameOnecall',
  '🗓️': 'ruleCalendar',
  '⭐': 'star',
  '➕': 'bonusPlus',
  '📝': 'reviewNote',
  '🏆': 'trophy',
  '🔥': 'rankFire',
  '💪': 'rankStrength',
  '📈': 'rankGrowth',
  '🥇': 'trophy',
  '🥈': 'medalSilver',
  '🐾': 'coin',
}

interface Icon3DProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  name?: Icon3DName | null
  fallback?: ReactNode
}

export default function Icon3D({ name, fallback, className = 'h-6 w-6 object-contain', ...props }: Icon3DProps) {
  if (!name) {
    return fallback ? <span className={className} aria-hidden="true">{fallback}</span> : null
  }

  return (
    <img
      src={ICON_3D[name]}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={className}
      {...props}
    />
  )
}
