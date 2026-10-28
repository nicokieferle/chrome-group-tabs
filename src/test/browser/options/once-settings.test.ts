import { expect, test } from '@playwright/test'

test('loads Once defaults and contains none of the continuous-regrouping controls', async ({
  page,
}) => {
  await page.goto('http://localhost:6655/?context=options')
  await expect(page.getByRole('heading', { name: 'Gruppen & Regeln' })).toBeVisible()
  await expect(page.locator('.rule-card')).toHaveCount(2)
  await expect(page.getByLabel('Zielgruppe', { exact: true }).first()).toHaveValue(
    'GPT',
  )
  await expect(page.locator('body')).not.toContainText('Exakt')
  await expect(page.locator('body')).not.toContainText('erzwingen')
  await expect(
    page.getByRole('button', { name: 'Änderungen speichern' }),
  ).toBeDisabled()
})

test('saves a title, color, multiline patterns and exceptions without applying draft edits early', async ({
  page,
}) => {
  await page.goto('http://localhost:6655/?context=options')
  const first = page.locator('.rule-card').first()
  await first.getByLabel('Zielgruppe', { exact: true }).fill('Mein GPT')
  await first.getByLabel('Lila', { exact: true }).check()
  await first
    .getByLabel('URL-Muster', { exact: true })
    .fill('https://chatgpt.com/*\nhttps://chat.openai.com/*\n')
  await first.getByLabel('Titel-Ausnahmen', { exact: false }).fill('xxx\nPrivat')
  expect(await page.evaluate(() => localStorage.getItem('groups'))).toBeNull()
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByRole('status')).toContainText('Gespeichert')
  await page.reload()
  await expect(first.getByLabel('Zielgruppe', { exact: true })).toHaveValue(
    'Mein GPT',
  )
  await expect(first.getByLabel('Lila', { exact: true })).toBeChecked()
  await expect(first.getByLabel('Titel-Ausnahmen', { exact: false })).toHaveValue(
    'xxx\nPrivat',
  )
})

test('preview applies title exclusions and first-match order, including the catch-all warning', async ({
  page,
}) => {
  await page.goto('http://localhost:6655/?context=options')
  await page
    .locator('.rule-card')
    .first()
    .getByLabel('Titel-Ausnahmen', { exact: false })
    .fill('xxx')
  await page.getByLabel('Tabtitel', { exact: false }).fill('Projekt XXX')
  await expect(page.locator('.preview-result')).toContainText('Default')
  await page.getByLabel('Tabtitel', { exact: false }).fill('Normal')
  await expect(page.locator('.preview-result')).toContainText('GPT')
  await page.getByRole('button', { name: 'Regel 2 nach oben' }).click()
  await expect(page.locator('.inline-warning')).toBeVisible()
  await expect(page.locator('.preview-result')).toContainText('Default')
  await page.getByRole('button', { name: 'Änderungen verwerfen' }).click()
  await expect(page.locator('.inline-warning')).toHaveCount(0)
  await page
    .getByLabel('Adresse des neuen Tabs', { exact: true })
    .fill('chrome://newtab/')
  await expect(page.locator('.preview-result')).toContainText(
    'Wartet auf den ersten Seitenaufruf',
  )
  await page
    .getByLabel('Adresse des neuen Tabs', { exact: true })
    .fill('https://chatgpt.com/')
  await expect(page.locator('.preview-result')).toContainText('GPT')
})

test('validates new rules and retains a custom rule after saving and reloading', async ({
  page,
}) => {
  await page.goto('http://localhost:6655/?context=options')
  await page.getByRole('button', { name: '+ Regel hinzufügen', exact: true }).click()
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByRole('alert')).toContainText('URL-Muster')
  const last = page.locator('.rule-card').last()
  await last.getByLabel('Zielgruppe', { exact: true }).fill('GitHub')
  await last.getByLabel('URL-Muster', { exact: true }).fill('https://github.com/*')
  await last
    .getByLabel('Fensterzuordnung', { exact: true })
    .selectOption({ label: 'Bestehende Gruppe auch in anderen Fenstern' })
  await page.getByRole('button', { name: 'Regel 3 nach oben' }).click()
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByRole('status')).toContainText('Gespeichert')
  await page.reload()
  await expect(
    page.locator('.rule-card').nth(1).getByLabel('Zielgruppe', { exact: true }),
  ).toHaveValue('GitHub')
})

