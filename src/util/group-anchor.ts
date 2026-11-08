/** The extension's start tab carries the configuration ID across browser boots. */
export function anchorRuleId(url: string, base: string | undefined) {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}` === base
      ? parsed.searchParams.get('group')
      : null
  } catch {
    return null
  }
}
