import assert from "node:assert/strict";
import test from "node:test";
import { generatedArticleReviewPolicy, sortDiscoveredCandidates, sourceIdentity, sourceItems } from "../src/lib/blog-pipeline";
import { telegramNewsText } from "../src/lib/telegram-news";

test("official feed metadata keeps URL/GUID identity and chronological timestamps", () => {
  const items = sourceItems({
    rss: { channel: { item: [
      {
        title: "  Later story ",
        link: "https://cointelegraph.com/news/later",
        guid: "guid-later",
        pubDate: "Fri, 18 Sep 2026 12:00:00 +0000",
        description: "<p>Short <strong>feed</strong> summary.</p>",
      },
      {
        title: { "#text": "Earlier story" },
        link: { "@_href": "https://cointelegraph.com/news/earlier" },
        guid: { "#text": "guid-earlier" },
        published: "2026-09-18T11:00:00Z",
      },
    ] } },
  });
  assert.equal(items.length, 2);
  assert.equal(items[0]?.guid, "guid-later");
  assert.equal(items[0]?.summary, "Short feed summary.");
  assert.equal(items[1]?.url, "https://cointelegraph.com/news/earlier");
  assert.equal(items[1]?.publishedAt?.toISOString(), "2026-09-18T11:00:00.000Z");
});

test("ingestion sorts both feeds oldest-first with immutable source tie-breaks", () => {
  const coinDesk = { allowedHost: "www.coindesk.com" };
  const cointelegraph = { allowedHost: "cointelegraph.com" };
  const candidates = [
    { source: cointelegraph, item: { title: "Same time B", url: "https://cointelegraph.com/b", guid: "b", publishedAt: new Date("2026-09-18T11:00:00Z") } },
    { source: coinDesk, item: { title: "Later", url: "https://www.coindesk.com/later", guid: "later", publishedAt: new Date("2026-09-18T12:00:00Z") } },
    { source: coinDesk, item: { title: "Same time A", url: "https://www.coindesk.com/a", guid: "a", publishedAt: new Date("2026-09-18T11:00:00Z") } },
    { source: cointelegraph, item: { title: "Earlier", url: "https://cointelegraph.com/earlier", guid: "earlier", publishedAt: new Date("2026-09-18T10:00:00Z") } },
  ];
  const sorted = sortDiscoveredCandidates(candidates);
  assert.deepEqual(sorted.map((entry) => entry.item.title), ["Earlier", "Same time B", "Same time A", "Later"]);
  assert.equal(sourceIdentity(coinDesk, candidates[1].item), sourceIdentity(coinDesk, candidates[1].item));
  assert.notEqual(sourceIdentity(coinDesk, candidates[1].item), sourceIdentity(cointelegraph, candidates[1].item));
  assert.equal(
    sourceIdentity(coinDesk, { url: "https://www.coindesk.com/changed", guid: "later" }),
    sourceIdentity(coinDesk, { url: "https://www.coindesk.com/later", guid: "later" }),
  );
});

test("official generated articles remain review-first and cannot notify before review", () => {
  assert.deepEqual(generatedArticleReviewPolicy(), {
    status: "draft",
    autoPublish: false,
    enqueueNewsletter: false,
    enqueueTelegram: false,
  });
});

test("Telegram news posts escape publisher-controlled content and stay bounded", () => {
  process.env.PUBLIC_APP_URL = "https://quickxchange.net";
  const text = telegramNewsText({
    title: "<Breaking & update>",
    summary: "A concise original summary.",
    articleSlug: "breaking-update",
    sourceUrl: "https://coindesk.com/story?a=1&b=2",
    sourcePublisher: "CoinDesk",
  });
  assert.match(text, /&lt;Breaking &amp; update&gt;/);
  assert.match(text, /https:\/\/quickxchange.net\/blog\/breaking-update/);
  assert.match(text, /Source:/);
  assert.ok(text.length < 3901);
});