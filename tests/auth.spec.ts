import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {

    test('should allow a user to register and login', async ({ page }) => {
        // Generate a unique email block for testing preventing duplicate states
        const uniqueId = Date.now();
        const testEmail = `testuser${uniqueId}@example.com`;
        const testPass = 'Password123!';

        // Navigate to Register page
        await page.goto('/register');

        // Fill in registration form
        await page.fill('input[type="text"]', 'E2E Test User');
        await page.fill('input[type="email"]', testEmail);
        await page.fill('input[type="password"]', testPass);

        // Submit
        await page.click('button[type="submit"]');

        // Should redirect to login (or dashboard directly depending on implementation)
        // Assuming UI pushes to login on successful registration or logs in directly.
        await page.waitForURL(/\/dashboard|\/login/);

        // If redirected to login, perform login.
        if (page.url().includes('/login')) {
            await page.fill('input[type="email"]', testEmail);
            await page.fill('input[type="password"]', testPass);
            await page.click('button[type="submit"]');
            await page.waitForURL(/\/dashboard/);
        }

        // Verify successful login by checking dashboard element
        await expect(page.locator('h1').filter({ hasText: /Dashboard|Overview/i })).toBeVisible({ timeout: 10000 });
    });

    test('should show error on invalid login', async ({ page }) => {
        await page.goto('/login');

        await page.fill('input[type="email"]', 'wrong@example.com');
        await page.fill('input[type="password"]', 'WrongPass123!');
        await page.click('button[type="submit"]');

        // Expecting some error message to be visible
        await expect(page.locator('text=Invalid email or password')).toBeVisible();
    });

});
