/**
 * E2E check for the join-request notification card.
 *
 * An outsider requests to join; the owner (sitting on the Dashboard, NOT in
 * the room) should get an actionable card and be able to accept from it
 * without navigating anywhere. A second admin's copy of the card should
 * disappear once the owner has dealt with it.
 *
 * Requires backend + frontend running and playwright installed globally.
 * Run:  node e2e/join-request-card.mjs
 */
const { chromium } = await (async () => {
  try {
    return await import('playwright');
  } catch {
    const globalRoot =
      process.env.PLAYWRIGHT_MODULE ??
      `${process.env.APPDATA ?? ''}/npm/node_modules/playwright/index.js`;
    const mod = await import(new URL(`file:///${globalRoot.replace(/\\/g, '/')}`).href);
    return mod.chromium ? mod : mod.default;
  }
})();

const CLIENT = process.env.CLIENT_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:5000';
const STAMP = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USERS = ['owner', 'admin', 'outsider'].map((n) => ({
  role: n,
  username: `jr_${n}_${STAMP}`,
  email: `jr_${n}_${STAMP}@test.local`,
  password: 'password123',
}));

const failures = [];
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
}

const csrf = (page) =>
  page.evaluate(() => {
    const m = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  });

async function registerInPage(page, user) {
  const status = await page.evaluate(
    async ([api, u]) => {
      const r = await fetch(`${api}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: u.username, email: u.email, password: u.password }),
      });
      return r.status;
    },
    [API, user],
  );
  if (status !== 201 && status !== 200) throw new Error(`register failed: ${status}`);
}

async function main() {
  const browser = await chromium.launch();
  const contexts = [];
  const pages = [];

  try {
    for (const user of USERS) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`  [page error ${user.role}] ${e.message}`));
      await page.goto(CLIENT);
      await registerInPage(page, user);
      contexts.push(ctx);
      pages.push(page);
    }
    const [ownerPage, adminPage, outsiderPage] = pages;

    const token = await csrf(ownerPage);
    const room = JSON.parse(
      await ownerPage.evaluate(
        async ([api, c]) => {
          const r = await fetch(`${api}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': c },
            credentials: 'include',
            body: JSON.stringify({ name: `card-room-${Date.now()}` }),
          });
          return await r.text();
        },
        [API, token],
      ),
    ).room;

    // Admin joins by code, then gets promoted so they also receive requests.
    const adminCsrf = await csrf(adminPage);
    await adminPage.evaluate(
      async ([api, code, tk]) => {
        await fetch(`${api}/api/rooms/join/${code}`, {
          headers: { 'X-CSRF-Token': tk },
          credentials: 'include',
        });
      },
      [API, room.joinCode, adminCsrf],
    );
    const adminId = JSON.parse(
      await adminPage.evaluate(async ([api]) => {
        const r = await fetch(`${api}/api/auth/me`, { credentials: 'include' });
        return await r.text();
      }, [API]),
    ).user._id;

    await ownerPage.evaluate(
      async ([api, roomId, uid, c]) => {
        await fetch(`${api}/api/rooms/${roomId}/admins`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': c },
          credentials: 'include',
          body: JSON.stringify({ userId: uid }),
        });
      },
      [API, room._id, adminId, token],
    );
    console.log(`Room ${room._id} ready: owner + promoted admin\n`);

    // Owner sits on the DASHBOARD, not in the room — the card must still work.
    await ownerPage.goto(`${CLIENT}/dashboard`);
    await adminPage.goto(`${CLIENT}/dashboard`);
    await sleep(1500);

    // Outsider requests to join.
    await outsiderPage.goto(`${CLIENT}/room/${room._id}`);
    await outsiderPage.getByRole('button', { name: /request to join/i }).click();
    await sleep(2000);

    const outsider = USERS[2].username;
    const ownerCard = ownerPage.locator('[data-testid="join-request-card"]');
    const adminCard = adminPage.locator('[data-testid="join-request-card"]');

    check((await ownerCard.count()) === 1, 'owner on the Dashboard gets a join-request card');
    check((await adminCard.count()) === 1, 'promoted admin gets the card too');
    check(
      (await ownerCard.filter({ hasText: outsider }).count()) === 1,
      'card names the requester',
    );
    check(
      (await ownerCard.filter({ hasText: room.name }).count()) === 1,
      'card names the room',
    );
    check(
      await ownerPage.getByRole('button', { name: 'Accept' }).isVisible(),
      'card offers an Accept button',
    );
    check(
      await ownerPage.getByRole('button', { name: 'Decline' }).isVisible(),
      'card offers a Decline button',
    );
    await ownerPage.screenshot({ path: 'e2e-card-owner.png' });

    // Accept straight from the card, without navigating into the room.
    await ownerPage.getByRole('button', { name: 'Accept' }).click();
    await sleep(1200);

    check(
      new URL(ownerPage.url()).pathname === '/dashboard',
      'accepting from the card does not navigate away',
    );
    check(
      (await ownerCard.filter({ hasText: 'is in' }).count()) === 1,
      'card confirms the acceptance in place',
    );
    await ownerPage.screenshot({ path: 'e2e-card-accepted.png' });

    // The admin's copy should vanish now that it has been handled elsewhere.
    check((await adminCard.count()) === 0, "admin's card clears once the owner accepts");

    // And the outsider should actually be in the room.
    await sleep(1500);
    const outsiderInRoom = await outsiderPage
      .locator('.monaco-editor .view-lines')
      .count()
      .catch(() => 0);
    check(outsiderInRoom > 0, 'accepted requester lands in the room editor');

    // Owner's card should clear itself shortly after.
    await sleep(1200);
    check((await ownerCard.count()) === 0, "owner's card clears itself after confirming");

    console.log('');
    if (failures.length) {
      console.log(`FAILED — ${failures.length} check(s):`);
      for (const f of failures) console.log(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log('ALL CHECKS PASSED');
    }
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
