import { expect, test } from '@playwright/test'
import { E2E_LEARNER } from './accounts'

test('a wrong password shows the generic error and stays on sign in', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(E2E_LEARNER.email)
  await page.getByLabel('Password', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid email or password. Please try again.')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

// Layout at the three breakpoints in both themes. Geometry is asserted (pixel baselines differ between
// Windows and the Linux CI fonts); the screenshots are attached to the report for review.
for (const [width, height] of [
  [1440, 900],
  [900, 1100],
  [390, 844],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`layout at ${width} px, ${scheme}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height })
      await page.goto('/login')
      const card = page.getByRole('heading', { name: 'Welcome back' })
      const brand = page.getByRole('region', { name: 'About FinGen Training Hub' })
      await expect(card).toBeVisible()

      const scroll = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - innerWidth,
        y: document.documentElement.scrollHeight - innerHeight,
      }))
      expect(scroll.x).toBe(0)

      const cardBox = (await card.boundingBox())!
      const brandBox = (await brand.boundingBox())!
      if (width >= 1024) {
        // Split screen with no page scroll: brand about 58% on the left, card in the right panel.
        expect(scroll.y).toBe(0)
        expect(brandBox.width / width).toBeGreaterThan(0.55)
        expect(brandBox.width / width).toBeLessThan(0.61)
        expect(cardBox.x).toBeGreaterThan(brandBox.x + brandBox.width)
        await expect(page.getByText('Guided learning roadmaps')).toBeVisible()
      } else if (width >= 768) {
        // Tablet: a band across the top; the card overlaps its lower edge.
        expect(brandBox.width).toBe(width)
        expect(cardBox.y).toBeLessThan(brandBox.y + brandBox.height)
        await expect(page.getByText('Become production ready, faster.')).toBeVisible()
        await expect(page.getByText('Guided learning roadmaps')).toBeHidden()
      } else {
        // Phone: the card alone, with only the logo above it.
        await expect(page.getByText('Become production ready, faster.')).toBeHidden()
        expect(cardBox.y).toBeLessThan(height)
      }
      await testInfo.attach(`login-${width}-${scheme}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    })
  }
}
