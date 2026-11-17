import { anchorRuleId } from './group-anchor'
import type { GroupConfiguration } from './types'
import { colors } from './resources'

const KEY = 'group-once:member-fingerprints'
type Fingerprint = {
  ruleTitle: string
  title: string
  color: GroupConfiguration['color']
  members: string[]
}

/** Keep no page URLs or titles: only local URL hashes and native group metadata. */
export function createGroupMemory(
  storage: typeof chrome.storage.local | undefined,
  anchorBase: string | undefined,
  getRules: () => GroupConfiguration[],
) {
  let records: Record<string, Fingerprint> = {}
  let failure: unknown
  const ready = (async () => {
    if (!storage) return
    try {
      const value = (await storage.get(KEY))[KEY]
      if (!value || typeof value !== 'object') return
      for (const [id, record] of Object.entries(value)) {
        if (
          record &&
          typeof record === 'object' &&
          typeof record.ruleTitle === 'string' &&
          typeof record.title === 'string' &&
          typeof record.color === 'string' &&
          colors.includes(record.color as GroupConfiguration['color']) &&
          Array.isArray(record.members) &&
          record.members.length &&
          record.members.every(
            (hash: unknown) =>
              typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
          )
        )
          records[id] = record as Fingerprint
      }
    } catch (error) {
      failure = error
    }
  })()

  async function load() {
    await ready
    if (failure) throw failure
  }

  async function hashes(tabs: chrome.tabs.Tab[]) {
    const values = tabs
      .map(tab => tab.pendingUrl || tab.url || '')
      .filter(url => url && !anchorRuleId(url, anchorBase))
    return (
      await Promise.all(
        values.map(async url => {
          const bytes = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(url),
          )
          return Array.from(new Uint8Array(bytes), byte =>
            byte.toString(16).padStart(2, '0'),
          ).join('')
        }),
      )
    ).sort()
  }

  async function remember(
    rule: GroupConfiguration,
    group: chrome.tabGroups.TabGroup,
    tabs: chrome.tabs.Tab[],
  ) {
    if (!storage || !rule.options.keepOpen) return
    await load()
    const members = await hashes(tabs)
    // Missing URLs are not a usable identity; keep the last complete snapshot.
    if (members.length !== tabs.length || !members.length) return
    const next = {
      ruleTitle: rule.title.toLocaleLowerCase(),
      title: group.title ?? '',
      color: group.color,
      members,
    }
    if (JSON.stringify(records[rule.id]) === JSON.stringify(next)) return
    const updated = { ...records, [rule.id]: next }
    await storage.set({ [KEY]: updated })
    records = updated
  }

  async function find(
    rule: GroupConfiguration,
    groups: chrome.tabGroups.TabGroup[],
    tabs: chrome.tabs.Tab[],
  ) {
    await load()
    const record = records[rule.id]
    if (
      !rule.options.keepOpen ||
      !record ||
      record.ruleTitle !== rule.title.toLocaleLowerCase()
    )
      return {}
    const matches: chrome.tabGroups.TabGroup[] = []
    let overlap = false
    const liveRules = new Set(
      getRules()
        .filter(item => item.options.keepOpen)
        .map(item => item.id),
    )
    for (const group of groups) {
      if ((group.title ?? '') !== record.title || group.color !== record.color)
        continue
      const members = await hashes(
        tabs.filter(
          tab => tab.groupId === group.id && tab.windowId === group.windowId,
        ),
      )
      if (!members.length) continue
      if (members.some(hash => record.members.includes(hash))) overlap = true
      if (JSON.stringify(members) !== JSON.stringify(record.members)) continue
      if (
        Object.entries(records).some(
          ([id, other]) =>
            id !== rule.id &&
            liveRules.has(id) &&
            other.title === record.title &&
            other.color === record.color &&
            JSON.stringify(other.members) === JSON.stringify(members),
        )
      )
        return { ambiguous: true }
      matches.push(group)
    }
    if (matches.length > 1 || (!matches.length && overlap))
      return { ambiguous: true }
    return { group: matches[0] }
  }

  async function prune() {
    if (!storage) return
    await load()
    const ids = new Set(
      getRules()
        .filter(rule => rule.options.keepOpen)
        .map(rule => rule.id),
    )
    const updated = Object.fromEntries(
      Object.entries(records).filter(([id]) => ids.has(id)),
    )
    if (Object.keys(updated).length === Object.keys(records).length) return
    await storage.set({ [KEY]: updated })
    records = updated
  }

  async function appearance(rule: GroupConfiguration) {
    await load()
    const record = records[rule.id]
    return record?.ruleTitle === rule.title.toLocaleLowerCase()
      ? { title: record.title, color: record.color }
      : undefined
  }

  return { remember, find, prune, appearance }
}