test('imports previous-format backups as a draft and rejects invalid files without changing it', async ({
  page,
}) => {
  await page.goto('http://localhost:6655/?context=options')
  const rules = [
    {
      id: 'b0bb3cc8-6467-4c9e-8512-c90d90aa7925',
      title: 'Vorhanden',
      color: 'cyan',
      matchers: ['example.com'],
      options: { strict: true, merge: true, excludedTitles: ['AC'] },
    },
  ]
  await page.getByLabel('Konfiguration importieren', { exact: true }).setInputFiles({
    name: 'old.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(rules)),
  })
  await expect(page.getByLabel('Zielgruppe', { exact: true })).toHaveValue(
    'Vorhanden',
  )
  expect(await page.evaluate(() => localStorage.getItem('groups'))).toBeNull()
  await page.getByLabel('Konfiguration importieren', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('broken'),
  })
  await expect(page.getByRole('alert')).toContainText('keine gültige Konfiguration')
  await expect(page.getByLabel('Zielgruppe', { exact: true })).toHaveValue(
    'Vorhanden',
  )
})

test('popup only summarizes the configuration and opens the separate settings page', async ({
  page,
}) => {
  await page.goto('http://localhost:6655/?context=popup')
  await expect(page.locator('.popup-rules li')).toHaveCount(2)
  await expect(page.locator('input, textarea, select')).toHaveCount(0)
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click()
  await expect(page.getByRole('heading', { name: 'Gruppen & Regeln' })).toBeVisible()
})

test('settings fit a narrow window without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:6655/?context=options')
  await expect(page.locator('.rule-card')).toHaveCount(2)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await expect(
    page.getByRole('button', { name: 'Änderungen speichern' }),
  ).toBeVisible()
})

test('saves unnamed manual groups with independent IDs, no URL rule and keep-open enabled', async ({
  page,
}) => {
  await page.goto('http://localhost:6655/?context=options')
  await page
    .getByRole('button', { name: '+ Gruppe ohne Regel', exact: true })
    .click()
  let last = page.locator('.rule-card').last()
  await expect(
    last.getByRole('heading', { name: 'Ohne Namen', exact: true }),
  ).toBeVisible()
  await expect(
    last.getByLabel('Neue Tabs automatisch zuordnen', { exact: true }),
  ).not.toBeChecked()
  await expect(
    last.getByLabel('Dauerhaft offen halten', { exact: true }),
  ).toBeChecked()
  await expect(last.getByLabel('URL-Muster', { exact: true })).toHaveCount(0)
  await expect(page.locator('.inline-warning')).toHaveCount(0)
  await expect(
    last.getByRole('button', { name: 'Gruppe öffnen', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByRole('status')).toContainText('Gespeichert')
  await page.reload()
  await expect(last.getByLabel('Zielgruppe', { exact: true })).toHaveValue('')
  await expect(
    last.getByRole('button', { name: 'Gruppe öffnen', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: '+ Gruppe ohne Regel', exact: true })
    .click()
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(page.getByRole('status')).toContainText('Gespeichert')
  const rules = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('groups')!),
  )
  expect(
    rules
      .slice(2)
      .map((rule: any) => [rule.title, rule.matchers, rule.options.keepOpen]),
  ).toEqual([
    ['', [], true],
    ['', [], true],
  ])
  expect(rules[2].id).not.toBe(rules[3].id)
  await page.goto('http://localhost:6655/?context=popup')
  await expect(
    page.getByRole('button', { name: 'Gruppe ohne Namen öffnen' }),
  ).toHaveCount(2)
  await expect(page.locator('.popup-rules')).toContainText('Ohne Zuordnungsregel')
})

test('allows unnamed automatic groups and toggles automatic routing without changing the group identity', async ({
  page,
}) => {
  await page.goto('http://localhost:6655/?context=options')
  const first = page.locator('.rule-card').first()
  await first.getByLabel('Zielgruppe', { exact: true }).fill('')
  await expect(page.locator('.preview-result')).toContainText('Ohne Namen')
  await first.getByLabel('Neue Tabs automatisch zuordnen', { exact: true }).uncheck()
  await expect(page.locator('.preview-result')).toContainText('Default')
  await page.getByRole('button', { name: 'Änderungen speichern' }).click()
  await page.reload()
  await expect(first.getByLabel('Zielgruppe', { exact: true })).toHaveValue('')
  await expect(
    first.getByLabel('Neue Tabs automatisch zuordnen', { exact: true }),
  ).not.toBeChecked()
  await expect(first.getByLabel('URL-Muster', { exact: true })).toHaveCount(0)
})

test('renders the new icon and the group start page without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:6655/group-anchor.html?group=test')
  await expect(
    page.getByRole('heading', { name: 'Gruppe ohne Namen' }),
  ).toBeVisible()
  const icon = page.locator('main > img')
  await expect(icon).toHaveJSProperty('complete', true)
  expect(await icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await page.route('https://example.com/', route =>
    route.fulfill({ body: 'Group page opened', contentType: 'text/html' }),
  )
  await page
    .getByLabel('Seite in dieser Gruppe öffnen', { exact: true })
    .fill('example.com')
  await page.getByRole('button', { name: 'Seite öffnen', exact: true }).click()
  await expect(page).toHaveURL('https://example.com/')
})
