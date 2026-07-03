// Ставим тему ДО рендера, чтобы не было вспышки светлого экрана.
// Вынесено из index.html отдельным файлом, чтобы CSP мог запрещать inline-скрипты
// (script-src 'self') — второй рубеж защиты от XSS.
;(function () {
  try {
    var saved = localStorage.getItem('theme')
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    if (dark) document.documentElement.classList.add('dark')
  } catch {}
})()
