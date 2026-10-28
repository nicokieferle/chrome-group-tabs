<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from 'vue'
import Layout from './Layout.vue'
import OnceRuleEditor from './components/OnceRuleEditor.vue'
import manifest from './manifest/manifest.base'
import { isNewTabPlaceholder } from './util/once-router'
import { useOnceSettings } from './composables/use-once-settings'
import {
  defaultDrafts,
  exportRules,
  importRules,
  newRule,
  previewRule,
  toDrafts,
} from './util/once-settings'

const {
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
} = useOnceSettings()
const testUrl = ref('https://chatgpt.com/')
const testTitle = ref('')
const fileInput = ref<HTMLInputElement>()
const restoringDefaults = ref(false)
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onScopeDispose(() => window.removeEventListener('beforeunload', beforeUnload))
const preview = computed(() => {
  try {
    const rule = previewRule(drafts.value, testUrl.value, testTitle.value)
    return { rule, error: '' }
  } catch (cause) {
    return {
      rule: undefined,
      error: cause instanceof Error ? cause.message : 'Bitte die Regeln prüfen.',
    }
  }
})

function moveRule(index: number, direction: number) {
  const target = index + direction
  if (target < 0 || target >= drafts.value.length) return
  const [rule] = drafts.value.splice(index, 1)
  drafts.value.splice(target, 0, rule!)
}

