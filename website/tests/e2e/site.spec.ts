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

test('the hero is the name, with a CPU graph that moves once a second', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Kestrel: htop and pm2/ })).toBeVisible();
    const bars = page.locator('h1 svg:visible .wm-bar');
    const before = await bars.evaluateAll((els) => els.map((e) => `${e.getAttribute('x')},${e.getAttribute('y')}`).join());
    await expect.poll(async () => bars.evaluateAll((els) => els.map((e) => `${e.getAttribute('x')},${e.getAttribute('y')}`).join()), { timeout: 5_000 }).not.toBe(before);
});

/** The text of the dashboard frame on screen. */
const frameText = (page: Page) => page.locator('[data-terminal-frame]').first().innerText();

test('how it works replays the real dashboard, and the crash and its recovery', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 }); // below the pinned layout: the steps are plain tabs
    await page.goto('/');
    const tabs = page.getByRole('tablist', { name: 'How it works' });
    // The replay only plays while the section is on screen, so bring it into view.
    await tabs.scrollIntoViewIfNeeded();
    await tabs.getByRole('tab', { name: /Run it/ }).click();
    await expect(page.locator('[data-terminal-frame]')).toBeVisible();
    const first = await frameText(page);
    await expect.poll(() => frameText(page), { timeout: 5_000 }).not.toBe(first);
    await tabs.getByRole('tab', { name: /Crash & recover/ }).click();
    await expect.poll(() => frameText(page), { timeout: 10_000 }).toContain('[kestrel] crashed (code 1, signal null)');
    await expect(page.getByRole('button', { name: 'Crash it again' })).toBeVisible();
});

test('with reduced motion nothing plays: the hero graph and the dashboard hold still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto('/');
    const bars = page.locator('h1 svg:visible .wm-bar');
    const graph = await bars.evaluateAll((els) => els.length);
    await page.getByRole('tablist', { name: 'How it works' }).scrollIntoViewIfNeeded();
    await page.getByRole('tab', { name: /Crash & recover/ }).click();
    const still = await frameText(page);
    expect(still).toContain('retry');
    await page.waitForTimeout(2_500);
    expect(await frameText(page)).toBe(still);
    expect(graph).toBeGreaterThan(0);
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
    const input = page.getByRole('dialog').getByRole('combobox', { name: /search/i });
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
