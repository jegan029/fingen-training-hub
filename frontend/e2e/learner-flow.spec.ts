import { expect, test } from '@playwright/test'
import { E2E_LEARNER } from './accounts'

test('learner signs in, opens a path, marks a topic done and sees progress update', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(E2E_LEARNER.email)
  await page.getByLabel('Password', { exact: true }).fill(E2E_LEARNER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Training Paths' }).click()
  await page.getByRole('link', { name: /Fingen Platform Core/ }).click()

  const progress = page.getByRole('progressbar', { name: 'Path progress' })
  await expect(progress).toHaveAttribute('aria-valuenow', '0')

  // Open the first topic from the roadmap and mark it done with the keyboard shortcut.
  await page.getByRole('button', { name: /^1\. / }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await expect(page).toHaveURL(/\?node=1$/)
  await page.keyboard.press('d')

  await expect(drawer.getByRole('button', { name: /Done/, pressed: true })).toBeVisible()
  // The completion moment is announced, and the next topic unlocks on the roadmap.
  await expect(drawer.getByRole('status').filter({ hasText: /marked done\. .+ unlocked\./ })).toBeAttached()
  await expect(page.getByRole('button', { name: /^2\. .*, Pending$/ })).toBeVisible()
  await expect(progress).toHaveAttribute('aria-valuenow', '10')
  await expect(page.getByRole('list', { name: 'Status counts' })).toContainText('Done 1')

  // The handover names the next topic and opens it in the same drawer.
  const second = (await page.getByRole('button', { name: /^2\. / }).getAttribute('aria-label'))!
  const secondTitle = second.replace(/^2\. /, '').replace(/, Pending$/, '')
  await expect(drawer).toContainText(`Next up: ${secondTitle}, now unlocked`)
  await drawer.getByRole('button', { name: /Open next topic/ }).click()
  await expect(page).toHaveURL(/\?node=2$/)
  await expect(drawer.getByRole('heading', { level: 2 })).toHaveText(secondTitle)
  await expect(drawer.getByRole('button', { name: 'Close' })).toBeFocused()

  // The home page now suggests the next topic.
  await page.keyboard.press('Escape')
  await page.goto('/')
  await expect(page.getByText('Up next')).toBeVisible()

  // In a short window an unlock lands below the fold: a cue offers to show it, and the page moves only on press.
  await page.setViewportSize({ width: 1280, height: 360 })
  await page.goto('/roadmaps/2')
  await page.getByRole('button', { name: /^1\. / }).click()
  await page.keyboard.press('d')
  await expect(page.getByRole('dialog').getByRole('button', { name: /Done/, pressed: true })).toBeVisible()
  // Closing returns focus to the topic just done; in this short window the topic it unlocked stays below.
  await page.keyboard.press('Escape')
  const cue = page.getByRole('button', { name: /unlocked Show$/ })
  await expect(cue).toBeVisible()
  await cue.click()
  await expect(page.getByRole('button', { name: /^2\. Authorisation & Limits, Pending$/ })).toBeFocused()
  await expect(cue).toBeHidden()
})

test('Ctrl+K search opens a runbook', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(E2E_LEARNER.email)
  await page.getByLabel('Password', { exact: true }).fill(E2E_LEARNER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  await page.keyboard.press('Control+k')
  await page.getByRole('combobox').fill('settlement batch')
  await page.getByRole('option', { name: /Settlement Batch Rerun/ }).click()
  await expect(page).toHaveURL(/\/runbooks\?open=\d+/)
  await expect(page.getByRole('dialog', { name: 'Settlement Batch Rerun' })).toBeVisible()
})
