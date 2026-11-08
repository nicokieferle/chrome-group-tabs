const colors = {
  grey: '#a7b2bb',
  blue: '#8ab4f8',
  red: '#f28b82',
  yellow: '#fdd663',
  green: '#81c995',
  pink: '#f5a1cf',
  purple: '#c58af9',
  cyan: '#78d9ec',
  orange: '#fcad70',
}
let ownTabId
let ownGroupId
async function refreshGroup() {
  if (!globalThis.chrome?.tabs?.getCurrent) return
  try {
    const tab = await chrome.tabs.getCurrent()
    ownTabId = tab.id
    ownGroupId = tab.groupId
    if (tab.groupId === -1) return
    const group = await chrome.tabGroups.get(tab.groupId)
    const title = group.title || 'Gruppe ohne Namen'
    document.querySelector('#group-title').textContent = title
    document.title = `${title} · Once`
    document.documentElement.style.setProperty('--group-color', colors[group.color])
  } catch {
    /* A group can close while its start page is loading. */
  }
}
document.querySelector('#open-page').addEventListener('submit', async event => {
  event.preventDefault()
  const text = document.querySelector('#address').value.trim()
  if (!text) return
  let target
  if (/^https?:\/\//i.test(text)) target = text
  else if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)) target = `https://${text}`
  else target = `https://www.google.com/search?q=${encodeURIComponent(text)}`
  if (!globalThis.chrome?.runtime?.sendMessage) {
    location.assign(target)
    return
  }
  const button = event.currentTarget.querySelector('button')
  const feedback = document.querySelector('#open-error')
  feedback.hidden = true
  button.disabled = true
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'once:open-page',
      url: target,
    })
    if (!result?.ok) throw new Error(result?.error || 'Öffnen fehlgeschlagen.')
    document.querySelector('#address').value = ''
  } catch (error) {
    feedback.textContent = error.message
    feedback.hidden = false
  } finally {
    button.disabled = false
  }
})
document
  .querySelector('#settings')
  .addEventListener('click', () => chrome.runtime.openOptionsPage())
globalThis.chrome?.tabs?.onUpdated?.addListener((id, changes) => {
  if (id === ownTabId && changes.groupId !== undefined) void refreshGroup()
})
globalThis.chrome?.tabGroups?.onUpdated?.addListener(group => {
  if (group.id === ownGroupId) void refreshGroup()
})
void refreshGroup()
