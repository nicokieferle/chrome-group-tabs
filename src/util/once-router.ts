import { generateMatcherRegex } from './matcher-regex'
import type { GroupConfiguration } from './types'

type ChromeApi = Pick<
  typeof chrome,
  'tabs' | 'tabGroups' | 'windows' | 'storage' | 'runtime'
>
type PendingTab = {
  startedAt: number
  initialGroupId: number
  awaitingNavigation?: boolean
}
type GroupBinding = { groupId: number; ruleTitle: string }
const PREFIX = 'group-once:pending:'
const HANDLED_PREFIX = 'group-once:handled:'
const TARGET_PREFIX = 'group-once:target:'
const SESSION_KEY = 'group-once:session'
// Chrome emits onCreated for restored tabs, too, and has no restored flag.
// Protect the startup burst until tab creation has been quiet for three seconds.
const RESTORE_QUIET_MS = 3_000
const SETTLE_MS = 750
const MAX_WAIT_MS = 12_000

/** A new-tab page is a placeholder, not the tab's first destination. */
export function isNewTabPlaceholder(url: string) {
  return (
    !url ||
    /^about:blank(?:[?#]|$)/i.test(url) ||
    /^chrome:\/\/(?:newtab|new-tab-page|new-tab-page-third-party)(?:[/?#]|$)/i.test(
      url,
    )
  )
}

/** First matching rule wins. A title exclusion falls through to the next rule. */
export function matchNewTab(tab: chrome.tabs.Tab, groups: GroupConfiguration[]) {
  const url = tab.pendingUrl || tab.url || ''
  if (isNewTabPlaceholder(url)) return undefined
  const title = (tab.title || '').toLocaleLowerCase()
  return groups.find(group => {
    if (
      group.options.excludedTitles?.some(
        text => text.trim() && title.includes(text.trim().toLocaleLowerCase()),
      )
    )
      return false
    return group.matchers.some(pattern => {
      try {
        return generateMatcherRegex(pattern).test(url)
      } catch {
        return false
      }
    })
  })
}

export function createDefaultGroups(nativeGroups: chrome.tabGroups.TabGroup[]) {
  return ['GPT', 'Default'].map((title, index): GroupConfiguration => {
    const existing = nativeGroups.find(
      group => group.title?.toLocaleLowerCase() === title.toLocaleLowerCase(),
    )
    return {
      id: crypto.randomUUID(),
      title: existing?.title ?? title,
      color: existing?.color ?? (index === 0 ? 'green' : 'grey'),
      matchers:
        index === 0 ? ['https://chatgpt.com/*', 'https://chat.openai.com/*'] : ['*'],
      options: { strict: false, merge: index === 0, excludedTitles: [] },
    }
  })
}

/**
 * Decide once for an ungrouped new tab after its first page settles.
 * Existing or inherited membership always takes precedence over URL rules.
 * Session storage keeps pending decisions alive across service-worker restarts.
 * Delete a pending record BEFORE grouping so later events are inert.
 */
export function registerOnceRouter(
  api: ChromeApi,
  loadConfigurations: () => Promise<() => GroupConfiguration[]>,
) {
  const pending = new Map<number, PendingTab>()
  const handled = new Set<number>()
  // Capture membership synchronously: an assignment may already be awaiting
  // Chrome queries when a user groups (and possibly ungroups) the tab.
  const groupedTabs = new Set<number>()
  const bindings = new Map<string, GroupBinding>()
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let getGroups: () => GroupConfiguration[] = () => []
  let ready: Promise<void>
  let queue = Promise.resolve()
  let groupQueue = Promise.resolve()
  let restoreUntil = 0
  let startupSeen = false
  let startupGeneration = 0
  // Take a baseline before awaiting configuration. On a cold start it protects
  // restored tabs. On a worker wake-up the tab that triggered onCreated can
  // already appear here, so the snapshot alone must not mark it as handled.
  const baseline = api.tabs.query({})

  function withGroupLock<T>(task: () => Promise<T>): Promise<T> {
    const result = groupQueue.then(task)
    groupQueue = result.then(
      () => {},
      () => {},
    )
    return result
  }

  function isProtectedTab(tabId: number, tab: chrome.tabs.Tab) {
    return (
      groupedTabs.has(tabId) ||
      tab.groupId !== -1 ||
      tab.pinned ||
      (tab.splitViewId !== undefined && tab.splitViewId !== -1)
    )
  }

  function enqueue(task: () => Promise<void>) {
    queue = queue
      .then(() => ready)
      .then(task)
      .catch(error => {
        console.error('Could not group new tab:', error)
      })
    return queue
  }

  async function forget(tabId: number) {
    clearTimeout(timers.get(tabId))
    timers.delete(tabId)
    pending.delete(tabId)
    await api.storage.session.remove(PREFIX + tabId)
    handled.add(tabId)
    await api.storage.session.set({ [HANDLED_PREFIX + tabId]: true })
  }

  async function protectStartup(startedAt: number) {
    restoreUntil = Math.max(restoreUntil, startedAt + RESTORE_QUIET_MS)
    await api.storage.session.set({
      [SESSION_KEY]: { restoreUntil },
    })
  }

  async function findTarget(
    rule: GroupConfiguration,
    window: chrome.windows.Window,
    nativeGroups?: chrome.tabGroups.TabGroup[],
  ) {
    const groups = nativeGroups ?? (await api.tabGroups.query({}))
    const bindingKey = `${TARGET_PREFIX}${rule.id}:${window.incognito ? 'private' : 'normal'}`
    const ruleTitle = rule.title.toLocaleLowerCase()
    const binding = bindings.get(bindingKey)
    // A rule owns one destination per privacy context, independent of the
    // source window. Native renames and moves must not switch that destination.
    const bound =
      binding?.ruleTitle === ruleTitle
        ? groups.find(group => group.id === binding.groupId)
        : undefined
    const reserved = new Set(
      [...bindings.entries()]
        .filter(
          ([key]) =>
            key !== bindingKey &&
            key.endsWith(window.incognito ? ':private' : ':normal') &&
            getGroups().some(
              rule =>
                key ===
                `${TARGET_PREFIX}${rule.id}:${window.incognito ? 'private' : 'normal'}`,
            ),
        )
        .map(([, value]) => value.groupId),
    )
    const matches = groups.filter(
      group =>
        group.id !== bound?.id &&
        (group.title ?? '').toLocaleLowerCase() === ruleTitle &&
        (ruleTitle !== '' ||
          (group.color === rule.color && !reserved.has(group.id))),
    )
    const candidates = [
      ...(bound ? [bound] : []),
      ...matches.filter(group => group.color === rule.color),
      ...matches.filter(group => group.color !== rule.color),
    ]
    let target: chrome.tabGroups.TabGroup | undefined
    for (const group of candidates) {
      try {
        const targetWindow = await api.windows.get(group.windowId)
        if (
          targetWindow.type === 'normal' &&
          targetWindow.incognito === window.incognito
        ) {
          target = group
          break
        }
      } catch {
        // A window may close after tabGroups.query; try the remaining groups.
      }
    }
    return target
  }

  async function bindTarget(
    rule: GroupConfiguration,
    group: chrome.tabGroups.TabGroup,
    incognito: boolean,
  ) {
    const key = `${TARGET_PREFIX}${rule.id}:${incognito ? 'private' : 'normal'}`
    const binding = { groupId: group.id, ruleTitle: rule.title.toLocaleLowerCase() }
    bindings.set(key, binding)
    await api.storage.session.set({ [key]: binding })
  }

  async function assign(
    tabId: number,
    rule: GroupConfiguration,
    expected: chrome.tabs.Tab,
  ) {
    const generation = startupGeneration
    let tab = await api.tabs.get(tabId)
    if (
      isProtectedTab(tabId, tab) ||
      expected.groupId !== -1 ||
      tab.windowId !== expected.windowId
    )
      return
    const window = await api.windows.get(tab.windowId)
    if (window.type !== 'normal') return
    const target = await findTarget(rule, window)
    if (target && generation === startupGeneration && Date.now() > restoreUntil) {
      await bindTarget(rule, target, window.incognito)
    }
    // Respect a manual move/pin while the asynchronous queries were running.
    const latest = await api.tabs.get(tabId)
    if (
      isProtectedTab(tabId, latest) ||
      generation !== startupGeneration ||
      Date.now() <= restoreUntil ||
      latest.windowId !== tab.windowId
    )
      return
    tab = latest
    if (target) {
      if (tab.groupId === target.id) return
      if (target.windowId !== tab.windowId) {
        // Staying in the source window must not create a second destination.
        if (!rule.options.merge) return
        await api.tabs.move(tabId, { windowId: target.windowId, index: -1 })
        const moved = await api.tabs.get(tabId)
        if (
          isProtectedTab(tabId, moved) ||
          moved.windowId !== target.windowId ||
          generation !== startupGeneration ||
          Date.now() <= restoreUntil
        )
          return
      }
      await api.tabs.group({ tabIds: [tabId], groupId: target.id })
      if (tab.active && target.windowId !== tab.windowId) {
        await api.tabs.update(tabId, { active: true })
        await api.windows.update(target.windowId, { focused: true })
      }
    } else {
      const id = await api.tabs.group({
        tabIds: [tabId],
        createProperties: { windowId: tab.windowId },
      })
      await api.tabGroups.update(id, { title: rule.title, color: rule.color })
      await bindTarget(rule, { id } as chrome.tabGroups.TabGroup, window.incognito)
    }
  }

  async function decide(tabId: number) {
    const record = pending.get(tabId)
    if (!record) return
    let tab: chrome.tabs.Tab
    try {
      tab = await api.tabs.get(tabId)
    } catch {
      await forget(tabId)
      return
    }
    await forget(tabId)
    if (
      record.startedAt <= restoreUntil ||
      record.initialGroupId !== -1 ||
      isProtectedTab(tabId, tab)
    )
      return
    const rule = matchNewTab(tab, getGroups())
    if (rule) await withGroupLock(() => assign(tabId, rule, tab))
  }

  async function schedule(tabId: number) {
    const record = pending.get(tabId)
    if (!record) return
    let tab: chrome.tabs.Tab
    try {
      tab = await api.tabs.get(tabId)
    } catch {
      await forget(tabId)
      return
    }
    // Also cancel old pending records which accepted an inherited group.
    if (record.initialGroupId !== -1 || isProtectedTab(tabId, tab)) {
      await forget(tabId)
      return
    }
    clearTimeout(timers.get(tabId))
    timers.delete(tabId)
    if (isNewTabPlaceholder(tab.pendingUrl || tab.url || '')) {
      if (!record.awaitingNavigation) {
        record.awaitingNavigation = true
        await api.storage.session.set({ [PREFIX + tabId]: record })
      }
      return
    }
    if (record.awaitingNavigation) {
      record.startedAt = Date.now()
      delete record.awaitingNavigation
      await api.storage.session.set({ [PREFIX + tabId]: record })
    }
    const remaining = Math.max(0, MAX_WAIT_MS - (Date.now() - record.startedAt))
    const delay =
      tab.status === 'complete' ? Math.min(SETTLE_MS, remaining) : remaining
    timers.set(
      tabId,
      setTimeout(() => {
        void enqueue(() => decide(tabId))
      }, delay),
    )
  }

  const onCreated = (tab: chrome.tabs.Tab) => {
    if (tab.id === undefined) return
    const tabId = tab.id
    if (tab.groupId !== -1) groupedTabs.add(tabId)
    const record = { startedAt: Date.now(), initialGroupId: tab.groupId }
    void enqueue(async () => {
      if (handled.has(tabId)) return
      if (record.startedAt <= restoreUntil) {
        await protectStartup(record.startedAt)
        await forget(tabId)
        return
      }
      // Lazy session restoration can happen after the initial startup burst.
      const anchorBase = api.runtime.getURL?.('group-anchor.html')
      const ownAnchor =
        anchorBase && (tab.pendingUrl || tab.url || '').split('?')[0] === anchorBase
      if (
        ownAnchor ||
        tab.groupId !== -1 ||
        tab.discarded ||
        tab.status === 'unloaded'
      ) {
        await forget(tabId)
        return
      }
      pending.set(tabId, record)
      await api.storage.session.set({ [PREFIX + tabId]: record })
      await schedule(tabId)
    })
  }
  const onUpdated = (tabId: number, changes: chrome.tabs.OnUpdatedInfo) => {
    if (changes.groupId !== undefined && changes.groupId !== -1)
      groupedTabs.add(tabId)
    void enqueue(async () => {
      if (!pending.has(tabId)) return
      if (changes.groupId !== undefined) {
        if (changes.groupId !== -1) await forget(tabId)
        else await schedule(tabId)
        return
      }
      if (changes.pinned === true) {
        await forget(tabId)
        return
      }
      if (
        changes.url !== undefined ||
        changes.title !== undefined ||
        changes.status !== undefined
      ) {
        await schedule(tabId)
      }
    })
  }
  const onRemoved = (tabId: number) => {
    groupedTabs.delete(tabId)
    void enqueue(async () => {
      await forget(tabId)
      handled.delete(tabId)
      await api.storage.session.remove(HANDLED_PREFIX + tabId)
    })
  }
  const onDetached = (tabId: number) => {
    void enqueue(() => forget(tabId))
  }
  const onStartup = () => {
    // Set the barrier synchronously: tab events may precede or follow this
    // event, and the configuration loader may still be running.
    startupSeen = true
    startupGeneration++
    const bindingKeys = [...bindings.keys()]
    bindings.clear()
    restoreUntil = Date.now() + RESTORE_QUIET_MS
    void enqueue(async () => {
      await protectStartup(Date.now())
      for (const key of bindingKeys) await api.storage.session.remove(key)
      for (const tabId of pending.keys()) await forget(tabId)
    })
  }
  api.tabs.onCreated.addListener(onCreated)
  api.tabs.onUpdated.addListener(onUpdated)
  api.tabs.onRemoved.addListener(onRemoved)
  api.tabs.onDetached.addListener(onDetached)
  api.runtime.onStartup.addListener(onStartup)

  ready = (async () => {
    getGroups = await loadConfigurations()
    const stored = await api.storage.session.get(null)
    const session = stored[SESSION_KEY]
    const savedRestoreUntil =
      session &&
      typeof session === 'object' &&
      'restoreUntil' in session &&
      typeof session.restoreUntil === 'number' &&
      Number.isFinite(session.restoreUntil)
        ? session.restoreUntil
        : undefined
    const hasSession = savedRestoreUntil !== undefined
    if (hasSession && !startupSeen) {
      restoreUntil = savedRestoreUntil
    } else {
      // Session storage is cleared on a full browser restart/extension reload,
      // unlike an MV3 worker wake-up. Never reuse old numeric IDs across boots.
      await protectStartup(Date.now())
    }
    const existing = await baseline
    const liveIds = new Set(existing.map(tab => tab.id))
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith(TARGET_PREFIX)) {
        if (
          hasSession &&
          !startupSeen &&
          value &&
          typeof value === 'object' &&
          'groupId' in value &&
          Number.isInteger(value.groupId) &&
          'ruleTitle' in value &&
          typeof value.ruleTitle === 'string' &&
          getGroups().some(
            rule =>
              key === `${TARGET_PREFIX}${rule.id}:normal` ||
              key === `${TARGET_PREFIX}${rule.id}:private`,
          )
        ) {
          bindings.set(key, value as GroupBinding)
        } else await api.storage.session.remove(key)
        continue
      }
      if (key.startsWith(HANDLED_PREFIX)) {
        const tabId = Number(key.slice(HANDLED_PREFIX.length))
        if (Number.isInteger(tabId) && liveIds.has(tabId)) handled.add(tabId)
        else await api.storage.session.remove(key)
        continue
      }
      if (!key.startsWith(PREFIX)) continue
      const tabId = Number(key.slice(PREFIX.length))
      if (
        !Number.isInteger(tabId) ||
        !value ||
        typeof value !== 'object' ||
        !('startedAt' in value) ||
        typeof value.startedAt !== 'number' ||
        !('initialGroupId' in value) ||
        typeof value.initialGroupId !== 'number'
      )
        continue
      if (!hasSession || startupSeen || !liveIds.has(tabId)) {
        await api.storage.session.remove(key)
        continue
      }
      pending.set(tabId, value as PendingTab)
      await schedule(tabId)
    }
    const retained: Record<string, boolean> = {}
    if (!hasSession || startupSeen) {
      for (const tab of existing) {
        if (tab.id !== undefined && !pending.has(tab.id) && !handled.has(tab.id)) {
          handled.add(tab.id)
          retained[HANDLED_PREFIX + tab.id] = true
        }
      }
    }
    if (Object.keys(retained).length) await api.storage.session.set(retained)
  })()

  return {
    ready,
    findTarget,
    bindTarget,
    startupDelay: () => Math.max(0, restoreUntil - Date.now() + 1),
    withGroupLock,
    // Disposal retains session records, just as service-worker sleep does.
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer)
      api.tabs.onCreated.removeListener(onCreated)
      api.tabs.onUpdated.removeListener(onUpdated)
      api.tabs.onRemoved.removeListener(onRemoved)
      api.tabs.onDetached.removeListener(onDetached)
      api.runtime.onStartup.removeListener(onStartup)
    },
    idle: () => queue,
  }
}
