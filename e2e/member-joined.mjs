/**
 * E2E check for "owner/admin gets no notification when a member joins".
 *
 * Two members are already sitting in the room; a third existing member opens
 * it in another session. Everyone already there should get a visible toast and
 * a system line in the chat transcript — previously the only signal was a
 * presence dot quietly turning green.
 *
 * Requires backend + frontend running and playwright installed globally.
 * Run:  node e2e/member-joined.mjs
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

const USERS = ['owner', 'admin', 'latecomer'].map((n) => ({
  role: n,
  username: `mj_${n}_${STAMP}`,
  email: `mj_${n}_${STAMP}@test.local`,
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

    const token = await csrf(pages[0]);
    const room = JSON.parse(
      await pages[0].evaluate(
        async ([api, c]) => {
          const r = await fetch(`${api}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': c },
            credentials: 'include',
            body: JSON.stringify({ name: `member-joined-${Date.now()}` }),
          });
          return await r.text();
        },
        [API, token],
      ),
    ).room;

    // Everyone is an existing member up front — this is deliberately NOT a
    // join-request flow, it's plain presence on a member who already belongs.
    for (let i = 1; i < pages.length; i++) {
      const c = await csrf(pages[i]);
      await pages[i].evaluate(
        async ([api, code, tk]) => {
          await fetch(`${api}/api/rooms/join/${code}`, {
            headers: { 'X-CSRF-Token': tk },
            credentials: 'include',
          });
        },
        [API, room.joinCode, c],
      );
    }
    console.log(`Room ${room._id}: all three are already members\n`);

    // Owner opens the room alone first.
    await pages[0].goto(`${CLIENT}/room/${room._id}`);
    await pages[0].waitForSelector('.monaco-editor .view-lines', { timeout: 45000 });
    await sleep(1500);

    check(
      (await pages[0].locator('[data-testid="room-toast"]').count()) === 0,
      'owner alone in the room sees no join toast',
    );

    // Admin arrives — the owner should already be told about this one.
    await pages[1].goto(`${CLIENT}/room/${room._id}`);
    await pages[1].waitForSelector('.monaco-editor .view-lines', { timeout: 45000 });
    await sleep(2000);

    check(
      (await pages[0]
        .locator(`[data-testid="room-toast"]:has-text("${USERS[1].username}")`)
        .count()) > 0,
      'owner is notified when the admin arrives',
    );

    // Baseline for the main assertion: nobody has heard about the latecomer.
    for (let i = 0; i < 2; i++) {
      const before = await pages[i]
        .locator(`[data-testid="room-toast"]:has-text("${USERS[2].username}")`)
        .count();
      check(before === 0, `${USERS[i].role} has no toast for the latecomer before they arrive`);
    }

    // The latecomer — an existing member — opens the room in another session.
    console.log('\nLatecomer opens the room…\n');
    await pages[2].goto(`${CLIENT}/room/${room._id}`);
    await pages[2].waitForSelector('.monaco-editor .view-lines', { timeout: 45000 });
    await sleep(2500);

    const late = USERS[2].username;

    // Check the toasts on BOTH pages up front — they auto-dismiss, so doing
    // the slower chat assertions in between would let the second page's toast
    // expire and fail for the wrong reason.
    for (let i = 0; i < 2; i++) {
      // Scoped to the toast container, NOT a bare text match: the latecomer's
      // name also appears as a remote cursor label inside the editor, which
      // would make a loose locator pass for the wrong reason.
      const toast = pages[i].locator(`[data-testid="room-toast"]:has-text("${late}")`);
      check((await toast.count()) > 0, `${USERS[i].role} sees a join toast naming ${late}`);
      await pages[i].screenshot({ path: `e2e-toast-${USERS[i].role}.png` });
    }

    for (let i = 0; i < 2; i++) {
      const page = pages[i];
      const role = USERS[i].role;

      await page.getByRole('button', { name: 'Chat' }).click();
      await sleep(400);
      const systemLine = page.locator(`text=${late} joined the room`);
      check(
        (await systemLine.count()) > 0,
        `${role} has a "joined the room" line in the chat transcript`,
      );

      await page.screenshot({ path: `e2e-chat-${role}.png` });
    }

    // The person who joined should not be told about their own arrival.
    const selfToast = await pages[2].locator(`text=${late} joined the room`).count();
    check(selfToast === 0, 'the joiner is not notified about themselves');

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
