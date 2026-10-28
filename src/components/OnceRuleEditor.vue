<script setup lang="ts">
import { computed } from 'vue'
import { lines } from '@/util/once-settings'
import { colors } from '@/util/resources'
import type { RuleDraft } from '@/util/once-settings'

const rule = defineModel<RuleDraft>({ required: true })
defineProps<{
  position: number
  total: number
  disabled: boolean
  canOpen: boolean
  hasLaterAutomatic: boolean
}>()
defineEmits<{ move: [direction: number]; remove: []; open: [] }>()
const catchAll = computed(
  () => rule.value.automatic && lines(rule.value.patterns).includes('*'),
)
const colorNames = {
  grey: 'Grau',
  blue: 'Blau',
  red: 'Rot',
  yellow: 'Gelb',
  green: 'Grün',
  pink: 'Pink',
  purple: 'Lila',
  cyan: 'Türkis',
  orange: 'Orange',
}
</script>

<template>
  <article
    class="panel rule-card"
    :aria-label="`Gruppe ${position}: ${rule.title || 'Ohne Namen'}`"
    :style="`--rule-color: var(--group-${rule.color})`"
  >
    <div class="rule-card-heading">
      <div class="rule-heading-label">
        <span class="rule-number">{{ position.toString().padStart(2, '0') }}</span>
        <h3>{{ rule.title || 'Ohne Namen' }}</h3>
        <span v-if="catchAll" class="rule-badge">Auffangregel</span>
        <span v-if="!rule.automatic" class="rule-badge">Ohne Regel</span>
        <span v-if="rule.keepOpen" class="rule-badge">Dauerhaft offen</span>
      </div>
      <div class="rule-actions">
        <button
          type="button"
          class="icon-button"
          :disabled="disabled || position === 1"
          :aria-label="`Regel ${position} nach oben`"
          @click="$emit('move', -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="icon-button"
          :disabled="disabled || position === total"
          :aria-label="`Regel ${position} nach unten`"
          @click="$emit('move', 1)"
        >
          ↓
        </button>
        <button
          type="button"
          class="icon-button remove-button"
          :disabled="disabled"
          :aria-label="`Regel ${position} entfernen`"
          @click="$emit('remove')"
        >
          ×
        </button>
      </div>
    </div>
    <fieldset :disabled="disabled">
      <div class="rule-top-fields">
        <div>
          <label :for="`${rule.id}-title`">Zielgruppe</label>
          <input
            :id="`${rule.id}-title`"
            v-model="rule.title"
            type="text"
            placeholder="Ohne Namen (optional)"
            autocomplete="off"
          />
          <p class="field-help">Leer lassen für eine Gruppe nur mit Farbpunkt.</p>
        </div>
        <div>
          <span class="field-label" :id="`${rule.id}-colors`">
            Farbe neuer Gruppen
          </span>
          <div
            class="color-palette"
            role="radiogroup"
            :aria-labelledby="`${rule.id}-colors`"
          >
            <label
              v-for="color in colors"
              :key="color"
              class="color-swatch"
              :style="`--swatch: var(--group-${color})`"
              :title="colorNames[color]"
            >
              <input
                v-model="rule.color"
                type="radio"
                :name="`${rule.id}-color`"
                :value="color"
                :aria-label="colorNames[color]"
              />
              <span aria-hidden="true"></span>
            </label>
          </div>
        </div>
      </div>
      <div class="group-options">
        <label class="toggle-label">
          <input v-model="rule.automatic" type="checkbox" />
          Neue Tabs automatisch zuordnen
        </label>
        <label class="toggle-label">
          <input v-model="rule.keepOpen" type="checkbox" />
          Dauerhaft offen halten
        </label>
        <p class="field-help">
          Dauerhaft offene Gruppen behalten einen Start-Tab. Weitere Fenster öffnen
          keine Kopie. Ausschalten beendet das Offenhalten, ohne deine Tabs zu
          schließen.
        </p>
      </div>
      <div v-if="rule.automatic" class="rule-field">
        <label :for="`${rule.id}-patterns`">URL-Muster</label>
        <textarea
          :id="`${rule.id}-patterns`"
          v-model="rule.patterns"
          rows="2"
          spellcheck="false"
          placeholder="https://chatgpt.com/*"
        ></textarea>
        <p class="field-help">
          Ein Muster pro Zeile.
          <code>*</code>
          passt auf alle Zieladressen. Leere neue Tabs warten auf den ersten
          Seitenaufruf.
        </p>
      </div>
      <p v-if="catchAll && hasLaterAutomatic" class="inline-warning">
        Diese Auffangregel kann spätere Regeln überdecken. Sie steht üblicherweise
        zuletzt.
      </p>
      <div v-if="rule.automatic" class="rule-secondary-fields">
        <div>
          <label :for="`${rule.id}-exclude`">
            Titel-Ausnahmen
            <span class="optional">optional</span>
          </label>
          <textarea
            :id="`${rule.id}-exclude`"
            v-model="rule.excludedTitles"
            rows="2"
            placeholder="z. B. xxx"
          ></textarea>
          <p class="field-help">
            Ein Begriff pro Zeile. Enthält der erste Tabtitel einen davon, wird die
            nächste Regel geprüft. Groß-/Kleinschreibung ist egal.
          </p>
        </div>
        <div>
          <label :for="`${rule.id}-windows`">Fensterzuordnung</label>
          <select :id="`${rule.id}-windows`" v-model="rule.merge">
            <option :value="false">Im Fenster bleiben (keine Gruppenkopie)</option>
            <option :value="true">Bestehende Gruppe auch in anderen Fenstern</option>
          </select>
          <p class="field-help">
            Jede Regel nutzt eine feste Zielgruppe. Liegt sie in einem anderen
            Fenster, wechselt der Tab dorthin oder bleibt ohne neue Zuordnung in
            seinem Fenster. Es entsteht keine Gruppenkopie. Bestehende Gruppen
            behalten ihre Farbe.
          </p>
        </div>
      </div>
      <div class="group-open-action">
        <button
          class="button secondary"
          type="button"
          :disabled="!canOpen"
          @click="$emit('open')"
        >
          Gruppe öffnen
        </button>
        <span class="small muted">
          {{
            canOpen
              ? 'Verwendet die vorhandene Gruppe, falls sie offen ist.'
              : 'Zum Öffnen zuerst die Änderungen speichern.'
          }}
        </span>
      </div>
    </fieldset>
  </article>
</template>
