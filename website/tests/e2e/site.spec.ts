import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const ROUTES = ['/', '/docs', '/docs/config', '/docs/commands', '/docs/keys', '/changelog'] as const;

/** Console errors and any request that leaves this origin (the site must load nothing from elsewhere). */
function watch(page: Page, baseURL: string | undefined) {
    const origin = new URL(baseURL ?? 'http://localhost:4173').host;
    const errors: string[] = [];
    const foreign: string[] = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('request', (req) => {
        const url = new URL(req.url());
        if (url.protocol !== 'data:' && url.host !== origin) foreign.push(req.url());
    });
    return { errors, foreign };
}

for (const route of ROUTES) {
    test(`${route} renders, has one h1, loads nothing from elsewhere and has no console errors`, async ({ page, baseURL }) => {
        const seen = watch(page, baseURL);
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        await expect(page.locator('h1')).toHaveCount(1);
        await page.waitForLoadState('networkidle');
        expect(seen.foreign).toEqual([]);
        expect(seen.errors).toEqual([]);
    });

    test(`${route} has no serious accessibility violations`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        // The dashboard frames are Kestrel's real output (its own dim colours included), aria-hidden with a text
        // alternative: a reproduction of the terminal, like a screenshot, so they are not recoloured to pass.
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[data-terminal-frame]').analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
}

test('an unknown page is a real 404', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('the hero replays the real dashboard, one frame a second', async ({ page }) => {
    await page.goto('/');
    // It only plays while on screen (it pauses when scrolled away), so bring it into view.
    await page.getByText('Rendered by Kestrel').scrollIntoViewIfNeeded();
    const status = page.locator('[aria-live="polite"]', { hasText: /live · \d+\/30/ });
    await expect(status).toBeVisible({ timeout: 10_000 });
    const first = await status.textContent();
    await expect.poll(async () => status.textContent(), { timeout: 5_000 }).not.toBe(first);
});

test('with reduced motion the hero holds still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByText('paused', { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('the colour and width controls switch to real captures', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('switch', { name: /Colour/ }).press('Space');
    await expect(page.getByText('NO_COLOR mode')).toBeVisible();
    await page.getByRole('switch', { name: /Colour/ }).press('Space');
    await page.getByRole('slider', { name: 'Terminal width' }).press('ArrowRight');
    await expect(page.getByText('kestrel pm — myapp — 150×34')).toBeVisible();
});

test('install tabs follow the tabs pattern and copy with a toast', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    const tabs = page.getByRole('tablist', { name: 'Install with' }).first();
    await tabs.getByRole('tab', { name: 'npm' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'npx' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Copy: npx kestrel-tui' }).first().click();
    await expect(page.getByText('Command copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npx kestrel-tui');
});

test('⌘K searches the docs and takes you to the result', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByRole('dialog').getByRole('textbox');
    await expect(input).toBeFocused();
    await input.fill('readiness');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/docs\/config#readiness$/);
});

test('? lists the shortcuts', async ({ page }) => {
    await page.goto('/docs');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});

test('pressing a key on the keys page finds it', async ({ page }) => {
    await page.goto('/docs/keys');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('x');
    await expect(page.getByText('is highlighted below.')).toBeVisible();
    await expect(page.locator('tr[data-lit="true"]').first()).toBeVisible();
});
