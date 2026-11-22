import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { registerOnceRouter } from '@/util/once-router'
import { anchorRuleId } from '@/util/group-anchor'
import { registerPersistentGroups } from '@/util/persistent-groups'
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
  const localStored: Record<string, unknown> = {}
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
        // Chrome validates this optional position before creating a tab.
        if (
          info.index !== undefined &&
          (!Number.isInteger(info.index) || info.index < 0)
        )
          throw new TypeError('tabs.create: index must be an integer at least 0')
        const tab = put(nextTab++, {
          ...info,
          incognito: windows.find(window => window.id === info.windowId)!.incognito,
        })
        api.tabs.onCreated.emit({ ...tab })
        return { ...tab }
      }),
      group: vi.fn(async (info: any) => {
        const id = info.groupId ?? nextGroup++
        const previousGroups = new Set<number>(
          info.tabIds.map((tabId: number) => tabs.get(tabId)?.groupId ?? -1),
        )
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
        for (const previous of previousGroups) {
          if (
            previous === id ||
            [...tabs.values()].some(tab => tab.groupId === previous)
          )
            continue
          const index = groups.findIndex(group => group.id === previous)
          if (index >= 0) api.tabGroups.onRemoved.emit(groups.splice(index, 1)[0])
        }
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
      onCreated: event(),
      onRemoved: event(),
      onUpdated: event(),
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
      local: {
        get: vi.fn(async () => structuredClone(localStored)),
        set: vi.fn(async (data: any) => {
          Object.assign(localStored, structuredClone(data))
        }),
      },
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
  function addGroup(id: number, info: Partial<chrome.tabGroups.TabGroup> = {}) {
    const group = {
      id,
      windowId: 1,
      title: '',
      color: 'blue',
      collapsed: false,
      shared: false,
      ...info,
    } as chrome.tabGroups.TabGroup
    groups.push(group)
    return group
  }
  function update(id: number, info: Partial<chrome.tabs.Tab>) {
    Object.assign(tabs.get(id)!, info)
    api.tabs.onUpdated.emit(id, info, { ...tabs.get(id)! })
  }
  function closeWindow(id: number, windowFirst = false) {
    const removeWindow = () => {
      windows.splice(
        windows.findIndex(window => window.id === id),
        1,
      )
      api.windows.onRemoved.emit(id)
    }
    if (windowFirst) removeWindow()
    for (const tab of [...tabs.values()].filter(tab => tab.windowId === id)) {
      tabs.delete(tab.id!)
      api.tabs.onRemoved.emit(tab.id, { windowId: id, isWindowClosing: true })
    }
    for (const group of [...groups].filter(group => group.windowId === id)) {
      groups.splice(groups.indexOf(group), 1)
      api.tabGroups.onRemoved.emit(group)
    }
    if (!windowFirst) removeWindow()
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
    localStored,
    put,
    addGroup,
    update,
    closeWindow,
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

it('does not replace a closed placeholder while user tabs keep the group open', async () => {
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
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
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

it('recognizes three differently colored groups including collapsed white without creating placeholders', async () => {
  const drafts = [
    { ...newManualGroup(), color: 'grey' as const, title: 'Weiß' },
    { ...newManualGroup(), color: 'blue' as const, title: 'Coding' },
    { ...newManualGroup(), color: 'green' as const, title: 'GPT' },
  ]
  current = harness(toRules(drafts))
  drafts.forEach((draft, index) => {
    current!.addGroup(71 + index, {
      color: draft.color,
      title: '',
      collapsed: index === 0,
    })
    current!.put(81 + index, {
      groupId: 71 + index,
      url: `https://example.com/${index}`,
    })
  })
  const { manager } = current.start()
  await manager.reconcile()
  await manager.reconcile()
  expect(current.groups.map(group => group.id)).toEqual([71, 72, 73])
  expect(current.groups[0]).toMatchObject({
    collapsed: true,
    title: '',
    color: 'grey',
  })
  expect(current.api.tabs.create).not.toHaveBeenCalled()
  expect(current.api.tabs.group).not.toHaveBeenCalled()
  await current.api.tabs.remove(81)
  await manager.reconcile()
  expect(current.groups).toHaveLength(3)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  expect(current.groups.find(group => group.color === 'grey')).toMatchObject({
    windowId: 1,
    title: '',
  })
})

it.each([false, true])(
  'merges a duplicate white placeholder into the existing populated group, collapsed=%s',
  async collapsed => {
    current = harness(
      toRules([{ ...newManualGroup(), title: 'Weiß', color: 'grey' }]),
    )
    const { manager, router } = current.start()
    await manager.reconcile()
    const anchor = [...current.tabs.values()][0]!
    current.addGroup(71, { color: 'grey', title: 'Meine weißen Tabs', collapsed })
    current.put(80, { groupId: 71, url: 'https://example.com/keep' })
    if (collapsed) {
      const group = current.api.tabs.group.getMockImplementation()!
      current.api.tabs.group.mockImplementationOnce(async info => {
        const id = await group(info)
        current!.groups.find(group => group.id === id)!.collapsed = false
        return id
      })
    }
    await manager.reconcile()
    await manager.reconcile()
    expect(current.groups).toEqual([
      {
        id: 71,
        windowId: 1,
        color: 'grey',
        title: 'Meine weißen Tabs',
        collapsed,
        shared: false,
      },
    ])
    expect([...current.tabs.values()]).toMatchObject([
      { id: 80, groupId: 71, url: 'https://example.com/keep' },
    ])
    expect(current.tabs.has(anchor.id!)).toBe(false)
    expect(current.api.tabs.remove).toHaveBeenCalledWith(anchor.id!)
    expect(current.api.tabs.remove).not.toHaveBeenCalledWith(80)
    expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
    expect(
      current.stored[`group-once:target:${current.rules[0]!.id}:normal`],
    ).toMatchObject({ groupId: 71 })
    manager.dispose()
    router.dispose()
    const restarted = current.start()
    await restarted.manager.reconcile()
    expect(current.groups).toHaveLength(1)
    expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  },
)

it('combines populated groups of one unique color without losing or duplicating user tabs', async () => {
  current = harness(toRules([{ ...newManualGroup(), title: 'Weiß', color: 'grey' }]))
  current.addGroup(71, { color: 'grey', title: 'Vorhanden', collapsed: true })
  current.addGroup(72, { color: 'grey', title: 'Kopie' })
  current.put(80, { groupId: 71, url: 'https://example.com/first' })
  current.put(81, { groupId: 72, url: 'https://example.com/second' })
  const { manager } = current.start()
  await manager.reconcile()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]).toMatchObject({
    id: 71,
    title: 'Vorhanden',
    collapsed: true,
  })
  expect(current.tabs.get(80)).toMatchObject({
    groupId: 71,
    url: 'https://example.com/first',
  })
  expect(current.tabs.get(81)).toMatchObject({
    groupId: 71,
    url: 'https://example.com/second',
  })
  expect(current.api.tabs.group).toHaveBeenCalledWith({ tabIds: [81], groupId: 71 })
  expect(current.api.tabs.remove).not.toHaveBeenCalled()
  expect(current.api.tabs.create).not.toHaveBeenCalled()
  expect(current.api.tabs.move).not.toHaveBeenCalled()
})

it('retains just one placeholder after merging empty copies of the same configured group', async () => {
  current = harness()
  const rule = current.rules[0]!
  const url = current.api.runtime.getURL(`group-anchor.html?group=${rule.id}`)
  for (const id of [71, 72]) {
    current.addGroup(id)
    current.put(id, { groupId: id, url })
  }
  const { manager } = current.start()
  await manager.reconcile()
  await manager.reconcile()
  expect(current.groups).toHaveLength(1)
  expect(current.tabs.size).toBe(1)
  expect([...current.tabs.values()][0]).toMatchObject({ id: 71, groupId: 71, url })
  expect(current.api.tabs.create).not.toHaveBeenCalled()
})

it('never merges or adopts the same color from a different window after its owner closes', async () => {
  current = harness()
  const { manager } = current.start()
  await manager.reconcile()
  current.addGroup(71, { windowId: 2, collapsed: true })
  current.put(80, { groupId: 71, windowId: 2 })
  await manager.reconcile()
  expect(current.groups).toHaveLength(2)
  expect(current.tabs.get(80)).toMatchObject({ groupId: 71, windowId: 2 })
  current.closeWindow(1)
  await manager.reconcile()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]!.id).toBe(71)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  expect(current.api.tabs.group).toHaveBeenCalledTimes(1)
  expect(
    current.stored[`group-once:target:${current.rules[0]!.id}:normal`],
  ).toMatchObject({ windowId: 1 })
})

it('keeps a group belonging to another configured rule separate even after native recoloring', async () => {
  const drafts = [newManualGroup(), { ...newManualGroup(), color: 'green' as const }]
  current = harness(toRules(drafts))
  const { manager } = current.start()
  await manager.reconcile()
  const second = current.groups[1]!
  second.color = 'blue'
  current.put(80, { groupId: second.id, url: 'https://example.com/other-rule' })
  await manager.reconcile()
  expect(current.groups).toHaveLength(2)
  expect(current.tabs.get(80)?.groupId).toBe(second.id)
  expect(current.api.tabs.group).toHaveBeenCalledTimes(2)
})

it('does not merge if a group changes color during the final tab checks', async () => {
  current = harness()
  const { manager } = current.start()
  await manager.reconcile()
  const old = current.groups[0]!
  current.addGroup(71)
  current.put(80, { groupId: 71 })
  const get = current.api.tabs.get.getMockImplementation()!
  current.api.tabs.get.mockImplementationOnce(async id => {
    old.color = 'red'
    current!.api.tabGroups.onUpdated.emit({ ...old })
    return get(id)
  })
  await manager.reconcile()
  expect(current.groups).toHaveLength(2)
  expect(current.api.tabs.group).toHaveBeenCalledTimes(1)
  expect(current.api.tabs.remove).not.toHaveBeenCalled()
})

it('merges same-color private groups only inside the explicitly opened private window', async () => {
  current = harness()
  const { manager } = current.start()
  await manager.reconcile()
  await manager.open(current.rules[0]!.id, 3)
  current.addGroup(71, { windowId: 3 })
  current.put(80, { windowId: 3, incognito: true, groupId: 71 })
  await manager.reconcile()
  expect(current.groups).toHaveLength(2)
  expect(current.groups.map(group => group.windowId).sort((a, b) => a - b)).toEqual([
    1, 3,
  ])
  expect(current.tabs.get(80)).toMatchObject({ windowId: 3, groupId: 71 })
  expect(current.api.storage.local.set).not.toHaveBeenCalled()
  expect(current.api.tabs.move).not.toHaveBeenCalled()
})

it('requires explicit Open before adopting a named color match in a surviving window', async () => {
  current = harness(toRules([{ ...newManualGroup(), title: 'Weiß', color: 'grey' }]))
  const { manager } = current.start()
  await manager.reconcile()
  current.addGroup(71, {
    windowId: 2,
    title: 'Weiß',
    color: 'grey',
    collapsed: true,
  })
  current.put(80, { groupId: 71, windowId: 2 })
  current.closeWindow(1)
  await manager.reconcile()
  expect(
    current.stored[`group-once:target:${current.rules[0]!.id}:normal`],
  ).toMatchObject({ windowId: 1 })
  await manager.open(current.rules[0]!.id, 2)
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]!.id).toBe(71)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  expect(
    current.stored[`group-once:target:${current.rules[0]!.id}:normal`],
  ).toMatchObject({ windowId: 2 })
})

