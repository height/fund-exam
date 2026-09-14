// Shared by capture receipts, notebook cards, and any future note entry point.
export function openNote(id, mode = 'view', options = {}) {
  window.dispatchEvent(new CustomEvent('open-note', { detail: { ...options, id, mode } }))
}
