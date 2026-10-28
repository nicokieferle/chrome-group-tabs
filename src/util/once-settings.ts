import { generateMatcherRegex } from './matcher-regex'
import { GroupConfigurationSchemas } from './schemas'
import { createDefaultGroups, matchNewTab } from './once-router'
import * as lzma from './lzma'
import type { GroupConfiguration } from './types'

export type RuleDraft = {
  id: string
  title: string
  color: GroupConfiguration['color']
  patterns: string
  excludedTitles: string
  merge: boolean
  automatic: boolean
  keepOpen: boolean
}

export function lines(text: string) {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean),
    ),
  ]
}

/** Preserve the existing storage format and every configured rule on upgrade. */
export function decodeRules(raw: unknown): GroupConfiguration[] | undefined {
  if (raw === undefined) return undefined
  let value = raw
  if (typeof value === 'string') {
    const text = value.trim()
    value = JSON.parse(text.startsWith('[') ? text : lzma.decompressBase64(text))
  }
  if (Array.isArray(value)) {
    value = value.map(group => ({
      ...group,
      options: { strict: false, merge: false, ...group?.options },
    }))
  }
  return GroupConfigurationSchemas.parse(value)
}

export function toDrafts(rules: GroupConfiguration[]): RuleDraft[] {
  return rules.map(rule => ({
    id: rule.id,
    title: rule.title,
    color: rule.color,
    patterns: rule.matchers.join('\n'),
    excludedTitles: (rule.options.excludedTitles ?? []).join('\n'),
    merge: rule.options.merge,
    automatic: rule.matchers.length > 0,
    keepOpen: Boolean(rule.options.keepOpen),
  }))
}

export function toRules(drafts: RuleDraft[]): GroupConfiguration[] {
  const rules = drafts.map((draft, index) => {
    const label = draft.title.trim() || `Gruppe ${index + 1}`
    const matchers = draft.automatic ? lines(draft.patterns) : []
    if (draft.automatic && !matchers.length)
      throw new Error(`${label}: Bitte mindestens ein URL-Muster eingeben.`)
    for (const pattern of matchers) {
      try {
        generateMatcherRegex(pattern)
      } catch {
        throw new Error(`${label}: Das URL-Muster „${pattern}“ ist ungültig.`)
      }
    }
    return {
      id: draft.id,
      title: draft.title.trim(),
      color: draft.color,
      matchers,
      // Strict regrouping is not part of the Once router.
      options: {
        strict: false,
        merge: draft.merge,
        excludedTitles: lines(draft.excludedTitles),
        keepOpen: draft.keepOpen,
      },
    }
  })
  return GroupConfigurationSchemas.parse(rules)
}

export function newRule(): RuleDraft {
  return {
    id: crypto.randomUUID(),
    title: '',
    color: 'blue',
    patterns: '',
    excludedTitles: '',
    merge: false,
    automatic: true,
    keepOpen: false,
  }
}

export function newManualGroup(): RuleDraft {
  return { ...newRule(), automatic: false, keepOpen: true }
}

export function defaultDrafts() {
  return toDrafts(createDefaultGroups([]))
}

export function previewRule(drafts: RuleDraft[], url: string, title: string) {
  if (!url.trim()) return undefined
  const rules = toRules(drafts)
  return matchNewTab({ url: url.trim(), title } as chrome.tabs.Tab, rules)
}

export function importRules(text: string): GroupConfiguration[] {
  const data: unknown = JSON.parse(text)
  if (Array.isArray(data)) return decodeRules(data)!
  if (
    data &&
    typeof data === 'object' &&
    'format' in data &&
    data.format === 'tabs-once' &&
    'version' in data &&
    data.version === 1 &&
    'rules' in data
  ) {
    return decodeRules(data.rules)!
  }
  throw new Error('Diese Datei enthält keine unterstützte Konfiguration.')
}

export function exportRules(rules: GroupConfiguration[]) {
  return JSON.stringify({ format: 'tabs-once', version: 1, rules }, null, 2)
}

export function encodeRules(rules: GroupConfiguration[], compressed: boolean) {
  return compressed ? lzma.compressBase64(JSON.stringify(rules)) : rules
}