it('does not move a page that changes windows during the final merge checks', async () => {
  current = harness()
  current.addGroup(71)
  current.addGroup(72)
  current.put(80, { groupId: 71 })
  current.put(81, { groupId: 72 })
  const { manager } = current.start()
  const get = current.api.tabs.get.getMockImplementation()!
  current.api.tabs.get.mockImplementationOnce(async id => {
    current!.addGroup(73, { windowId: 2 })
    current!.update(id, { groupId: 73, windowId: 2 })
    return get(id)
  })
  await manager.reconcile()
  expect(current.tabs.get(81)).toMatchObject({ groupId: 73, windowId: 2 })
  expect(current.api.tabs.group).not.toHaveBeenCalled()
  expect(current.api.tabs.create).not.toHaveBeenCalled()
  expect(current.api.tabs.remove).not.toHaveBeenCalled()
})

it('does not merge after a configuration edit makes the color ambiguous', async () => {
  current = harness()
  current.addGroup(71)
  current.addGroup(72)
  current.put(80, { groupId: 71 })
  current.put(81, { groupId: 72 })
  const { manager } = current.start()
  const get = current.api.tabs.get.getMockImplementation()!
  current.api.tabs.get.mockImplementationOnce(async id => {
    current!.setRules([...current!.rules, ...toRules([newManualGroup()])])
    return get(id)
  })
  await manager.reconcile()
  expect(current.groups).toHaveLength(2)
  expect(current.api.tabs.group).not.toHaveBeenCalled()
  expect(current.api.tabs.remove).not.toHaveBeenCalled()
})

