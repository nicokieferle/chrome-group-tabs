import { useGroupConfigurations } from '@/composables'
import { createDefaultGroups, registerOnceRouter } from '@/util/once-router'
import { readStorage } from '@/util/storage'
import { saveGroupConfigurations } from '@/util/group-configurations'
import { when } from '@/util/when'
import { registerPersistentGroups } from '@/util/persistent-groups'

const groups = useGroupConfigurations()

// Register listeners synchronously so a new tab can wake the MV3 worker.
// Session-local IDs protect handled tabs; browser startup preserves native groups.
const router = registerOnceRouter(chrome, async () => {
  await when(groups.loaded)
  if (typeof (await readStorage('groups', 'sync')) === 'undefined') {
    const defaults = createDefaultGroups(await chrome.tabGroups.query({}))
    groups.data.value = defaults
    await saveGroupConfigurations(defaults)
  }
  return () => groups.data.value
})

const persistent = registerPersistentGroups(chrome, () => groups.data.value, router)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.groups) persistent.refresh()
})

chrome.runtime.onUpdateAvailable.addListener(() => chrome.runtime.reload())
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'once:open-group') {
    if (
      sender.id !== chrome.runtime.id ||
      typeof message.id !== 'string' ||
      !Number.isInteger(message.windowId)
    ) {
      sendResponse({ ok: false, error: 'Ungültige Gruppenanfrage.' })
      return false
    }
    void persistent.open(message.id, message.windowId).then(
      () => sendResponse({ ok: true }),
      error =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Öffnen fehlgeschlagen.',
        }),
    )
    return true
  }
  if (message === 'reload') chrome.runtime.reload()
  return false
})
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage())
