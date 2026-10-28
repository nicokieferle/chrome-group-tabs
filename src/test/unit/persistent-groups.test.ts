import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { registerOnceRouter } from '@/util/once-router'
import { anchorRuleId, registerPersistentGroups } from '@/util/persistent-groups'
import { newManualGroup, toRules } from '@/util/once-settings'
import type { GroupConfiguration } from '@/util/types'

function event() {
  const listeners = new Set<(...args: any[]) => void>()
  return {
    addListener: (fn: (...args: any[]) => void) => listeners.add(fn),
    removeListener: (fn: (...args: any[]) => void) => listeners.delete(fn),
    emit: (...args: any[]) => {
      for (const fn of listeners) fn(...args)
    },
  }
}

function harness(config = toRules([newManualGroup()])) {
  let rules = config
  const tabs = new Map<number, chrome.tabs.Tab>()
  const groups: chrome.tabGroups.TabGroup[] = []
  const windows = [
    { id: 1, type: 'normal', incognito: false, focused: true },
    { id: 2, type: 'normal', incognito: false },
    { id: 3, type: 'normal', incognito: true },
  ]
  const stored: Record<string, unknown> = {
    'group-once:session': { restoreUntil: 0 },
  }
  let nextTab = 10,
    nextGroup = 100
  const api = {
    runtime: {
      getURL: (path: string) => `chrome-extension://once/${path}`,
      onStartup: event(),
    },
    tabs: {
      onCreated: event(),
      onRemoved: event(),
      onUpdated: event(),
      onDetached: event(),
      onAttached: event(),
      query: vi.fn(async () => [...tabs.values()].map(tab => ({ ...tab }))),
      get: vi.fn(async (id: number) => {
        if (!tabs.has(id)) throw new Error('Closed tab')
        return { ...tabs.get(id)! }
      }),
      create: vi.fn(async (info: any) => {
        const tab = put(nextTab++, {
          ...info,
          incognito: windows.find(window => window.id === info.windowId)!.incognito,
        })
        api.tabs.onCreated.emit({ ...tab })
        return { ...tab }
      }),
      group: vi.fn(async (info: any) => {
        const id = info.groupId ?? nextGroup++
        if (info.groupId === undefined)
          groups.push({
            id,
            windowId: info.createProperties.windowId,
            title: '',
            color: 'grey',
            collapsed: false,
            shared: false,
          })
        for (const tabId of info.tabIds) update(tabId, { groupId: id })
        return id
      }),
      remove: vi.fn(async (id: number) => {
        const groupId = tabs.get(id)?.groupId
        const windowId = tabs.get(id)?.windowId
        tabs.delete(id)
        if (
          groupId !== undefined &&
          ![...tabs.values()].some(tab => tab.groupId === groupId)
        ) {
          const index = groups.findIndex(group => group.id === groupId)
          if (index >= 0) api.tabGroups.onRemoved.emit(groups.splice(index, 1)[0])
        }
        api.tabs.onRemoved.emit(id, { windowId, isWindowClosing: false })
      }),
      move: vi.fn(async (id: number, info: any) => {
        Object.assign(tabs.get(id)!, info)
        api.tabs.onDetached.emit(id)
      }),
      update: vi.fn(async (id: number, info: any) => {
        update(id, info)
        return { ...tabs.get(id)! }
      }),
    },
    tabGroups: {
      query: vi.fn(async () => groups.map(group => ({ ...group }))),
      update: vi.fn(async (id: number, info: any) =>
        Object.assign(groups.find(group => group.id === id)!, info),
      ),
      onRemoved: event(),
    },
    windows: {
      get: vi.fn(async (id: number) => {
        const window = windows.find(window => window.id === id)
        if (!window) throw new Error('Closed window')
        return { ...window }
      }),
      getAll: vi.fn(async () => windows.map(window => ({ ...window }))),
      update: vi.fn(async () => {}),
      onCreated: event(),
      onRemoved: event(),
    },
    storage: {
      session: {
        get: vi.fn(async () => ({ ...stored })),
        set: vi.fn(async (data: any) => {
          Object.assign(stored, data)
        }),
        remove: vi.fn(async (key: string) => {
          delete stored[key]
        }),
      },
    },
  }
  function put(id: number, info: Partial<chrome.tabs.Tab> = {}) {
    const tab = {
      id,
      windowId: 1,
      groupId: -1,
      url: 'https://example.com/',
      incognito: false,
      status: 'complete',
      pinned: false,
      active: false,
      ...info,
    } as chrome.tabs.Tab
    tabs.set(id, tab)
    return tab
  }
  function update(id: number, info: Partial<chrome.tabs.Tab>) {
    Object.assign(tabs.get(id)!, info)
    api.tabs.onUpdated.emit(id, info, { ...tabs.get(id)! })
  }
  const routers: ReturnType<typeof registerOnceRouter>[] = []
  const managers: ReturnType<typeof registerPersistentGroups>[] = []
  function start() {
    const router = registerOnceRouter(
      api as unknown as Parameters<typeof registerOnceRouter>[0],
      async () => () => rules,
    )
    const manager = registerPersistentGroups(
      api as unknown as Parameters<typeof registerPersistentGroups>[0],
      () => rules,
      router,
    )
    routers.push(router)
    managers.push(manager)
    return { router, manager }
  }
  return {
    api,
    tabs,
    groups,
    windows,
    stored,
    put,
    update,
    start,
    routers,
    managers,
    rules,
    setRules: (next: GroupConfiguration[]) => {
      rules = next
    },
  }
}

