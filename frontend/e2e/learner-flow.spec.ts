import { expect, test } from '@playwright/test'
import { E2E_LEARNER } from './accounts'

test('learner signs in, opens a path, marks a topic done and sees progress update', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(E2E_LEARNER.email)
  await page.getByLabel('Password').fill(E2E_LEARNER.password)
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
  await expect(progress).toHaveAttribute('aria-valuenow', '10')
  await expect(page.getByRole('list', { name: 'Status counts' })).toContainText('Done 1')

  // The home page now suggests the next topic.
  await page.keyboard.press('Escape')
  await page.goto('/')
  await expect(page.getByText('Up next')).toBeVisible()
})

test('Ctrl+K search opens a runbook', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(E2E_LEARNER.email)
  await page.getByLabel('Password').fill(E2E_LEARNER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')

  await page.keyboard.press('Control+k')
  await page.getByRole('combobox').fill('settlement batch')
  await page.getByRole('option', { name: /Settlement Batch Rerun/ }).click()
  await expect(page).toHaveURL(/\/runbooks\?open=\d+/)
  await expect(page.getByRole('dialog', { name: 'Settlement Batch Rerun' })).toBeVisible()
})
