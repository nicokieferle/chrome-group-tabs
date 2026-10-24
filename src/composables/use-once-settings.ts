import { computed, onScopeDispose, ref, watch } from 'vue'
import { createDefaultGroups } from '@/util/once-router'
import { decodeRules, encodeRules, toDrafts, toRules } from '@/util/once-settings'
import { readStorage, watchStorage, writeStorage } from '@/util/storage'
import type { GroupConfiguration } from '@/util/types'
import type { RuleDraft } from '@/util/once-settings'

export function useOnceSettings() {
  const drafts = ref<RuleDraft[]>([])
  const savedRules = ref<GroupConfiguration[]>([])
  const baseline = ref('[]')
  const loading = ref(true)
  const loadFailed = ref(false)
  const saving = ref(false)
  const error = ref('')
  const notice = ref('')
  const changedElsewhere = ref(false)
  let storageVersion: string | undefined
  const dirty = computed(() => JSON.stringify(drafts.value) !== baseline.value)
  watch(
    drafts,
    () => {
      notice.value = ''
    },
    { deep: true, flush: 'sync' },
  )

  async function reload() {
    loading.value = true
    loadFailed.value = false
    error.value = ''
    try {
      const raw: unknown = await readStorage('groups', 'sync')
      let rules = decodeRules(raw)
      if (rules === undefined) {
        const native =
          typeof globalThis.chrome?.tabGroups !== 'undefined'
            ? await chrome.tabGroups.query({})
            : []
        rules = createDefaultGroups(native)
      }
      storageVersion = JSON.stringify(raw)
      savedRules.value = rules
      drafts.value = toDrafts(rules)
      baseline.value = JSON.stringify(drafts.value)
      changedElsewhere.value = false
    } catch {
      loadFailed.value = true
      error.value =
        'Die gespeicherten Einstellungen konnten nicht geladen werden. Deine bisherigen Regeln wurden nicht verändert.'
    } finally {
      loading.value = false
    }
  }

  async function save() {
    error.value = ''
    notice.value = ''
    if (loading.value || saving.value || loadFailed.value) return
    saving.value = true
    try {
      const rules = toRules(drafts.value)
      const current: unknown = await readStorage('groups', 'sync')
      if (JSON.stringify(current) !== storageVersion) {
        changedElsewhere.value = true
        throw new Error(
          'Die Einstellungen wurden in einem anderen Fenster geändert. Lade diesen Stand zuerst neu.',
        )
      }
      const encoded = encodeRules(
        rules,
        typeof globalThis.chrome?.storage !== 'undefined',
      )
      await writeStorage('groups', encoded, 'sync')
      storageVersion = JSON.stringify(encoded)
      savedRules.value = rules
      drafts.value = toDrafts(rules)
      baseline.value = JSON.stringify(drafts.value)
      changedElsewhere.value = false
      notice.value = 'Gespeichert. Die Regeln gelten für künftig geöffnete Tabs.'
    } catch (cause) {
      error.value =
        cause instanceof Error
          ? cause.message
          : 'Speichern fehlgeschlagen. Bitte erneut versuchen.'
    } finally {
      saving.value = false
    }
  }

  const stopWatching = watchStorage('groups', (value: unknown) => {
    if (saving.value || JSON.stringify(value) === storageVersion) return
    if (dirty.value) changedElsewhere.value = true
    else void reload()
  })
  onScopeDispose(stopWatching)
  void reload()

  return {
    drafts,
    savedRules,
    loading,
    loadFailed,
    saving,
    dirty,
    error,
    notice,
    changedElsewhere,
    reload,
    save,
  }
}