let current: ReturnType<typeof harness> | undefined
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  current?.managers.forEach(manager => manager.dispose())
  current?.routers.forEach(router => router.dispose())
  current = undefined
  vi.useRealTimers()
})

it('creates one unnamed manual group and reuses it across extra windows and repeated reconciliation', async () => {
  current = harness()
  const { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  await manager.reconcile()
  current.api.windows.onCreated.emit({ id: 2 })
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]).toMatchObject({ title: '', color: 'blue', windowId: 1 })
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  expect(current.api.tabs.group).toHaveBeenCalledTimes(1)
  expect([...current.tabs.values()][0]!.url).toContain(
    `group=${current.rules[0]!.id}`,
  )
})

it('replaces a closed anchor and retains existing user tabs and the native group ID', async () => {
  current = harness()
  const { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  const groupId = current.groups[0]!.id
  const anchor = [...current.tabs.keys()][0]!
  current.put(50, { groupId, url: 'https://chatgpt.com/c/coding' })
  await current.api.tabs.remove(anchor)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  await router.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]!.id).toBe(groupId)
  expect(current.tabs.get(50)).toMatchObject({
    groupId,
    url: 'https://chatgpt.com/c/coding',
  })
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
})

it('restores distinct unnamed groups by their own anchor IDs after cold startup changes numeric IDs', async () => {
  const manual = newManualGroup()
  current = harness(toRules([manual, { ...manual, id: crypto.randomUUID() }]))
  let { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  expect(current.groups).toHaveLength(2)
  manager.dispose()
  router.dispose()
  for (const group of current.groups) {
    const oldId = group.id
    group.id += 200
    group.title = 'Manuell umbenannt'
    for (const tab of current.tabs.values())
      if (tab.groupId === oldId) tab.groupId = group.id
  }
  for (const key of Object.keys(current.stored)) delete current.stored[key]
  ;({ manager, router } = current.start())
  await router.ready
  await vi.advanceTimersByTimeAsync(4_000)
  await manager.idle()
  await manager.reconcile()
  expect(current.groups).toHaveLength(2)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
  expect(current.groups.every(group => group.title === 'Manuell umbenannt')).toBe(
    true,
  )
})

it('opens a nonpersistent manual group only on request and stops reopening after keepOpen is disabled', async () => {
  const manual = newManualGroup()
  manual.keepOpen = false
  current = harness(toRules([manual]))
  const { manager, router } = current.start()
  await manager.reconcile()
  expect(current.groups).toHaveLength(0)
  await manager.open(manual.id, 2)
  await router.idle()
  await manager.open(manual.id, 1)
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]!.windowId).toBe(2)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  await current.api.tabs.remove([...current.tabs.keys()][0]!)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.groups).toHaveLength(0)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
})

it('keeps incognito destinations separate without copying groups into each regular window', async () => {
  current = harness()
  const { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  await manager.open(current.rules[0]!.id, 3)
  await router.idle()
  await manager.open(current.rules[0]!.id, 2)
  await manager.reconcile()
  expect(current.groups).toHaveLength(2)
  expect(current.groups.map(group => group.windowId).sort((a, b) => a - b)).toEqual([
    1, 3,
  ])
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
})

it('does not create group copies while browser restoration or anchor attachment is pending', async () => {
  current = harness()
  delete current.stored['group-once:session']
  const { manager, router } = current.start()
  await router.ready
  await manager.reconcile()
  expect(current.groups).toHaveLength(0)
  const anchor = current.put(60, {
    url: current.api.runtime.getURL(
      `group-anchor.html?group=${current.rules[0]!.id}`,
    ),
    status: 'unloaded',
    discarded: true,
  })
  current.api.tabs.onCreated.emit(anchor)
  await router.idle()
  await vi.advanceTimersByTimeAsync(4_000)
  await manager.idle()
  expect(current.api.tabs.create).not.toHaveBeenCalled()
  current.groups.push({
    id: 70,
    windowId: 1,
    title: '',
    color: 'blue',
    collapsed: true,
    shared: false,
  })
  current.update(60, { groupId: 70, status: 'complete', discarded: false })
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.api.tabs.create).not.toHaveBeenCalled()
})

