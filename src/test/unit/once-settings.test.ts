import { expect, it } from 'vitest'
import { createDefaultGroups } from '@/util/once-router'
import {
  decodeRules,
  defaultDrafts,
  encodeRules,
  exportRules,
  importRules,
  previewRule,
  toDrafts,
  toRules,
  newManualGroup,
} from '@/util/once-settings'

it('reads existing compressed, serialized and uncompressed configurations without losing custom settings', () => {
  const rules = createDefaultGroups([])
  rules[0]!.title = 'Meine GPT-Gruppe'
  rules[0]!.color = 'purple'
  rules[0]!.options.excludedTitles = ['AC', 'Privat']
  rules[0]!.options.strict = true
  for (const raw of [rules, JSON.stringify(rules), encodeRules(rules, true)]) {
    expect(decodeRules(raw)).toEqual(rules)
  }
  const edited = toRules(toDrafts(rules))
  expect(edited[0]).toMatchObject({
    id: rules[0]!.id,
    title: 'Meine GPT-Gruppe',
    color: 'purple',
    options: { strict: false, merge: true, excludedTitles: ['AC', 'Privat'] },
  })
})

it('distinguishes a fresh installation from intentionally removed rules and keeps old option defaults', () => {
  expect(decodeRules(undefined)).toBeUndefined()
  expect(decodeRules([])).toEqual([])
  expect(toRules([])).toEqual([])
  const old = [
    {
      id: crypto.randomUUID(),
      title: 'Test',
      color: 'blue',
      matchers: ['example.com'],
    },
  ]
  expect(decodeRules(old)?.[0]?.options).toMatchObject({
    strict: false,
    merge: false,
  })
})

it('uses the actual once router for draft preview including title exclusions and ordering', () => {
  const drafts = defaultDrafts()
  drafts[0]!.excludedTitles = '  xxx  \nPrivat'
  expect(previewRule(drafts, 'https://chatgpt.com/c/123', 'normal')?.title).toBe(
    'GPT',
  )
  expect(
    previewRule(drafts, 'https://chatgpt.com/c/123', 'Projekt XXX')?.title,
  ).toBe('Default')
  expect(previewRule(drafts, 'chrome://newtab/', '')).toBeUndefined()
  drafts.reverse()
  expect(previewRule(drafts, 'https://chatgpt.com/', '')?.title).toBe('Default')
  expect(previewRule(drafts, '', '')).toBeUndefined()
})

it('validates automatic URL patterns while allowing groups without names or rules', () => {
  const drafts = defaultDrafts()
  drafts[0]!.patterns = '/[invalid/'
  expect(() => toRules(drafts)).toThrow('ungültig')
  drafts[0]!.patterns = ''
  expect(() => toRules(drafts)).toThrow('mindestens ein URL-Muster')
  drafts[0]!.title = ' '
  drafts[0]!.patterns = 'https://chatgpt.com/*'
  expect(toRules(drafts)[0]!.title).toBe('')
  const manual = newManualGroup()
  expect(toRules([manual])[0]).toMatchObject({
    title: '',
    matchers: [],
    options: { keepOpen: true },
  })
  expect(previewRule([manual], 'https://chatgpt.com/', '')).toBeUndefined()
  expect(importRules(exportRules(toRules([manual])))).toEqual(toRules([manual]))
})

it('keeps textarea line breaks while editing and normalizes duplicate lines only on save', () => {
  const drafts = defaultDrafts()
  drafts[0]!.patterns = 'https://chatgpt.com/*\n\nhttps://chatgpt.com/*\n'
  drafts[0]!.excludedTitles = ' xxx \r\nPrivat\nxxx\n'
  const rules = toRules(drafts)
  expect(rules[0]!.matchers).toEqual(['https://chatgpt.com/*'])
  expect(rules[0]!.options.excludedTitles).toEqual(['xxx', 'Privat'])
  expect(drafts[0]!.patterns.endsWith('\n')).toBe(true)
})

it('imports both previous exports and the new versioned backup format', () => {
  const rules = createDefaultGroups([])
  expect(importRules(JSON.stringify(rules))).toEqual(rules)
  expect(importRules(exportRules(rules))).toEqual(rules)
  expect(importRules(exportRules([]))).toEqual([])
  expect(() =>
    importRules('{"format":"tabs-once","version":99,"rules":[]}'),
  ).toThrow()
  expect(() =>
    importRules('{"format":"tabs-once","version":1,"rules":null}'),
  ).toThrow()
  expect(() => importRules('not json')).toThrow()
})
