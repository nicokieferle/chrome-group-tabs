<script setup lang="ts">
import { computed } from 'vue'
import { lines } from '@/util/once-settings'
import { colors } from '@/util/resources'
import type { RuleDraft } from '@/util/once-settings'

const rule = defineModel<RuleDraft>({ required: true })
defineProps<{ position: number; total: number; disabled: boolean }>()
defineEmits<{ move: [direction: number]; remove: [] }>()
const catchAll = computed(() => lines(rule.value.patterns).includes('*'))
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
    :aria-label="`Regel ${position}: ${rule.title || 'Neue Regel'}`"
    :style="`--rule-color: var(--group-${rule.color})`"
  >
    <div class="rule-card-heading">
      <div class="rule-heading-label">
        <span class="rule-number">{{ position.toString().padStart(2, '0') }}</span>
        <h3>{{ rule.title || 'Neue Regel' }}</h3>
        <span v-if="catchAll" class="rule-badge">Auffangregel</span>
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
            placeholder="Gruppenname"
            autocomplete="off"
          />
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
      <div class="rule-field">
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
          passt auf alle Adressen, auch leere neue Tabs.
        </p>
      </div>
      <p v-if="catchAll && position < total" class="inline-warning">
        Diese Auffangregel kann spätere Regeln überdecken. Sie steht üblicherweise
        zuletzt.
      </p>
      <div class="rule-secondary-fields">
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
            <option :value="false">Im Fenster des neuen Tabs</option>
            <option :value="true">Bestehende Gruppe auch in anderen Fenstern</option>
          </select>
          <p class="field-help">
            Eine vorhandene Gruppe mit gleichem Namen wird verwendet. Fehlt sie, wird
            sie angelegt. Bestehende Gruppen behalten ihre Farbe.
          </p>
        </div>
      </div>
    </fieldset>
  </article>
</template>
