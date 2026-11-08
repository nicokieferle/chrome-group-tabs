import { anchorRuleId } from './group-anchor'
import type { GroupConfiguration } from './types'
import type { registerOnceRouter } from './once-router'

type Api = Pick<typeof chrome, 'tabs' | 'tabGroups' | 'windows' | 'runtime'>
type Router = Pick<
  ReturnType<typeof registerOnceRouter>,
  | 'ready'
  | 'findTarget'
  | 'bindTarget'
  | 'boundWindow'
  | 'startupDelay'
  | 'withGroupLock'
>

export function registerPersistentGroups(
  api: Api,
  getRules: () => GroupConfiguration[],
  router: Router,
) {
  const base = api.runtime.getURL('group-anchor.html')
  const closingWindows = new Set<number>()
  const unsettledAnchors = new Map<number, number>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue = Promise.resolve()
  let disposed = false
  let retryAt = 0
  let reconciling = false
  let requested = false

  function report(error: unknown) {
    retryAt = Date.now() + 5_000
    console.error('Could not open persistent group:', error)
    if (getRules().some(rule => rule.options.keepOpen)) schedule()
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue
      .then(() => router.ready)
      .then(() => router.withGroupLock(task))
    queue = result.then(() => {}, report)
    return result
  }

  function schedule() {
    if (disposed) return
    requested = true
    if (timer !== undefined || reconciling) return
    timer = setTimeout(
      () => {
        timer = undefined
        if (router.startupDelay() > 0 || retryAt > Date.now()) {
          schedule()
          return
        }
        requested = false
        reconciling = true
        void reconcile()
          .catch(() => {})
          .finally(() => {
            reconciling = false
            if (requested) schedule()
          })
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
    const resolution = await router.findTarget(rule, window, { groups, tabs })
    const ownTabs = resolution.anchors
    if (resolution.blocked) {
      if (activate && resolution.blocked === 'ambiguous')
        throw new Error(
          'Die offene Gruppe ist nicht eindeutig. Gib ihr in Chrome und in der Regel einen passenden, eindeutigen Namen.',
        )
      return undefined
    }
    let target = resolution.group
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
    let anchor = ownTabs.find(
      tab => tab.groupId === target?.id && tab.windowId === target.windowId,
    )
    if (!anchor) {
      let destination = target?.windowId ?? window.id!
      const eligible = ownTabs.filter(
        tab =>
          tab.id !== undefined &&
          tab.groupId === -1 &&
          !tab.pinned &&
          (tab.splitViewId === undefined || tab.splitViewId === -1) &&
          !closingWindows.has(tab.windowId) &&
          (!target || tab.windowId === destination),
      )
      const reusable =
        eligible.find(
          tab =>
            !tab.discarded && tab.status !== 'loading' && tab.status !== 'unloaded',
        ) ??
        eligible.find(tab => {
          // Give Chrome time to finish restoring membership, then repair even
          // when the restored start page remains unloaded until selected.
          const deadline = unsettledAnchors.get(tab.id!) ?? Date.now() + 4_000
          unsettledAnchors.set(tab.id!, deadline)
          return Date.now() >= deadline
        })
      if (reusable) {
        const anchorWindow = await api.windows.get(reusable.windowId)
        if (
          anchorWindow.type !== 'normal' ||
          anchorWindow.incognito !== window.incognito
        )
          return undefined
        destination = reusable.windowId
      } else if (eligible.length) {
        schedule()
        return undefined
      }
      if (closingWindows.has(destination) || router.startupDelay() > 0)
        return undefined
      const created =
        reusable ??
        (await api.tabs.create({
          windowId: destination,
          index: tabs.filter(tab => tab.windowId === destination).length,
          url: `${base}?group=${encodeURIComponent(rule.id)}`,
          active: false,
        }))
      if (created.id === undefined)
        throw new Error('Der Start-Tab konnte nicht geöffnet werden.')
      async function removeUnusedAnchor() {
        if (reusable) return
        try {
          const latest = await api.tabs.get(created.id!)
          if (
            anchorRuleId(latest.pendingUrl || latest.url || '', base) === rule.id &&
            latest.windowId === destination &&
            !latest.pinned
          )
            await api.tabs.remove(created.id!)
        } catch {
          /* The tab may already have been closed. */
        }
      }
      try {
        const latest = await api.tabs.get(created.id)
        const stillSaved = getRules().find(item => item.id === rule.id)
        if (
          latest.windowId !== destination ||
          latest.pinned ||
          (latest.splitViewId !== undefined && latest.splitViewId !== -1) ||
          anchorRuleId(latest.pendingUrl || latest.url || '', base) !== rule.id
        )
          return undefined
        if (latest.groupId !== -1 && latest.groupId !== target?.id) {
          if (!reusable)
            throw new Error(
              'Chrome hat den neuen Start-Tab einer anderen Gruppe zugeordnet.',
            )
          return undefined
        }
        if (
          !stillSaved ||
          (automatic && !stillSaved.options.keepOpen) ||
          router.startupDelay() > 0
        ) {
          await removeUnusedAnchor()
          return undefined
        }
        const id =
          target && latest.groupId === target.id
            ? target.id
            : await api.tabs.group(
                target
                  ? { tabIds: [created.id], groupId: target.id }
                  : {
                      tabIds: [created.id],
                      createProperties: { windowId: destination },
                    },
              )
        if (!target) {
          await api.tabGroups.update(id, { title: rule.title, color: rule.color })
          target = {
            id,
            windowId: destination,
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
      const rules = getRules().filter(rule => rule.options.keepOpen)
      if (!rules.length) return
      const windows = (await api.windows.getAll({ windowTypes: ['normal'] })).filter(
        window => !closingWindows.has(window.id!),
      )
      const normal =
        windows.find(window => window.focused && !window.incognito) ??
        windows.find(window => !window.incognito)
      for (const rule of rules) {
        const home =
          windows.find(
            window =>
              !window.incognito && window.id === router.boundWindow(rule.id, false),
          ) ?? normal
        try {
          if (home) await ensure(rule, home, false, true)
        } catch (error) {
          report(error)
        }
        // Maintain private groups only where the user explicitly opened one.
        const tabs = await api.tabs.query({})
        const privateAnchor = tabs.find(
          tab =>
            tab.incognito &&
            anchorRuleId(tab.pendingUrl || tab.url || '', base) === rule.id,
        )
        const privateWindow = windows.find(
          window =>
            window.incognito &&
            window.id ===
              (privateAnchor?.windowId ?? router.boundWindow(rule.id, true)),
        )
        if (privateWindow) {
          try {
            await ensure(rule, privateWindow, false, true)
          } catch (error) {
            report(error)
          }
        }
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

  function openPage(tabId: number, url: string) {
    return enqueue(async () => {
      const address = new URL(url)
      if (address.protocol !== 'https:' && address.protocol !== 'http:')
        throw new Error('Bitte eine HTTP- oder HTTPS-Adresse verwenden.')
      const source = await api.tabs.get(tabId)
      if (
        source.groupId === -1 ||
        !anchorRuleId(source.pendingUrl || source.url || '', base)
      )
        throw new Error('Dieser Start-Tab gehört gerade zu keiner Gruppe.')
      const opened = await api.tabs.create({
        windowId: source.windowId,
        url: address.href,
        active: false,
      })
      if (opened.id === undefined)
        throw new Error('Der Tab konnte nicht geöffnet werden.')
      const [liveSource, liveOpened] = await Promise.all([
        api.tabs.get(tabId),
        api.tabs.get(opened.id),
      ])
      if (liveOpened.windowId !== source.windowId) return
      if (
        liveSource.windowId === source.windowId &&
        liveSource.groupId === source.groupId &&
        liveOpened.groupId === -1 &&
        !liveOpened.pinned &&
        (liveOpened.splitViewId === undefined || liveOpened.splitViewId === -1)
      )
        await api.tabs.group({ tabIds: [opened.id], groupId: source.groupId })
      await api.tabs.update(opened.id, { active: true })
    })
  }

  const onRemoved = (id: number, info: chrome.tabs.OnRemovedInfo) => {
    unsettledAnchors.delete(id)
    if (info.isWindowClosing) closingWindows.add(info.windowId)
    schedule()
  }
  const onWindowRemoved = (id: number) => {
    closingWindows.add(id)
    schedule()
  }
  const onUpdated = (id: number, changes: chrome.tabs.OnUpdatedInfo) => {
    if (
      (changes.groupId !== undefined && changes.groupId !== -1) ||
      (changes.url !== undefined && !anchorRuleId(changes.url, base))
    )
      unsettledAnchors.delete(id)
    if (
      changes.url !== undefined ||
      changes.groupId !== undefined ||
      changes.status === 'complete'
    )
      schedule()
  }
  api.tabs.onCreated.addListener(schedule)
  api.tabs.onRemoved.addListener(onRemoved)
  api.tabs.onUpdated.addListener(onUpdated)
  api.tabs.onDetached.addListener(schedule)
  api.tabs.onAttached.addListener(schedule)
  api.tabGroups.onCreated.addListener(schedule)
  api.tabGroups.onRemoved.addListener(schedule)
  api.windows.onCreated.addListener(schedule)
  api.windows.onRemoved.addListener(onWindowRemoved)
  schedule()

  return {
    open,
    openPage,
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
      api.tabGroups.onCreated.removeListener(schedule)
      api.tabGroups.onRemoved.removeListener(schedule)
      api.windows.onCreated.removeListener(schedule)
      api.windows.onRemoved.removeListener(onWindowRemoved)
    },
  }
}