it('retains split views rather than moving their tabs during color consolidation', async () => {
  current = harness()
  current.addGroup(71)
  current.addGroup(72)
  current.put(80, { groupId: 71 })
  current.put(81, { groupId: 72, splitViewId: 1 })
  const { manager } = current.start()
  await manager.reconcile()
  expect(current.tabs.get(81)).toMatchObject({ groupId: 72, splitViewId: 1 })
  expect(current.api.tabs.group).not.toHaveBeenCalled()
  expect(current.api.tabs.create).not.toHaveBeenCalled()
})

it('retries a failed color merge without closing pages or creating another placeholder', async () => {
  current = harness()
  const { manager } = current.start()
  await manager.reconcile()
  const anchor = [...current.tabs.keys()][0]!
  current.addGroup(71)
  current.put(80, { groupId: 71 })
  current.api.tabs.group.mockRejectedValueOnce(new Error('Group is busy'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await manager.reconcile()
    expect(current.groups).toHaveLength(2)
    expect(current.tabs.has(anchor)).toBe(true)
    expect(current.tabs.has(80)).toBe(true)
    expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5_500)
    await manager.idle()
    expect(current.groups).toHaveLength(1)
    expect([...current.tabs.keys()]).toEqual([80])
    expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  } finally {
    log.mockRestore()
  }
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
    await expect(manager.open(current.rules[0]!.id, 1)).rejects.toThrow(
      'Group operation failed',
    )
    expect(current.api.tabs.remove).not.toHaveBeenCalled()
    expect([...current.tabs.values()][0]!.url).toBe('https://chatgpt.com/c/keep-me')
  } finally {
    log.mockRestore()
  }
})

