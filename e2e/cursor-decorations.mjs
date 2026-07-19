/**
 * E2E regression check for "remote cursor decorations multiply instead of replace".
 *
 * The bug: MonacoEditor.jsx's onDidChangeModelContent listener blanked
 * `decorationsRef.current` before calling applyDecorations(). Monaco's
 * editor.deltaDecorations(oldIds, newDecorations) only *removes* the ids it is
 * handed, so an empty oldIds array turns every reapply into an insert-only
 * call — one extra colored bar + username label per keystroke, forever.
 *
 * This script drives three real browsers against the live dev server, has all
 * three type and move their cursors repeatedly, and asserts that each user's
 * username label appears at most once in every other user's editor.
 *
 * Requires (all must already be running / installed):
 *   - backend:  node src/server.js        (from /server)
 *   - frontend: npm run dev               (from /client)
 *   - playwright installed globally       (npm i -g playwright)
 *
 * Run:  node e2e/cursor-decorations.mjs
 *
 * Piston/Docker are NOT needed — this exercises no code execution.
 */
// Playwright is a *global* install here, not a project dependency, and ESM
// resolution ignores NODE_PATH — so fall back to an explicit path when the
// bare specifier can't be resolved. Override with PLAYWRIGHT_MODULE if your
// global npm prefix differs (`npm root -g` prints it).
const { chromium } = await (async () => {
  try {
    return await import('playwright');
  } catch {
    const globalRoot =
      process.env.PLAYWRIGHT_MODULE ??
      `${process.env.APPDATA ?? ''}/npm/node_modules/playwright/index.js`;
    // Loaded by absolute path, playwright's CJS exports land on `.default`
    // rather than being detected as named exports.
    const mod = await import(new URL(`file:///${globalRoot.replace(/\\/g, '/')}`).href);
    return mod.chromium ? mod : mod.default;
  }
})();

const CLIENT = process.env.CLIENT_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:5000';
const STAMP = Date.now();
const USERS = ['alpha', 'bravo', 'charlie'].map((n) => ({
  username: `cur_${n}_${STAMP}`,
  email: `cur_${n}_${STAMP}@test.local`,
  password: 'password123',
}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
}

/** Registers via the real API inside the page so the auth cookie lands in that context. */
async function registerInPage(page, user) {
  const res = await page.evaluate(
    async ([api, u]) => {
      const r = await fetch(`${api}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(u),
      });
      return { status: r.status, body: await r.text() };
    },
    [API, user],
  );
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`register ${user.username} failed: ${res.status} ${res.body}`);
  }
}

function csrfFrom(page) {
  return page.evaluate(() => {
    const m = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  });
}

async function createRoom(page, name) {
  const token = await csrfFrom(page);
  const res = await page.evaluate(
    async ([api, roomName, csrf]) => {
      const r = await fetch(`${api}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        credentials: 'include',
        body: JSON.stringify({ name: roomName }),
      });
      return { status: r.status, body: await r.text() };
    },
    [API, name, token],
  );
  if (res.status !== 201) throw new Error(`createRoom failed: ${res.status} ${res.body}`);
  return JSON.parse(res.body).room;
}

async function joinByCode(page, code) {
  const token = await csrfFrom(page);
  const res = await page.evaluate(
    async ([api, joinCode, csrf]) => {
      const r = await fetch(`${api}/api/rooms/join/${joinCode}`, {
        headers: { 'X-CSRF-Token': csrf },
        credentials: 'include',
      });
      return { status: r.status, body: await r.text() };
    },
    [API, code, token],
  );
  if (res.status !== 200) throw new Error(`joinByCode failed: ${res.status} ${res.body}`);
}

/** Waits for Monaco's editor surface to actually exist in the DOM. */
async function waitForEditor(page) {
  await page.waitForSelector('.monaco-editor .view-lines', { timeout: 45000 });
  await sleep(1500); // let the initial code:sync / seed settle
}

/**
 * Counts remote-cursor decorations per username via Monaco's model, which is
 * the source of truth. Do NOT count DOM nodes instead: Monaco can split one
 * injected-text label across several spans (producing phantom partial names
 * like "pr2c1784" / "287"), so DOM counts neither prove accumulation nor
 * disprove it.
 */
