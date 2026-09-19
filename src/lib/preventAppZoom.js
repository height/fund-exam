// Document zoom only: ordinary scrolling, selection and in-app canvas controls remain available.
export function preventAppZoom() {
  const options = { passive: false, capture: true }
  const prevent = event => event.preventDefault()
  const wheel = event => {
    if (event.ctrlKey || event.metaKey) event.preventDefault()
  }
  const keydown = event => {
    if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault()
    }
  }
  const touchmove = event => {
    if (event.touches.length > 1) event.preventDefault()
  }

  document.addEventListener('wheel', wheel, options)
  document.addEventListener('keydown', keydown, options)
  document.addEventListener('touchmove', touchmove, options)
  document.addEventListener('gesturestart', prevent, options)
  document.addEventListener('gesturechange', prevent, options)
  document.addEventListener('gestureend', prevent, options)

  // Avoid stacking global listeners when Vite replaces this module during development.
  if (import.meta.hot) import.meta.hot.dispose(() => {
    document.removeEventListener('wheel', wheel, options)
    document.removeEventListener('keydown', keydown, options)
    document.removeEventListener('touchmove', touchmove, options)
    document.removeEventListener('gesturestart', prevent, options)
    document.removeEventListener('gesturechange', prevent, options)
    document.removeEventListener('gestureend', prevent, options)
  })
}