it('repairs an ungrouped, loaded start tab in its own window after restore', async () => {
  current = harness()
  const { manager, router } = current.start()
  const rule = current.rules[0]!
  const anchor = current.put(60, {
    windowId: 2,
    url: current.api.runtime.getURL(`group-anchor.html?group=${rule.id}`),
    status: 'unloaded',
    discarded: true,
  })
  await manager.reconcile()
  expect(current.groups).toHaveLength(0)
  current.update(anchor.id!, { discarded: false, status: 'complete' })
  await vi.advanceTimersByTimeAsync(450)
  await manager.idle()
  await router.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.tabs.get(60)).toMatchObject({
    groupId: current.groups[0]!.id,
    windowId: 2,
  })
  expect(current.api.tabs.create).not.toHaveBeenCalled()
  expect(current.api.tabs.move).not.toHaveBeenCalled()
})

it('gives the restored marker priority over a stale binding and groups with identical names', async () => {
  const draft = {
    ...newManualGroup(),
    title: 'Coding',
    automatic: true,
    patterns: 'https://chatgpt.com/*',
  }
  current = harness(toRules([draft]))
  const rule = current.rules[0]!
  current.stored[`group-once:target:${rule.id}:normal`] = {
    groupId: 71,
    ruleTitle: 'coding',
  }
  current.groups.push(
    {
      id: 71,
      windowId: 1,
      title: 'Coding',
      color: 'blue',
      collapsed: false,
      shared: false,
    },
    {
      id: 72,
      windowId: 2,
      title: 'Renamed',
      color: 'blue',
      collapsed: false,
      shared: false,
    },
  )
  current.put(61, { groupId: 71 })
  current.put(62, {
    groupId: 72,
    windowId: 2,
    url: current.api.runtime.getURL(`group-anchor.html?group=${rule.id}`),
  })
  const { manager, router } = current.start()
  // Route before the persistent manager gets a chance to refresh the binding.
  manager.dispose()
  current.api.tabs.onCreated.emit(
    current.put(63, { url: 'https://chatgpt.com/', windowId: 1 }),
  )
  current.api.tabs.onCreated.emit(
    current.put(64, { url: 'https://chatgpt.com/', windowId: 2 }),
  )
  await router.idle()
  await vi.advanceTimersByTimeAsync(800)
  await router.idle()
  expect(current.tabs.get(63)).toMatchObject({ groupId: -1, windowId: 1 })
  expect(current.tabs.get(64)).toMatchObject({ groupId: 72, windowId: 2 })
  expect(current.tabs.get(61)?.groupId).toBe(71)
  expect(current.groups).toHaveLength(2)
})