it('never lets a catch-all rule capture a persistent anchor while its native group is being created', async () => {
  const auto = {
    ...newManualGroup(),
    automatic: true,
    patterns: '*',
    title: 'Default',
    keepOpen: false,
  }
  current = harness(toRules([auto, newManualGroup()]))
  const { manager, router } = current.start()
  let release!: () => void
  const original = current.api.tabs.group.getMockImplementation()!
  current.api.tabs.group.mockImplementationOnce(async info => {
    await new Promise<void>(done => {
      release = done
    })
    return original(info)
  })
  const reconcile = manager.reconcile()
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  await router.idle()
  await vi.advanceTimersByTimeAsync(1_000)
  await router.idle()
  expect(current.groups).toHaveLength(0)
  expect(current.api.tabs.group).toHaveBeenCalledTimes(1)
  release()
  await reconcile
  await router.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]!.title).toBe('')
})

it('treats manual-only groups as having no automatic URL matches', async () => {
  current = harness()
  const { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  const created = current.put(80, { url: 'https://chatgpt.com/' })
  current.api.tabs.onCreated.emit(created)
  await router.idle()
  await vi.advanceTimersByTimeAsync(800)
  await router.idle()
  expect(current.tabs.get(80)!.groupId).toBe(-1)
})

it('checks anchor URLs against the exact extension page and not foreign URLs', () => {
  const base = 'chrome-extension://once/group-anchor.html'
  expect(anchorRuleId(`${base}?group=abc`, base)).toBe('abc')
  expect(
    anchorRuleId('https://example.com/group-anchor.html?group=abc', base),
  ).toBeNull()
  expect(
    anchorRuleId('chrome-extension://other/group-anchor.html?group=abc', base),
  ).toBeNull()
})

it('serializes automatic routing and persistent creation so simultaneous work cannot duplicate a group', async () => {
  const draft = {
    ...newManualGroup(),
    automatic: true,
    patterns: 'https://chatgpt.com/*',
    merge: true,
  }
  current = harness(toRules([draft]))
  const { manager, router } = current.start()
  let release!: () => void
  const original = current.api.tabs.group.getMockImplementation()!
  current.api.tabs.group.mockImplementationOnce(async info => {
    await new Promise<void>(done => {
      release = done
    })
    return original(info)
  })
  const reconcile = manager.reconcile()
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  current.api.tabs.onCreated.emit(current.put(90, { url: 'https://chatgpt.com/' }))
  await vi.advanceTimersByTimeAsync(800)
  release()
  await reconcile
  await router.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.tabs.get(90)!.groupId).toBe(current.groups[0]!.id)
})

it('turning keepOpen off leaves user tabs intact and permits the anchor to close normally', async () => {
  current = harness()
  const { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  const anchor = [...current.tabs.keys()][0]!
  const groupId = current.groups[0]!.id
  current.put(91, { groupId, url: 'https://chatgpt.com/c/coding' })
  current.setRules(
    current.rules.map(rule => ({
      ...rule,
      options: { ...rule.options, keepOpen: false },
    })),
  )
  manager.refresh()
  await current.api.tabs.remove(anchor)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  expect(current.tabs.get(91)!.groupId).toBe(groupId)
})

it('reopens a persistent group after its last anchor tab is closed without copying user pages', async () => {
  current = harness()
  const { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  const anchor = [...current.tabs.keys()][0]!
  await current.api.tabs.remove(anchor)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  await router.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.tabs.size).toBe(1)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
  expect([...current.tabs.values()][0]!.url).toContain('group-anchor.html?group=')
})

it('follows a persistent group moved to another window without reopening it in the original window', async () => {
  current = harness()
  const { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  const anchor = [...current.tabs.keys()][0]!
  current.groups[0]!.id = 500
  current.groups[0]!.windowId = 2
  current.update(anchor, { groupId: 500, windowId: 2 })
  current.api.tabs.onAttached.emit(anchor)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  await manager.open(current.rules[0]!.id, 1)
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]).toMatchObject({ id: 500, windowId: 2 })
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
})

it('does not close a user page if anchor creation fails after the user navigated that tab', async () => {
  current = harness()
  const { manager } = current.start()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  current.api.tabs.group.mockImplementationOnce(async info => {
    current!.update(info.tabIds[0], { url: 'https://chatgpt.com/c/keep-me' })
    throw new Error('Group operation failed')
  })
  try {
    await expect(manager.reconcile()).rejects.toThrow('Group operation failed')
    expect(current.api.tabs.remove).not.toHaveBeenCalled()
    expect([...current.tabs.values()][0]!.url).toBe('https://chatgpt.com/c/keep-me')
  } finally {
    log.mockRestore()
  }
})
