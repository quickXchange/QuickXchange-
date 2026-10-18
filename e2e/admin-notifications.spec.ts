import { expect, test, type Page } from "@playwright/test";

type Item = { id: string; kind: string; title: string; message: string; orderId: string; orderType: "Swap" | "Convert"; createdAt: string; read: boolean };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const makeItem = (n: number): Item => ({
  id: id(n), kind: n === 2 ? "deposit" : n === 3 ? "status_change" : "new_order",
  title: n === 2 ? "Convert Payment Confirmed" : n === 3 ? "Convert Order Updated" : "New Swap Order",
  message: n === 2 ? `Verified payment received for order O-NOTIFY-${n}.` : `Order O-NOTIFY-${n} · AWAITING FUNDS`,
  orderId: `O-NOTIFY-${n}`, orderType: n === 2 || n === 3 ? "Convert" : "Swap",
  createdAt: new Date(Date.now() - n * 60000).toISOString(), read: n > 3,
});

async function fixture(page: Page, count = 5) {
  // The shared authenticated shell consumes attribution on every Admin mount.
  // A missing fixture creates an unrelated fixed error banner over the tabs.
  await page.route("**/api/account/affiliate/attribution", route => route.fulfill({ json: { status: "no_referral" } }));
  const state = { items: Array.from({ length: count }, (_, i) => makeItem(i + 1)), failRead: false, failList: false };
  await page.route("**/api/admin/notifications**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const suffix = url.pathname.split("/admin/notifications")[1];
    if (request.method() === "GET") {
      if (state.failList) return route.fulfill({ status: 503, json: { code: "TEST_UNAVAILABLE", error: "Synthetic inbox unavailable" } });
      const filter = url.searchParams.get("filter") || "all";
      const filtered = state.items.filter(item => filter === "all" || (filter === "read" ? item.read : !item.read));
      const pageNumber = Math.min(Number(url.searchParams.get("page") || 1), Math.max(1, Math.ceil(filtered.length / 20)));
      return route.fulfill({ json: {
        items: filtered.slice((pageNumber - 1) * 20, pageNumber * 20),
        allCount: state.items.length, unreadCount: state.items.filter(i => !i.read).length,
        readCount: state.items.filter(i => i.read).length, total: filtered.length, page: pageNumber, pageSize: 20,
      } });
    }
    if (state.failRead) return route.fulfill({ status: 503, json: { error: "Synthetic action failed" } });
    if (suffix === "/read-all") state.items.forEach(item => { item.read = true; });
    else {
      const notificationId = suffix.split("/")[1];
      if (request.method() === "DELETE") state.items = state.items.filter(item => item.id !== notificationId);
      else { const item = state.items.find(item => item.id === notificationId); if (item) item.read = true; }
    }
    await route.fulfill({ json: { success: true } });
  });
  return state;
}

test("notification filters, read actions, deletion and reload keep bell/counts synchronized", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin/notifications");
  await expect(page.getByTestId("badge-admin-unread")).toHaveText("3");
  await expect(page.locator(".qxn-item")).toHaveCount(5);
  await page.getByTestId(`button-inbox-read-${id(1)}`).click();
  await expect(page.getByTestId("badge-admin-unread")).toHaveText("2");
  await page.getByTestId("tab-inbox-read").click();
  await expect(page.locator(".qxn-item")).toHaveCount(3);
  await page.getByTestId("tab-inbox-unread").click();
  await expect(page.locator(".qxn-item")).toHaveCount(2);
  await page.getByTestId("button-mark-all-read").click();
  await expect(page.getByTestId("state-inbox-empty")).toBeVisible();
  await expect(page.getByTestId("badge-admin-unread")).toHaveCount(0);
  await page.getByTestId("tab-inbox-all").click();
  await page.getByTestId(`button-inbox-delete-${id(1)}`).click();
  await expect(page.locator(".qxn-item")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".qxn-item")).toHaveCount(4);
  await expect(page.getByTestId(`row-inbox-${id(1)}`)).toHaveCount(0);
});

test("order notification marks read and navigates to its exact order", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/admin/notifications");
  await page.getByTestId(`link-inbox-order-${id(2)}`).click();
  await expect(page).toHaveURL(/\/admin\/orders\/O-NOTIFY-2$/);
  expect(state.items.find(item => item.id === id(2))?.read).toBe(true);
});