it('adopts an unmarked unnamed group when its color identifies one configured rule', async () => {
  current = harness()
  current.groups.push({
    id: 71,
    windowId: 1,
    title: '',
    color: 'blue',
    collapsed: false,
    shared: false,
  })
  current.put(61, { groupId: 71 })
  const { manager } = current.start()
  await manager.reconcile()
  expect(current.groups).toHaveLength(1)
  expect(current.tabs.get(61)?.groupId).toBe(71)
  expect(current.api.tabs.create).not.toHaveBeenCalled()
  expect(
    current.stored[`group-once:target:${current.rules[0]!.id}:normal`],
  ).toMatchObject({ groupId: 71 })
})

it('does not let continuous events postpone reopening a persistent group', async () => {
  current = harness()
  const { manager, router } = current.start()
  await router.ready
  for (let i = 0; i < 5; i++) {
    await vi.advanceTimersByTimeAsync(100)
    current.api.tabs.onUpdated.emit(1, { url: `https://example.com/${i}` })
  }
  await manager.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
})

it('keeps restoring other groups when a single group creation fails', async () => {
  current = harness(toRules([newManualGroup(), newManualGroup()]))
  const { manager } = current.start()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  current.api.tabs.create.mockRejectedValueOnce(new Error('Window closed'))
  try {
    await manager.reconcile()
    expect(current.groups).toHaveLength(1)
    expect([...current.tabs.values()][0]!.url).toContain(current.rules[1]!.id)
  } finally {
    log.mockRestore()
  }
})

it('opens a page in the group and then removes the redundant placeholder', async () => {
  current = harness()
  const { manager, router } = current.start()
  await manager.reconcile()
  const anchor = [...current.tabs.values()][0]!
  await manager.openPage(anchor.id!, 'https://example.com/from-start-tab')
  await router.idle()
  const page = [...current.tabs.values()].find(
    tab => tab.url === 'https://example.com/from-start-tab',
  )
  expect(page).toMatchObject({
    groupId: anchor.groupId,
    windowId: anchor.windowId,
    active: true,
  })
  expect(current.tabs.get(anchor.id!)?.url).toBe(anchor.url)
  expect(current.groups).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.tabs.has(anchor.id!)).toBe(false)
  expect(current.tabs.size).toBe(1)
  expect(current.api.tabs.move).not.toHaveBeenCalled()
})

it('leaves already open copies untouched and does not create another group for the same marker', async () => {
  current = harness()
  const url = current.api.runtime.getURL(
    `group-anchor.html?group=${current.rules[0]!.id}`,
  )
  for (const [id, windowId] of [
    [71, 1],
    [72, 2],
  ] as const) {
    current.groups.push({
      id,
      windowId,
      title: '',
      color: 'blue',
      collapsed: false,
      shared: false,
    })
    current.put(id, { url, groupId: id, windowId })
    current.put(id + 100, { groupId: id, windowId })
  }
  const { manager } = current.start()
  await manager.reconcile()
  expect(current.groups).toHaveLength(2)
  expect(current.tabs.get(171)?.groupId).toBe(71)
  expect(current.tabs.get(172)?.groupId).toBe(72)
  expect(current.api.tabs.create).not.toHaveBeenCalled()
  expect(current.api.tabs.remove).toHaveBeenCalledWith(71)
  expect(current.tabs.has(171)).toBe(true)
  expect(current.tabs.has(172)).toBe(true)
  expect(current.api.tabs.group).not.toHaveBeenCalled()
})

it('recreates a closed group in its original window after the worker restarts', async () => {
  current = harness()
  let { manager, router } = current.start()
  await manager.open(current.rules[0]!.id, 2)
  await router.idle()
  const oldAnchor = [...current.tabs.values()][0]!
  manager.dispose()
  router.dispose()
  await current.api.tabs.remove(oldAnchor.id!)
  ;({ manager, router } = current.start())
  await manager.reconcile()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]!.windowId).toBe(2)
  expect(current.tabs.size).toBe(1)
  expect(current.api.tabs.move).not.toHaveBeenCalled()
})

