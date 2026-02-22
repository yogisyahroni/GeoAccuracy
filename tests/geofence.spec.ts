import { test, expect } from '@playwright/test';

test.describe('Geofencing / Areas Flow', () => {
    // Use a simulated logged-in state or perform login before testing protected routes
    test.beforeEach(async ({ page }) => {
        // Generate a unique email block for testing preventing duplicate states
        const uniqueId = Date.now();
        const testEmail = `testuser${uniqueId}@example.com`;
        const testPass = 'Password123!';

        // Register & Login first to access protected Route /areas
        await page.goto('/register');
        await page.fill('input[type="text"]', 'E2E Area Test User');
        await page.fill('input[type="email"]', testEmail);
        await page.fill('input[type="password"]', testPass);
        await page.click('button[type="submit"]');

        await page.waitForURL(/\/dashboard|\/login/);

        if (page.url().includes('/login')) {
            await page.fill('input[type="email"]', testEmail);
            await page.fill('input[type="password"]', testPass);
            await page.click('button[type="submit"]');
            await page.waitForURL(/\/dashboard/);
        }
    });

    test('should load the Areas page and display the map container', async ({ page }) => {
        // Navigate to Areas directly
        await page.goto('/areas');

        // Wait for the Geofencing heading
        const heading = page.locator('h1', { hasText: /Geofenc/i }).first();
        await expect(heading).toBeVisible({ timeout: 10000 });

        // Assuming the Geofencing page has a map container with class .leaflet-container or similar Map element
        // We check for some Map wrapper or button indicating Area Drawing
        const mapContainer = page.locator('.leaflet-container');
        await expect(mapContainer).toBeVisible({ timeout: 10000 });

        // Check if the "Create Area" or similar button is visible
        const createBtn = page.locator('button', { hasText: /Create/i }).first();
        // It might be enabled or disabled depending on polygon drawn, but it should be present.
        await expect(createBtn).toBeVisible();
    });
});
