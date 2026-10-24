<script setup lang="ts">
import Layout from './Layout.vue'
import manifest from './manifest/manifest.base'
import { useOnceSettings } from './composables/use-once-settings'

const { savedRules, loading, error } = useOnceSettings()
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
          <span class="brand-icon" aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
          </span>
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
          <i class="status-dot" :class="{ inactive: !savedRules.length }"></i>
          {{
            savedRules.length
              ? 'Zuordnung für neue Tabs aktiv'
              : 'Keine Zuordnungsregeln eingerichtet'
          }}
        </div>
        <ol class="popup-rules">
          <li v-for="rule in savedRules" :key="rule.id">
            <span
              class="group-dot"
              :style="`--dot-color: var(--group-${rule.color})`"
            ></span>
            <div>
              <strong>{{ rule.title }}</strong>
              <p>
                {{
                  rule.matchers.includes('*')
                    ? 'Übrige neue Tabs'
                    : rule.matchers.join(' · ')
                }}
              </p>
              <span v-if="rule.options.excludedTitles?.length" class="small muted">
                {{ rule.options.excludedTitles.length }} Titel-Ausnahme{{
                  rule.options.excludedTitles.length === 1 ? '' : 'n'
                }}
              </span>
            </div>
            <span class="small muted">
              {{ rule.options.merge ? 'Fensterübergreifend' : 'Im Fenster bleiben' }}
            </span>
          </li>
        </ol>
        <p class="popup-note">
          Bestehende Tabs und deine manuelle Gruppierung bleiben erhalten.
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