it('recovers an unloaded orphan after the restore grace period without opening a second start tab', async () => {
  current = harness()
  const { manager, router } = current.start()
  const rule = current.rules[0]!
  current.put(60, {
    url: current.api.runtime.getURL(`group-anchor.html?group=${rule.id}`),
    groupId: -1,
    status: 'unloaded',
    discarded: true,
  })
  await manager.reconcile()
  await vi.advanceTimersByTimeAsync(2_000)
  expect(current.groups).toHaveLength(0)
  await vi.advanceTimersByTimeAsync(2_500)
  await manager.idle()
  await router.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.tabs.get(60)?.groupId).toBe(current.groups[0]!.id)
  expect(current.api.tabs.create).not.toHaveBeenCalled()
})

it('uses a placeholder only while its group has no normal tabs', async () => {
  current = harness()
  const { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  const placeholder = [...current.tabs.values()][0]!
  const groupId = placeholder.groupId
  current.put(80, { url: 'https://chatgpt.com/c/coding', groupId })
  current.api.tabs.onUpdated.emit(80, { groupId })
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.tabs.has(placeholder.id!)).toBe(false)
  expect(current.tabs.get(80)?.groupId).toBe(groupId)
  expect(current.groups).toHaveLength(1)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  await current.api.tabs.remove(80)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.tabs.size).toBe(1)
  expect([...current.tabs.values()][0]!.url).toContain('group-anchor.html?group=')
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
})

it('opens an existing populated group without adding a placeholder', async () => {
  const draft = { ...newManualGroup(), title: 'Coding' }
  current = harness(toRules([draft]))
  current.groups.push({
    id: 71,
    windowId: 2,
    title: 'Coding',
    color: 'blue',
    collapsed: true,
    shared: false,
  })
  current.put(80, { groupId: 71, windowId: 2 })
  const { manager } = current.start()
  await manager.reconcile()
  expect(current.api.windows.update).not.toHaveBeenCalled()
  await manager.open(draft.id, 1)
  expect(current.api.tabs.create).not.toHaveBeenCalled()
  expect(current.tabs.size).toBe(1)
  expect(current.api.tabs.update).toHaveBeenCalledWith(80, { active: true })
  expect(current.api.windows.update).toHaveBeenCalledWith(2, { focused: true })
})

it('recognizes populated unnamed groups after cold startup without keeping visible identity tabs', async () => {
  const drafts = [newManualGroup(), newManualGroup()]
  current = harness(toRules(drafts))
  let { manager, router } = current.start()
  await manager.reconcile()
  await router.idle()
  const first = current.groups[0]!.id,
    second = current.groups[1]!.id
  current.put(80, { groupId: first, url: 'https://chatgpt.com/c/coding' })
  current.put(81, { groupId: second, url: 'https://chatgpt.com/c/writing' })
  await manager.reconcile()
  expect(current.tabs.size).toBe(2)
  expect(JSON.stringify(current.localStored)).not.toContain('https://')
  manager.dispose()
  router.dispose()
  for (const group of current.groups) {
    const oldId = group.id
    group.id += 200
    for (const tab of current.tabs.values())
      if (tab.groupId === oldId) tab.groupId = group.id
  }
  for (const key of Object.keys(current.stored)) delete current.stored[key]
  ;({ manager, router } = current.start())
  await router.ready
  await vi.advanceTimersByTimeAsync(4_000)
  await manager.idle()
  await manager.reconcile()
  expect(current.tabs.size).toBe(2)
  expect(current.groups).toHaveLength(2)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
  expect(current.stored[`group-once:target:${drafts[0]!.id}:normal`]).toMatchObject({
    groupId: first + 200,
  })
  expect(current.stored[`group-once:target:${drafts[1]!.id}:normal`]).toMatchObject({
    groupId: second + 200,
  })
})

it('does not remove the placeholder if the last normal tab closes during the lookup', async () => {
  current = harness()
  const { manager } = current.start()
  await manager.reconcile()
  const placeholder = [...current.tabs.values()][0]!
  current.put(80, { groupId: placeholder.groupId })
  const get = current.api.tabs.get.getMockImplementation()!
  current.api.tabs.get.mockImplementationOnce(async id => {
    await current!.api.tabs.remove(80)
    return get(id)
  })
  await manager.reconcile()
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.tabs.has(placeholder.id!)).toBe(true)
  expect(current.tabs.size).toBe(1)
  expect(current.api.tabs.remove).not.toHaveBeenCalledWith(placeholder.id!)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
})