async function decorationCounts(page) {
  return page.evaluate(() => {
    const editor = window.monaco?.editor?.getEditors?.()[0];
    const model = editor?.getModel();
    if (!model) return {};
    const counts = {};
    for (const d of model.getAllDecorations()) {
      const desc = d.options?.description;
      if (typeof desc === 'string' && desc.startsWith('cursor-')) {
        const name = desc.slice('cursor-'.length);
        counts[name] = (counts[name] ?? 0) + 1;
      }
    }
    return counts;
  });
}

/**
 * Counts *rendered* cursor markers. A decoration existing on the model does
 * not mean Monaco painted it — injected text is dropped on collapsed ranges —
 * so visibility is checked separately from the count invariant.
 */
async function renderedMarkers(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[class*="rcu-l"], [class*="rcu-m"]'));
    const visible = nodes.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return { nodes: nodes.length, visible: visible.length };
  });
}

async function main() {
  const browser = await chromium.launch();
  const contexts = [];
  const pages = [];

  try {
    for (const user of USERS) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`  [page error ${user.username}] ${e.message}`));
      await page.goto(CLIENT);
      await registerInPage(page, user);
      contexts.push(ctx);
      pages.push(page);
    }
    console.log(`Registered ${USERS.length} users\n`);

    const room = await createRoom(pages[0], `cursor-test-${STAMP}`);
    await joinByCode(pages[1], room.joinCode);
    await joinByCode(pages[2], room.joinCode);
    console.log(`Room ${room._id} created, all three are members\n`);

    // Open the room STAGGERED, not all at once. Simultaneous first-joiners of
    // a brand-new room can both run the fresh-room seed (a known, separate OT
    // limitation) which desyncs the document and would mask the cursor
    // behaviour this script is actually here to check.
    for (const page of pages) {
      await page.goto(`${CLIENT}/room/${room._id}`);
      await waitForEditor(page);
    }
    console.log('All three editors mounted\n');

    // --- The actual stress: repeated cursor moves interleaved with typing ---
    // The old bug leaked one decoration per remote content change, so 12
    // rounds x 3 users produced dozens of stacked labels. Anything above 1
    // per user is a regression.
    const ROUNDS = 12;
    let worstSeen = 0;
    for (let round = 0; round < ROUNDS; round++) {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        await page.click('.monaco-editor .view-lines');
        // Move to a different line each round so the decoration must relocate,
        // not just be redrawn in place. `End` deliberately parks the cursor at
        // end-of-line, which is where injected text used to silently vanish.
        const line = 1 + ((round + i) % 5);
        await page.keyboard.press('Control+Home');
        for (let l = 1; l < line; l++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('End');
        await page.keyboard.type(`x${round}`);
      }
      await sleep(250);

      // Assert the invariant every round, not just at the end — accumulation
      // grows monotonically, so a mid-run spike must not be allowed to settle
      // back down and hide the regression.
      for (let i = 0; i < pages.length; i++) {
        const counts = await decorationCounts(pages[i]);
        for (const count of Object.values(counts)) {
          worstSeen = Math.max(worstSeen, count);
        }
      }
    }
    await sleep(2000); // let the last ops + cursor broadcasts settle
    console.log(`Completed ${ROUNDS} rounds of move+type from all three users`);
    check(worstSeen <= 1, `no user ever exceeded 1 decoration mid-run (peak was ${worstSeen})`);
    console.log('');

    for (let i = 0; i < pages.length; i++) {
      const counts = await decorationCounts(pages[i]);
      const rendered = await renderedMarkers(pages[i]);
      const me = USERS[i].username;
      console.log(`  ${me} sees: ${JSON.stringify(counts)}  rendered=${JSON.stringify(rendered)}`);

      check(!(me in counts), `${me} does not render its own cursor`);

      for (const [name, count] of Object.entries(counts)) {
        check(count <= 1, `${me} holds exactly one decoration for ${name} (got ${count})`);
      }

      const others = USERS.filter((_, j) => j !== i).map((u) => u.username);
      const seen = others.filter((o) => counts[o] === 1);
      check(
        seen.length === others.length,
        `${me} sees a cursor for both peers (saw ${seen.length}/${others.length})`,
      );

      // A decoration on the model that Monaco refuses to paint is invisible to
      // the user and therefore still a bug — check the pixels, not just state.
      check(
        rendered.visible === others.length,
        `${me} actually renders ${others.length} visible cursor label(s) (got ${rendered.visible})`,
      );
    }

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
