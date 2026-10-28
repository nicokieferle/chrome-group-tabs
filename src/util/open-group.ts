/** Open only saved groups through the background worker. */
export async function openSavedGroup(id: string) {
  if (typeof globalThis.chrome?.runtime?.sendMessage !== 'function')
    throw new Error('Gruppen lassen sich in der installierten Erweiterung öffnen.')
  const window = await chrome.windows.getCurrent()
  const response = await chrome.runtime.sendMessage({
    type: 'once:open-group',
    id,
    windowId: window.id,
  })
  if (!response?.ok)
    throw new Error(response?.error || 'Die Gruppe konnte nicht geöffnet werden.')
}