it('never deletes a placeholder that the user has navigated to a normal page', async () => {
  current = harness()
  const { manager } = current.start()
  await manager.reconcile()
  const placeholder = [...current.tabs.values()][0]!
  current.put(80, { groupId: placeholder.groupId })
  const get = current.api.tabs.get.getMockImplementation()!
  current.api.tabs.get.mockImplementationOnce(async id => {
    current!.update(id, { url: 'https://example.com/keep-this' })
    return get(id)
  })
  await manager.reconcile()
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.tabs.get(placeholder.id!)?.url).toBe(
    'https://example.com/keep-this',
  )
  expect(current.tabs.size).toBe(2)
  expect(current.api.tabs.remove).not.toHaveBeenCalled()
})

it('updates a populated group moved to another window without creating another placeholder', async () => {
  current = harness()
  const { manager } = current.start()
  await manager.reconcile()
  const group = current.groups[0]!
  current.put(80, { groupId: group.id, url: 'https://example.com/unique-project' })
  await manager.reconcile()
  group.id = 500
  group.windowId = 2
  current.update(80, { groupId: 500, windowId: 2 })
  current.api.tabs.onAttached.emit(80)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.tabs.size).toBe(1)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  await current.api.tabs.remove(80)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]!.windowId).toBe(2)
  expect(current.tabs.size).toBe(1)
})

it('does not persist member fingerprints for private groups', async () => {
  const draft = { ...newManualGroup(), keepOpen: false }
  current = harness(toRules([draft]))
  const { manager } = current.start()
  await manager.open(draft.id, 3)
  const anchor = [...current.tabs.values()][0]!
  current.setRules(
    current.rules.map(rule => ({
      ...rule,
      options: { ...rule.options, keepOpen: true },
    })),
  )
  current.put(80, {
    groupId: anchor.groupId,
    windowId: 3,
    incognito: true,
    url: 'https://example.com/private',
  })
  await manager.open(draft.id, 3)
  expect(current.tabs.has(anchor.id!)).toBe(false)
  expect(current.api.storage.local.set).not.toHaveBeenCalled()
})

it('forgets local fingerprints when keeping the group open is disabled', async () => {
  const draft = { ...newManualGroup(), title: 'Coding' }
  current = harness(toRules([draft]))
  current.groups.push({
    id: 71,
    windowId: 1,
    title: 'Coding',
    color: 'blue',
    collapsed: false,
    shared: false,
  })
  current.put(80, { groupId: 71, url: 'https://example.com/coding' })
  const { manager } = current.start()
  await manager.reconcile()
  expect(JSON.stringify(current.localStored)).toContain(draft.id)
  current.setRules(
    current.rules.map(rule => ({
      ...rule,
      options: { ...rule.options, keepOpen: false },
    })),
  )
  await manager.reconcile()
  expect(current.localStored['group-once:member-fingerprints']).toEqual({})
  expect(current.tabs.has(80)).toBe(true)
})

it('does not create duplicates when populated unnamed groups have identical restored members', async () => {
  current = harness(toRules([newManualGroup(), newManualGroup()]))
  let { manager, router } = current.start()
  await manager.reconcile()
  for (const [index, group] of current.groups.entries())
    current.put(80 + index, { groupId: group.id, url: 'https://example.com/shared' })
  await manager.reconcile()
  expect(current.tabs.size).toBe(2)
  manager.dispose()
  router.dispose()
  for (const group of current.groups) {
    const oldId = group.id
    group.id += 200
    for (const tab of current.tabs.values())
      if (tab.groupId === oldId) tab.groupId = group.id
  }
  for (const key of Object.keys(current.stored)) delete current.stored[key]
  ;({ manager, router } = current.start())
  await router.ready
  await vi.advanceTimersByTimeAsync(4_000)
  await manager.idle()
  await manager.reconcile()
  expect(current.tabs.size).toBe(2)
  expect(current.groups).toHaveLength(2)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
  expect(current.api.tabs.move).not.toHaveBeenCalled()
})

it('preserves the native name and color when replacing the last normal tab with a placeholder', async () => {
  current = harness()
  const { manager } = current.start()
  await manager.reconcile()
  const group = current.groups[0]!
  current.put(80, { groupId: group.id, url: 'https://example.com/work' })
  await manager.reconcile()
  group.title = 'Mein Coding'
  group.color = 'purple'
  await manager.reconcile()
  await current.api.tabs.remove(80)
  await vi.advanceTimersByTimeAsync(500)
  await manager.idle()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]).toMatchObject({ title: 'Mein Coding', color: 'purple' })
  expect(current.tabs.size).toBe(1)
})