test("failed read leaves order unopened and displays an actionable error", async ({ page }) => {
  const state = await fixture(page);
  state.failRead = true;
  await page.goto("/admin/notifications");
  await page.getByTestId(`link-inbox-order-${id(2)}`).click();
  await expect(page.getByTestId("text-inbox-action-error")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/notifications$/);
  expect(state.items[1].read).toBe(false);
});

test("loading and failed requests never show fabricated zero counts and retry recovers", async ({ page }) => {
  const state = await fixture(page);
  state.failList = true;
  // Hold initial requests long enough to inspect the real loading state.
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/notifications**", async route => {
    await gate;
    await route.fallback();
  });
  await page.goto("/admin/notifications");
  await expect(page.locator(".qxn-skel").first()).toBeVisible();
  await expect(page.locator(".qxn-count")).toHaveText(["—", "—", "—"]);
  await expect(page.getByTestId("badge-admin-unread")).toHaveCount(0);
  release();
  await expect(page.getByTestId("state-inbox-error")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("badge-admin-unknown")).toBeVisible();
  await expect(page.locator(".qxn-count")).toHaveText(["—", "—", "—"]);
  state.failList = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".qxn-count")).toHaveText(["5", "3", "2"]);
  await expect(page.getByTestId("badge-admin-unread")).toHaveText("3", { timeout: 20000 });
  await expect(page.getByTestId("badge-admin-unknown")).toHaveCount(0);
});

test("failed background refresh does not present cached counts as current", async ({ page }) => {
  test.setTimeout(60000);
  const state = await fixture(page);
  await page.goto("/admin/notifications");
  await expect(page.locator(".qxn-count")).toHaveText(["5", "3", "2"]);
  state.failList = true;
  await expect(page.getByTestId("state-inbox-error")).toBeVisible({ timeout: 35000 });
  await expect(page.locator(".qxn-count")).toHaveText(["—", "—", "—"]);
  await expect(page.getByTestId("badge-admin-unknown")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("badge-admin-unread")).toHaveCount(0);
});

test("pagination and automatic polling pick up new notifications", async ({ page }) => {
  const state = await fixture(page, 24);
  await page.goto("/admin/notifications");
  await expect(page.locator(".qxn-item")).toHaveCount(20);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".qxn-item")).toHaveCount(4);
  state.items.push(makeItem(25));
  state.items[state.items.length - 1].read = false;
  await expect(page.locator(".qxn-item")).toHaveCount(5, { timeout: 20000 });
  await expect(page.getByTestId("badge-admin-unread")).toHaveText("4");
});

for (const theme of ["light", "dark"]) {
  for (const mobile of [false, true]) {
    test(`${theme} ${mobile ? "mobile" : "desktop"} preserves readable responsive notification layout`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      await fixture(page);
      await page.goto("/admin/notifications");
      await expect(page.locator(".qxn-item")).toHaveCount(5);
      await page.evaluate(mode => document.documentElement.classList.toggle("dark", mode === "dark"), theme);
      await expect(page.getByTestId("link-admin-notifications")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await expect(page.locator(".qxn-kind").first()).toBeVisible();
      await expect(page.getByTestId(`icon-inbox-kind-${id(1)}`)).toHaveClass(/swap/);
      await expect(page.getByTestId(`icon-inbox-kind-${id(2)}`)).toHaveClass(/convert/);
      expect((await page.getByTestId(`row-inbox-${id(1)}`).boundingBox())!.height).toBeLessThan(85);
      await expect(page.getByTestId(`link-inbox-order-${id(1)}`)).toContainText("O-NOTIFY-1");
      const reference = page.getByTestId(`row-inbox-${id(1)}`).locator(".qxn-ref");
      expect(await reference.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      if (mobile) await expect(reference).toHaveCSS("text-overflow", "clip");
      await expect(page.locator(".qxn-item p")).toHaveCount(0);
      await page.screenshot({ path: `test-results/admin-inbox-${theme}-${mobile ? "mobile" : "desktop"}.png`, fullPage: true });
    });
  }
}
