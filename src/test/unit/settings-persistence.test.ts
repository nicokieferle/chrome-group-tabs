import { afterEach, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useOnceSettings } from '@/composables/use-once-settings'
import { createDefaultGroups } from '@/util/once-router'
import { decodeRules, encodeRules } from '@/util/once-settings'

let scope: ReturnType<typeof effectScope>
afterEach(() => {
  scope?.stop()
  vi.unstubAllGlobals()
})

function harness(raw: unknown = encodeRules(createDefaultGroups([]), true)) {
  let stored = raw
  const callbacks = new Set<(data: unknown, area: string) => void>()
  const set = vi.fn(async (data: { groups: unknown }) => {
    const oldValue = stored
    stored = data.groups
    for (const fn of callbacks)
      fn({ groups: { newValue: stored, oldValue } }, 'sync')
  })
  vi.stubGlobal('chrome', {
    storage: {
      sync: { get: vi.fn(async () => ({ groups: stored })), set },
      onChanged: {
        addListener: (fn: (data: unknown, area: string) => void) =>
          callbacks.add(fn),
        removeListener: (fn: (data: unknown, area: string) => void) =>
          callbacks.delete(fn),
      },
    },
  })
  scope = effectScope()
  const settings = scope.run(() => useOnceSettings())!
  return {
    settings,
    set,
    stored: () => stored,
    external: async (rules: ReturnType<typeof createDefaultGroups>) =>
      set({ groups: encodeRules(rules, true) }),
  }
}

it('loads old rules without writing and saves the edited configuration in the existing format', async () => {
  const h = harness()
  await vi.waitFor(() => expect(h.settings.loading.value).toBe(false))
  expect(h.set).not.toHaveBeenCalled()
  h.settings.drafts.value[0]!.title = 'Mein GPT'
  h.settings.drafts.value[0]!.excludedTitles = 'xxx\nPrivat'
  expect(h.settings.dirty.value).toBe(true)
  expect(h.set).not.toHaveBeenCalled()
  await h.settings.save()
  expect(decodeRules(h.stored())![0]).toMatchObject({
    title: 'Mein GPT',
    options: { excludedTitles: ['xxx', 'Privat'] },
  })
  expect(h.settings.dirty.value).toBe(false)
  expect(h.settings.notice.value).toContain('Gespeichert')
})

it('reports Chrome storage failures without falsely marking a draft as saved', async () => {
  const h = harness()
  await vi.waitFor(() => expect(h.settings.loading.value).toBe(false))
  h.settings.drafts.value[0]!.title = 'Neu'
  h.set.mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM überschritten'))
  await h.settings.save()
  expect(h.settings.error.value).toContain('QUOTA')
  expect(h.settings.notice.value).toBe('')
  expect(h.settings.dirty.value).toBe(true)
  expect(h.settings.savedRules.value[0]!.title).toBe('GPT')
})

it('retains an unsaved draft when another window updates the rules and blocks an overwrite', async () => {
  const h = harness()
  await vi.waitFor(() => expect(h.settings.loading.value).toBe(false))
  h.settings.drafts.value[0]!.title = 'Mein Entwurf'
  const other = createDefaultGroups([])
  other[0]!.title = 'Anderes Fenster'
  await h.external(other)
  expect(h.settings.changedElsewhere.value).toBe(true)
  expect(h.settings.drafts.value[0]!.title).toBe('Mein Entwurf')
  await h.settings.save()
  expect(h.settings.error.value).toContain('anderen Fenster')
  expect(decodeRules(h.stored())![0]!.title).toBe('Anderes Fenster')
  await h.settings.reload()
  expect(h.settings.drafts.value[0]!.title).toBe('Anderes Fenster')
  expect(h.settings.dirty.value).toBe(false)
})

it('does not replace corrupt saved data with defaults or a new configuration', async () => {
  const h = harness('not valid compressed settings')
  await vi.waitFor(() => expect(h.settings.loading.value).toBe(false))
  expect(h.settings.loadFailed.value).toBe(true)
  expect(h.settings.error.value).toContain('nicht geladen')
  h.settings.drafts.value = []
  await h.settings.save()
  expect(h.set).not.toHaveBeenCalled()
  expect(h.stored()).toBe('not valid compressed settings')
})