it.each([
  { populated: false, windowFirst: false },
  { populated: true, windowFirst: false },
  { populated: false, windowFirst: true },
  { populated: true, windowFirst: true },
])(
  'does not reopen groups in a surviving window after their owner closes: %j',
  async ({ populated, windowFirst }) => {
    current = harness(toRules([newManualGroup(), newManualGroup()]))
    const { manager } = current.start()
    await manager.reconcile()
    if (populated) {
      current.groups.forEach((group, index) =>
        current!.put(80 + index, {
          groupId: group.id,
          url: `https://example.com/${index}`,
        }),
      )
      await manager.reconcile()
    }
    const other = {
      id: 70,
      windowId: 2,
      title: 'Zweitmonitor',
      color: 'red',
      collapsed: false,
      shared: false,
    } as chrome.tabGroups.TabGroup
    current.groups.push(other)
    const otherTab = current.put(90, {
      groupId: other.id,
      windowId: 2,
      url: 'https://example.com/other',
    })
    current.closeWindow(1, windowFirst)
    await vi.advanceTimersByTimeAsync(1_000)
    await manager.idle()
    // A later new window must not become the automatic replacement owner either.
    current.windows.push({ id: 4, type: 'normal', incognito: false, focused: true })
    current.api.windows.onCreated.emit({ id: 4 })
    await manager.reconcile()
    expect(current.groups).toEqual([other])
    expect([...current.tabs.values()]).toEqual([otherTab])
    expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
    expect(current.api.tabs.move).not.toHaveBeenCalled()
    expect(current.api.windows.update).not.toHaveBeenCalled()
  },
)

it('retains a closed owner across worker sleep until an explicit Open rebinds it', async () => {
  current = harness()
  let { manager, router } = current.start()
  await manager.reconcile()
  manager.dispose()
  router.dispose()
  // The worker can be asleep when Chrome closes the entire owner window.
  current.closeWindow(1)
  ;({ manager, router } = current.start())
  await manager.reconcile()
  expect(current.groups).toHaveLength(0)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(1)
  await manager.open(current.rules[0]!.id, 2)
  expect(current.groups[0]!.windowId).toBe(2)
  await current.api.tabs.remove([...current.tabs.keys()][0]!)
  await manager.reconcile()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]!.windowId).toBe(2)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(3)
})

it('does not resurrect a closed persistent group through a matching new tab in another window', async () => {
  const draft = {
    ...newManualGroup(),
    automatic: true,
    patterns: 'https://example.com/*',
  }
  current = harness(toRules([draft]))
  const { manager, router } = current.start()
  await manager.reconcile()
  current.closeWindow(1)
  await current.api.tabs.create({ windowId: 2, url: 'https://example.com/new' })
  await router.idle()
  await vi.advanceTimersByTimeAsync(1_000)
  await router.idle()
  await manager.idle()
  expect(current.groups).toHaveLength(0)
  expect([...current.tabs.values()]).toMatchObject([
    { windowId: 2, groupId: -1, url: 'https://example.com/new' },
  ])
  expect(current.api.tabs.group).toHaveBeenCalledTimes(1)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
})

it('recovers a deliberately moved group even if its old owner closes before reconciliation', async () => {
  current = harness()
  const { manager } = current.start()
  await manager.reconcile()
  const anchor = [...current.tabs.values()][0]!
  current.groups[0]!.id = 500
  current.groups[0]!.windowId = 2
  current.update(anchor.id!, { groupId: 500, windowId: 2 })
  current.closeWindow(1)
  await manager.reconcile()
  await current.api.tabs.remove(anchor.id!)
  await manager.reconcile()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]).toMatchObject({ windowId: 2 })
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
})

it('starts persistent groups normally after a full browser restart clears the old owner', async () => {
  current = harness()
  let { manager, router } = current.start()
  await manager.reconcile()
  current.closeWindow(1)
  manager.dispose()
  router.dispose()
  for (const key of Object.keys(current.stored)) delete current.stored[key]
  ;({ manager, router } = current.start())
  await router.ready
  await vi.advanceTimersByTimeAsync(4_000)
  await manager.idle()
  await manager.reconcile()
  expect(current.groups).toHaveLength(1)
  expect(current.groups[0]!.windowId).toBe(2)
  expect(current.api.tabs.create).toHaveBeenCalledTimes(2)
})