function exportConfiguration() {
  const url = URL.createObjectURL(
    new Blob([exportRules(savedRules.value)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `tabs-once-einstellungen-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

async function importConfiguration(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  try {
    const rules = importRules(await file.text())
    drafts.value = toDrafts(rules)
    notice.value = 'Konfiguration eingelesen. Zum Übernehmen bitte speichern.'
  } catch {
    error.value =
      'Die Datei ist keine gültige Konfiguration. Deine Regeln wurden nicht verändert.'
  } finally {
    input.value = ''
  }
}

function restoreDefaults() {
  drafts.value = defaultDrafts()
  restoringDefaults.value = false
  notice.value =
    'Standardregeln als Entwurf eingesetzt. Zum Übernehmen bitte speichern.'
}
</script>

<template>
  <Layout>
    <div class="settings-page">
      <header class="page-header">
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
        <span class="version-tag">Version {{ manifest.version }}</span>
      </header>
      <main>
        <section class="intro">
          <span class="eyebrow">DEINE TAB-ORDNUNG</span>
          <h1>
            Einmal einsortieren.
            <br />
            Danach bleibt’s.
          </h1>
          <p>
            Du bestimmst, wohin neue Tabs kommen. Was du später verschiebst, bleibt
            genau dort.
          </p>
          <div class="behavior-chips">
            <span>
              <i class="status-dot"></i>
              Nur neue Tabs
            </span>
            <span>Manuelles Verschieben bleibt erhalten</span>
            <span>Keine Tab-Kopien</span>
          </div>
        </section>
        <div v-if="loading" class="panel loading-state" role="status">
          Einstellungen werden geladen …
        </div>
        <template v-else>
          <div v-if="error" class="message error" role="alert">
            {{ error }}
            <button
              v-if="loadFailed"
              type="button"
              class="button secondary"
              @click="reload"
            >
              Erneut laden
            </button>
          </div>
          <div v-if="changedElsewhere" class="message warning" role="alert">
            <p>
              In einem anderen Fenster wurde eine neue Konfiguration gespeichert.
              Dein Entwurf wurde nicht überschrieben.
            </p>
            <button
              class="button secondary"
              type="button"
              :disabled="saving"
              @click="reload"
            >
              Aktuellen Stand laden und Entwurf verwerfen
            </button>
          </div>
          <div v-if="!loadFailed" class="workspace">
            <section aria-labelledby="rules-heading" class="rules-section">
              <div class="section-heading">
                <div>
                  <h2 id="rules-heading">
                    Zuordnungsregeln
                    <span class="count">{{ drafts.length }}</span>
                  </h2>
                  <p>Von oben nach unten. Die erste passende Regel entscheidet.</p>
                </div>
                <button
                  class="button secondary"
                  type="button"
                  :disabled="saving"
                  @click="drafts.push(newRule())"
                >
                  + Regel hinzufügen
                </button>
              </div>
              <div v-if="!drafts.length" class="panel empty-state">
                <h3>Noch keine Regeln</h3>
                <p>
                  Neue Tabs behalten ihre Chrome-Gruppierung. Füge eine Regel hinzu,
                  um sie automatisch einzuordnen.
                </p>
              </div>
              <OnceRuleEditor
                v-for="(rule, index) in drafts"
                :key="rule.id"
                v-model="drafts[index]!"
                :position="index + 1"
                :total="drafts.length"
                :disabled="saving"
                @move="moveRule(index, $event)"
                @remove="drafts.splice(index, 1)"
              />
            </section>
            <aside class="sidebar">
              <section class="panel preview-panel" aria-labelledby="preview-heading">
                <span class="eyebrow">VORSCHAU</span>
                <h2 id="preview-heading">Wohin kommt der Tab?</h2>
                <p>Probiere deinen aktuellen Entwurf aus.</p>
                <label for="test-url">Adresse des neuen Tabs</label>
                <input
                  id="test-url"
                  v-model="testUrl"
                  type="text"
                  spellcheck="false"
                  placeholder="https://chatgpt.com/"
                />
                <label for="test-title">
                  Tabtitel
                  <span class="optional">optional</span>
                </label>
                <input
                  id="test-title"
                  v-model="testTitle"
                  type="text"
                  placeholder="z. B. AC Zentrale"
                />
                <div class="preview-result" aria-live="polite">
                  <template v-if="!testUrl.trim()">
                    <span class="muted">Gib eine Adresse ein.</span>
                  </template>
                  <template v-else-if="preview.error">
                    <span class="muted">{{ preview.error }}</span>
                  </template>
                  <template v-else-if="isNewTabPlaceholder(testUrl.trim())">
                    <strong>Wartet auf den ersten Seitenaufruf</strong>
                    <span class="muted">Ein leerer Tab erzeugt keine Gruppe.</span>
                  </template>
                  <template v-else-if="preview.rule">
                    <span class="muted">Zielgruppe</span>
                    <strong>
                      <span
                        class="group-dot"
                        :style="`--dot-color: var(--group-${preview.rule.color})`"
                      ></span>
                      {{ preview.rule.title }}
                    </strong>
                    <span class="muted">
                      {{
                        preview.rule.options.merge
                          ? 'Bestehende Gruppe auch in anderen Fenstern verwenden.'
                          : 'Liegt die Zielgruppe in einem anderen Fenster, bleibt der Tab hier ohne neue Zuordnung.'
                      }}
                    </span>
                  </template>
                  <template v-else>
                    <strong>Keine passende Regel</strong>
                    <span class="muted">Die Gruppierung bleibt unverändert.</span>
                  </template>
                </div>
                <p class="small muted">Die Vorschau verschiebt keinen Tab.</p>
              </section>
              <section class="help-panel" aria-labelledby="behavior-heading">
                <h3 id="behavior-heading">So arbeitet Once</h3>
                <p>
                  Bereits gruppierte Tabs bleiben in ihrer Gruppe. Auch neue Tabs,
                  die eine Gruppe übernehmen, werden nicht umsortiert. Regeln gelten
                  nur für neue, ungruppierte Tabs.
                </p>
                <p>
                  Leere neue Tabs warten auf den ersten Seitenaufruf. Dann werden URL
                  und Titel einmal geprüft. Spätere Navigation und manuelles
                  Verschieben lösen keine neue Zuordnung aus.
                </p>
                <p>
                  Jede Regel nutzt eine feste Zielgruppe. Weitere Fenster legen keine
                  Kopie davon an. Geänderte Regeln gelten für neue Tabs. Bestehende
                  Gruppen werden dadurch nicht umbenannt.
                </p>
                <p>
                  Beim Chrome-Start schützt eine kurze Pause die wiederhergestellten
                  Tabs. Auch selbst geöffnete Tabs bleiben während dieser Phase
                  unverändert.
                </p>
              </section>
            </aside>
          </div>
          <section
            v-if="!loadFailed"
            class="panel backup-panel"
            aria-labelledby="backup-heading"
          >
            <div>
              <h2 id="backup-heading">Sichern &amp; wiederherstellen</h2>
              <p>
                Exportiere deine gespeicherten Regeln oder lade eine Konfiguration
                als Entwurf.
              </p>
            </div>
            <div class="backup-actions">
              <button
                type="button"
                class="button secondary"
                :disabled="saving"
                @click="exportConfiguration"
              >
                Exportieren
              </button>
              <button
                type="button"
                class="button secondary"
                :disabled="saving"
                @click="fileInput?.click()"
              >
                Importieren
              </button>
              <button
                type="button"
                class="text-button"
                :disabled="saving"
                @click="restoringDefaults = !restoringDefaults"
              >
                Standardregeln
              </button>
            </div>
            <input
              ref="fileInput"
              class="visually-hidden"
              type="file"
              accept=".json,application/json"
              aria-label="Konfiguration importieren"
              :disabled="saving"
              @change="importConfiguration"
            />
            <div v-if="restoringDefaults" class="reset-confirmation">
              <p>
                Den aktuellen Entwurf durch die Standardregeln GPT und Default
                ersetzen? Deine gespeicherten Regeln bleiben bis zum Speichern
                erhalten.
              </p>
              <button
                type="button"
                class="button secondary"
                :disabled="saving"
                @click="restoreDefaults"
              >
                Standardregeln einsetzen
              </button>
              <button
                type="button"
                class="text-button"
                @click="restoringDefaults = false"
              >
                Abbrechen
              </button>
            </div>
          </section>
        </template>
      </main>
      <footer class="save-bar" aria-label="Änderungen übernehmen">
        <div>
          <strong>
            {{
              loadFailed
                ? 'Einstellungen nicht geladen'
                : saving
                  ? 'Wird gespeichert …'
                  : dirty
                    ? 'Ungespeicherte Änderungen'
                    : 'Alles auf dem aktuellen Stand'
            }}
          </strong>
          <p role="status">
            {{
              error ||
              notice ||
              (dirty
                ? 'Bestehende Tabs bleiben unverändert.'
                : 'Deine Regeln werden beim Öffnen neuer Tabs angewendet.')
            }}
          </p>
        </div>
        <div class="save-actions">
          <button
            class="button secondary"
            type="button"
            :disabled="loading || saving || !dirty"
            @click="reload"
          >
            Änderungen verwerfen
          </button>
          <button
            class="button primary"
            type="button"
            :disabled="loading || loadFailed || saving || !dirty || changedElsewhere"
            @click="save"
          >
            {{ saving ? 'Wird gespeichert …' : 'Änderungen speichern' }}
          </button>
        </div>
      </footer>
    </div>
  </Layout>
</template>
