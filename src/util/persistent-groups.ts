import type { GroupConfiguration } from './types'
import type { registerOnceRouter } from './once-router'

type Api = Pick<typeof chrome, 'tabs' | 'tabGroups' | 'windows' | 'runtime'>
type Router = Pick<
  ReturnType<typeof registerOnceRouter>,
  'ready' | 'findTarget' | 'bindTarget' | 'startupDelay' | 'withGroupLock'
>

/** The extension-owned start tab carries a stable configuration ID across boots. */
export function anchorRuleId(url: string, base: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}` === base
      ? parsed.searchParams.get('group')
      : null
  } catch {
    return null
  }
}

export function registerPersistentGroups(
  api: Api,
  getRules: () => GroupConfiguration[],
  router: Router,
) {
  const base = api.runtime.getURL('group-anchor.html')
  const closingWindows = new Set<number>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue = Promise.resolve()
  let disposed = false
  let retryAt = 0

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue
      .then(() => router.ready)
      .then(() => router.withGroupLock(task))
    queue = result.then(
      () => {},
      error => {
        retryAt = Date.now() + 5_000
        console.error('Could not open persistent group:', error)
        if (getRules().some(rule => rule.options.keepOpen)) schedule()
      },
    )
    return result
  }

  function schedule() {
    if (disposed) return
    clearTimeout(timer)
    timer = setTimeout(
      () => {
        if (router.startupDelay() > 0) {
          schedule()
          return
        }
        void reconcile().catch(() => {})
      },
      Math.max(400, router.startupDelay(), retryAt - Date.now()),
    )
  }

  async function ensure(
    rule: GroupConfiguration,
    window: chrome.windows.Window,
    activate: boolean,
    automatic: boolean,
  ) {
    const [groups, tabs] = await Promise.all([
      api.tabGroups.query({}),
      api.tabs.query({}),
    ])
    const ownTabs = tabs.filter(
      tab =>
        tab.incognito === window.incognito &&
        anchorRuleId(tab.pendingUrl || tab.url || '', base) === rule.id,
    )
    let target = groups.find(group =>
      ownTabs.some(
        tab => tab.groupId === group.id && tab.windowId === group.windowId,
      ),
    )
    // Do not interfere with an anchor the user has deliberately ungrouped, or
    // an unloaded restore tab whose membership has not arrived yet.
    if (!target && ownTabs.length) return undefined
    target ??= await router.findTarget(rule, window, groups)
    if (target) {
      const targetWindow = await api.windows.get(target.windowId)
      if (
        targetWindow.type !== 'normal' ||
        targetWindow.incognito !== window.incognito ||
        closingWindows.has(target.windowId)
      )
        return undefined
    }
    const current = getRules().find(item => item.id === rule.id)
    if (!current || (automatic && !current.options.keepOpen)) return undefined
    if (router.startupDelay() > 0) {
      schedule()
      return undefined
    }
    let anchor = ownTabs.find(tab => tab.groupId === target?.id)
    if (!anchor) {
      const created = await api.tabs.create({
        windowId: target?.windowId ?? window.id,
        url: `${base}?group=${encodeURIComponent(rule.id)}`,
        active: false,
      })
      if (created.id === undefined)
        throw new Error('Der Start-Tab konnte nicht geöffnet werden.')
      let createdGroupId = target?.id
      async function removeUnusedAnchor() {
        try {
          const latest = await api.tabs.get(created.id!)
          if (
            anchorRuleId(latest.pendingUrl || latest.url || '', base) === rule.id &&
            latest.windowId === created.windowId &&
            !latest.pinned &&
            (latest.groupId === -1 || latest.groupId === createdGroupId)
          )
            await api.tabs.remove(created.id!)
        } catch {
          /* The tab may already have been closed. */
        }
      }
      try {
        // Only the tab created here is grouped. Existing user tabs are untouched.
        const latest = await api.tabs.get(created.id)
        const stillSaved = getRules().find(item => item.id === rule.id)
        if (
          latest.groupId !== -1 ||
          latest.windowId !== created.windowId ||
          latest.pinned ||
          anchorRuleId(latest.pendingUrl || latest.url || '', base) !== rule.id
        )
          return undefined
        if (
          !stillSaved ||
          (automatic && !stillSaved.options.keepOpen) ||
          router.startupDelay() > 0
        ) {
          await removeUnusedAnchor()
          return undefined
        }
        const id = await api.tabs.group(
          target
            ? { tabIds: [created.id], groupId: target.id }
            : { tabIds: [created.id], createProperties: { windowId: window.id! } },
        )
        createdGroupId = id
        if (!target) {
          await api.tabGroups.update(id, { title: rule.title, color: rule.color })
          target = {
            id,
            windowId: window.id!,
            title: rule.title,
            color: rule.color,
            collapsed: false,
            shared: false,
          }
        }
        anchor = created
      } catch (error) {
        await removeUnusedAnchor()
        throw error
      }
    }
    await router.bindTarget(rule, target!, window.incognito)
    if (activate) {
      const destination =
        tabs.find(
          tab => tab.groupId === target!.id && !anchorRuleId(tab.url || '', base),
        ) ?? anchor
      await api.tabGroups.update(target!.id, { collapsed: false })
      await api.tabs.update(destination!.id!, { active: true })
      await api.windows.update(target!.windowId, { focused: true })
    }
    return target
  }

  function reconcile() {
    return enqueue(async () => {
      if (router.startupDelay() > 0) {
        schedule()
        return
      }
      const windows = (await api.windows.getAll({ windowTypes: ['normal'] })).filter(
        window => !closingWindows.has(window.id!),
      )
      const normal =
        windows.find(window => window.focused && !window.incognito) ??
        windows.find(window => !window.incognito)
      for (const rule of getRules().filter(rule => rule.options.keepOpen)) {
        if (normal) await ensure(rule, normal, false, true)
        // Maintain private groups only where the user explicitly opened one.
        const tabs = await api.tabs.query({})
        const privateAnchor = tabs.find(
          tab =>
            tab.incognito &&
            anchorRuleId(tab.pendingUrl || tab.url || '', base) === rule.id,
        )
        const privateWindow = windows.find(
          window => window.id === privateAnchor?.windowId,
        )
        if (privateWindow) await ensure(rule, privateWindow, false, true)
      }
    })
  }

  function open(id: string, windowId: number) {
    return enqueue(async () => {
      if (router.startupDelay() > 0)
        throw new Error('Chrome stellt Tabs noch wieder her. Bitte kurz warten.')
      const rule = getRules().find(rule => rule.id === id)
      if (!rule) throw new Error('Bitte die Gruppe zuerst speichern.')
      const window = await api.windows.get(windowId)
      if (window.type !== 'normal' || closingWindows.has(windowId))
        throw new Error('Bitte ein normales Chrome-Fenster verwenden.')
      const group = await ensure(rule, window, true, false)
      if (!group)
        throw new Error(
          'Der Start-Tab ist noch offen oder wird gerade wiederhergestellt. Bitte seine Gruppierung prüfen.',
        )
      return group
    })
  }

  const onRemoved = (_id: number, info: chrome.tabs.OnRemovedInfo) => {
    if (info.isWindowClosing) closingWindows.add(info.windowId)
    schedule()
  }
  const onWindowRemoved = (id: number) => {
    closingWindows.add(id)
    schedule()
  }
  const onUpdated = (_id: number, changes: chrome.tabs.OnUpdatedInfo) => {
    if (changes.url !== undefined || changes.groupId !== undefined) schedule()
  }
  api.tabs.onCreated.addListener(schedule)
  api.tabs.onRemoved.addListener(onRemoved)
  api.tabs.onUpdated.addListener(onUpdated)
  api.tabs.onDetached.addListener(schedule)
  api.tabs.onAttached.addListener(schedule)
  api.tabGroups.onRemoved.addListener(schedule)
  api.windows.onCreated.addListener(schedule)
  api.windows.onRemoved.addListener(onWindowRemoved)
  schedule()

  return {
    open,
    reconcile,
    refresh: schedule,
    idle: () => queue,
    dispose() {
      disposed = true
      clearTimeout(timer)
      api.tabs.onCreated.removeListener(schedule)
      api.tabs.onRemoved.removeListener(onRemoved)
      api.tabs.onUpdated.removeListener(onUpdated)
      api.tabs.onDetached.removeListener(schedule)
      api.tabs.onAttached.removeListener(schedule)
      api.tabGroups.onRemoved.removeListener(schedule)
      api.windows.onCreated.removeListener(schedule)
      api.windows.onRemoved.removeListener(onWindowRemoved)
    },
  }
}
