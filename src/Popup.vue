<script setup lang="ts">
import Layout from './Layout.vue'
import manifest from './manifest/manifest.base'
import { useOnceSettings } from './composables/use-once-settings'
import { openSavedGroup } from './util/open-group'
import { computed, ref } from 'vue'

const { savedRules, loading, error } = useOnceSettings()
const automaticCount = computed(
  () => savedRules.value.filter(rule => rule.matchers.length).length,
)
const opening = ref(false)
async function openGroup(id: string) {
  opening.value = true
  try {
    await openSavedGroup(id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Öffnen fehlgeschlagen.'
  } finally {
    opening.value = false
  }
}
async function openSettings() {
  try {
    if (typeof globalThis.chrome?.runtime?.openOptionsPage === 'function') {
      await chrome.runtime.openOptionsPage()
      window.close()
    } else window.location.assign('/?context=options')
  } catch {
    error.value =
      'Die Einstellungen konnten nicht geöffnet werden. Bitte erneut versuchen.'
  }
}
</script>

<template>
  <Layout>
    <main class="popup-page">
      <header class="popup-header">
        <div class="brand">
          <img class="brand-icon" src="/icons/icon.svg" alt="" />
          <span>
            Tabgruppen
            <b>Once</b>
          </span>
        </div>
        <span class="version-tag">{{ manifest.version }}</span>
      </header>
      <h1>
        Neue Tabs.
        <br />
        Direkt am richtigen Platz.
      </h1>
      <p class="popup-intro">Einmal einsortiert. Danach entscheidest du.</p>
      <div v-if="loading" class="panel" role="status">
        Einstellungen werden geladen …
      </div>
      <div v-else-if="error" class="message error" role="alert">{{ error }}</div>
      <template v-else>
        <div class="popup-status">
          <i class="status-dot" :class="{ inactive: !automaticCount }"></i>
          {{
            automaticCount
              ? 'Zuordnung für neue Tabs aktiv'
              : 'Manuelle Gruppen · keine automatische Zuordnung'
          }}
        </div>
        <ol class="popup-rules">
          <li v-for="rule in savedRules" :key="rule.id">
            <span
              class="group-dot"
              :style="`--dot-color: var(--group-${rule.color})`"
            ></span>
            <div>
              <strong>{{ rule.title || 'Ohne Namen' }}</strong>
              <p>
                {{
                  !rule.matchers.length
                    ? 'Ohne Zuordnungsregel'
                    : rule.matchers.includes('*')
                      ? 'Übrige neue Tabs'
                      : rule.matchers.join(' · ')
                }}
              </p>
              <span v-if="rule.options.keepOpen" class="small muted">
                Dauerhaft offen
              </span>
              <span v-if="rule.options.excludedTitles?.length" class="small muted">
                {{ rule.options.excludedTitles.length }} Titel-Ausnahme{{
                  rule.options.excludedTitles.length === 1 ? '' : 'n'
                }}
              </span>
            </div>
            <button
              class="button secondary popup-open"
              type="button"
              :disabled="opening"
              :aria-label="`${rule.title || 'Gruppe ohne Namen'} öffnen`"
              @click="openGroup(rule.id)"
            >
              Öffnen
            </button>
          </li>
        </ol>
        <p class="popup-note">
          Bereits gruppierte Tabs bleiben in ihrer Gruppe. Regeln gelten nur für
          neue, ungruppierte Tabs.
        </p>
      </template>
      <button
        class="button primary popup-settings-button"
        type="button"
        @click="openSettings"
      >
        Einstellungen öffnen
        <span aria-hidden="true">↗</span>
      </button>
    </main>
  </Layout>
</template>
