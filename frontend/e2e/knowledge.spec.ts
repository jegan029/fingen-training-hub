import { expect, test, type Page } from '@playwright/test'
import { E2E_ADMIN, E2E_LEARNER } from './accounts'

/*
 * ServiceNow knowledge in mock mode: the admin syncs the synthetic fixtures, then a learner with
 * the default internal clearance browses, filters, reads, downloads, and is refused a restricted
 * article by URL (404, so the API never confirms it exists).
 */
test.describe.configure({ mode: 'serial' })

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
}

let restrictedId = 0

test('admin syncs ServiceNow knowledge from the admin panel', async ({ page }) => {
  await signIn(page, E2E_ADMIN)
  await page.goto('/admin')
  await expect(page.getByText(/Mock mode: synthetic fixtures/)).toBeVisible()
  await page.getByRole('button', { name: 'Full sync' }).click()
  await expect(page.getByText(/Sync succeeded: 12 created/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('table').nth(2)).toContainText('Succeeded')

  const lookup = await page.request.get('/api/knowledge/articles/by-number/KB0010004')
  expect(lookup.ok()).toBe(true)
  restrictedId = (await lookup.json()).id
})

test('learner browses, filters, opens an article and downloads a document', async ({ page }) => {
  await signIn(page, E2E_LEARNER)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Knowledge' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Knowledge Library' })).toBeVisible()
  await expect(page.getByText('Showing 1 to 7 of 7 articles')).toBeVisible()
  // Nothing above internal is offered to this learner.
  const classification = page.getByRole('group', { name: 'Classification' })
  await expect(classification.getByRole('button')).toHaveText(['All', 'Internal4', 'Public3'])

  await classification.getByRole('button', { name: /Public/ }).click()
  await expect(page).toHaveURL(/classification=public/)
  await expect(page.getByText('Showing 1 to 3 of 3 articles')).toBeVisible()
  await classification.getByRole('button', { name: 'All' }).click()

  await page.getByLabel('Search articles').fill('posting failure')
  await expect(page.getByText('Showing 1 to 1 of 1 article')).toBeVisible()
  await page.getByRole('link', { name: 'Ledger Gateway posting failure' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Ledger Gateway posting failure' })).toBeVisible()
  await expect(page.getByText('Classification: Internal').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Ask the AI Tutor about this/ })).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download posting-flow.pdf' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('posting-flow.pdf')
})

test('learner cannot open a restricted article by URL', async ({ page }) => {
  expect(restrictedId).toBeGreaterThan(0)
  await signIn(page, E2E_LEARNER)

  const hidden = await page.request.get(`/api/knowledge/articles/${restrictedId}`)
  const missing = await page.request.get('/api/knowledge/articles/999999')
  expect(hidden.status()).toBe(404)
  expect(await hidden.json()).toEqual(await missing.json())

  await page.goto(`/knowledge/${restrictedId}`)
  await expect(page.getByText('Article not available')).toBeVisible()
  await expect(page.getByText('Card Switch key rotation')).toHaveCount(0)
})
