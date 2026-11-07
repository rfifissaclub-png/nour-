import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/prisma';
import { hashPin } from '../src/lib/auth/pin';
import { hashAdminPassword } from '../src/lib/auth/password';
import type { Role } from '../src/lib/auth/constants';
const origin = 'http://127.0.0.1:3100';
const created: string[] = [];
const adminPassword = 'Integration-Admin-Password-2026';
async function account(role: Role = 'STUDENT', extra: { isActive?: boolean; phone?: string } = {}) {
  const user = await db().user.create({ data: { codeId: `NOUR-${randomUUID().replaceAll('-', '').slice(0, 20)}`.toUpperCase(), fullName: 'Compte de test', role, pin: await hashPin('0123'), passwordHash: role === 'ADMIN' ? await hashAdminPassword(adminPassword) : null, ...extra } });
  created.push(user.id); return user;
}
test.beforeAll(() => { if (process.env.NOUR_TEST_DATABASE !== '1') throw new Error('Use a dedicated test database and set NOUR_TEST_DATABASE=1'); });
test.afterAll(async () => {
  if (created.length) await db().user.deleteMany({ where: { id: { in: created } } });
  await db().$disconnect();
});
test('anonymous access redirects; login is responsive and PIN supports paste', async ({ page, request }) => {
  const response = await request.get('/admin/dashboard', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain('/login');
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /Heureux/ })).toBeVisible();
  await page.getByRole('button', { name: 'Afficher le code secret' }).click();
  await page.getByRole('button', { name: 'Masquer le code secret' }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '/tmp/nour-login-desktop.png', fullPage: true, caret: 'initial' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#secret').fill('0123');
  await expect(page.locator('#secret')).toHaveValue('0123');
  await page.getByRole('button', { name: 'Afficher le code secret' }).click();
  await expect(page.locator('#secret')).toHaveAttribute('type', 'text');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '/tmp/nour-login-mobile.png', fullPage: true, caret: 'initial' });
});
for (const [role, home] of [['ADMIN', '/admin/dashboard'], ['TEACHER', '/teacher/space'], ['STUDENT', '/student/home']] as const) {
  test(`${role} login, cross-role denial and logout revocation`, async ({ request, playwright }) => {
    const user = await account(role);
    if (role === 'ADMIN') {
      const pinLogin = await request.post('/api/auth/login', { headers: { Origin: origin }, data: { identifier: user.codeId, pin: '0123' } });
      expect(pinLogin.status()).toBe(401);
    }
    const response = await request.post('/api/auth/login', { headers: { Origin: origin }, data: role === 'ADMIN' ? { identifier: user.codeId, password: adminPassword } : { identifier: user.codeId, pin: '0123' } });
    expect(response.status()).toBe(200);
    expect((await response.json()).redirectTo).toBe(home);
    const cookie = response.headers()['set-cookie'];
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=lax');
    expect((await request.get(home)).status()).toBe(200);
    const forbidden = role === 'ADMIN' ? '/teacher/space' : '/admin/dashboard';
    const denied = await request.get(forbidden, { maxRedirects: 0 });
    expect(denied.status()).toBe(307); expect(denied.headers().location).toContain(home);
    expect((await request.get(role === 'ADMIN' ? '/api/teacher/example' : '/api/admin/example')).status()).toBe(403);
    expect((await request.post('/api/auth/logout', { headers: { Origin: origin } })).status()).toBe(200);
    const replay = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Cookie: cookie.split(';')[0] } });
    expect((await replay.get('/api/auth/session')).status()).toBe(401);
    await replay.dispose();
  });
}
test('phone login; block applies to an existing session and displays clean message', async ({ request }) => {
  const user = await account('STUDENT', { phone: '+212612345678' });
  expect((await request.post('/api/auth/login', { headers: { Origin: origin }, data: { identifier: '06 12 34 56 78', pin: '0123' } })).status()).toBe(200);
  await db().user.update({ where: { id: user.id }, data: { isActive: false } });
  const blocked = await request.get('/student/home', { maxRedirects: 0 });
  expect(blocked.status()).toBe(307); expect(blocked.headers().location).toContain('reason=blocked');
  expect(blocked.headers()['set-cookie']).toContain('Max-Age=0');
  const login = await request.post('/api/auth/login', { headers: { Origin: origin }, data: { identifier: user.codeId, pin: '0123' } });
  expect(login.status()).toBe(403); expect((await login.json()).message).toContain('administration');
});
test('shared phone never selects an arbitrary account', async ({ request }) => {
  await account('STUDENT', { phone: '+212622345678' });
  await account('TEACHER', { phone: '+212622345678' });
  const result = await request.post('/api/auth/login', { headers: { Origin: origin }, data: { identifier: '0622345678', pin: '0123' } });
  expect(result.status()).toBe(401);
});
test('cross-origin login/logout rejected; malformed input rejected; atomic limiter stops brute force', async ({ request }) => {
  const user = await account();
  const data = { identifier: user.codeId, pin: '9999' };
  expect((await request.post('/api/auth/login', { headers: { Origin: 'https://evil.example' }, data })).status()).toBe(403);
  expect((await request.post('/api/auth/logout', { headers: { Origin: 'https://evil.example' } })).status()).toBe(403);
  expect((await request.post('/api/auth/login', { headers: { Origin: origin }, data: { identifier: {}, pin: 1234 } })).status()).toBe(400);
  const responses = await Promise.all(Array.from({ length: 7 }, () => request.post('/api/auth/login', { headers: { Origin: origin }, data })));
  expect(responses.filter(r => r.status() === 401)).toHaveLength(5);
  expect(responses.filter(r => r.status() === 429)).toHaveLength(2);
  expect(responses.find(r => r.status() === 429)?.headers()['retry-after']).toBeTruthy();
});
test('full browser login reaches student home', async ({ page }) => {
  const user = await account();
  await page.goto('/login');
  await page.getByLabel('Code ID ou téléphone').fill(user.codeId);
  await page.locator('#secret').fill('0123');
  await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
  await expect(page).toHaveURL(/\/student\/home$/);
  await expect(page.getByRole('heading', { name: /Salam/ })).toBeVisible();
});
test('administrator browser login accepts the long password in the unified secret field', async ({ page }) => {
  const user = await account('ADMIN');
  await page.goto('/login');
  await page.getByLabel('Code ID ou téléphone').fill(user.codeId);
  await page.locator('#secret').fill(adminPassword);
  await page.getByRole('button', { name: 'Accéder à mon espace' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole('heading', { name: /Bienvenue/ })).toBeVisible();
});
