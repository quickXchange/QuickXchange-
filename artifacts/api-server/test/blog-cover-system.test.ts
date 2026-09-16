import assert from "node:assert/strict";
import test from "node:test";
import { generateCover, detectCategory, detectAssets } from "../src/lib/blog-cover-system";

test("blog cover system detects category based on text", () => {
  assert.equal(detectCategory("Bitcoin hits new high"), "asset");
  assert.equal(detectCategory("How to trade crypto", "Guides"), "guides");
  assert.equal(detectCategory("Security alert for wallets"), "security");
  assert.equal(detectCategory("Swap ETH for USDC"), "swap");
  assert.equal(detectCategory("Weekly market analysis"), "news");
  assert.equal(detectCategory("General announcement"), "default");
});

test("blog cover system detects assets", () => {
  assert.deepEqual(detectAssets("Bitcoin hits new high"), ["BTC"]);
  assert.deepEqual(detectAssets("How to trade eth for usdc"), ["ETH", "USDC"]);
  assert.deepEqual(detectAssets("Nothing here"), []);
});

test("blog cover system generates SVG strings deterministically", () => {
  const result1 = generateCover({
    title: "Bitcoin hits new high",
    category: "News",
  });
  
  const result2 = generateCover({
    title: "Bitcoin hits new high",
    category: "News",
  });

  const result3 = generateCover({
    title: "Bitcoin hits new high!", // slightly different
    category: "News",
  });

  assert.ok(result1.svg.includes("<svg"));
  assert.ok(result1.svg.includes("Bitcoin hits new high"));
  assert.ok(result1.svg.includes("f7931a")); // BTC color
  assert.equal(result1.template, "news");
  assert.deepEqual(result1.detectedAssets, ["BTC"]);
  
  // Determinism check
  assert.equal(result1.svg, result2.svg);
  assert.notEqual(result1.svg, result3.svg);
});

test("blog cover system generates different layouts", () => {
  const news = generateCover({ title: "Weekly Market Report" });
  assert.equal(news.template, "news");
  assert.ok(news.svg.includes("rect")); // News layout uses rect bars
  
  const guides = generateCover({ title: "How to use our exchange" });
  assert.equal(guides.template, "guides");
  assert.ok(guides.svg.includes("line")); // Guides layout uses lines

  const swap = generateCover({ title: "Swap tokens easily" });
  assert.equal(swap.template, "swap");
});

test("blog cover system embeds required brand marks and formatting", () => {
  const result = generateCover({
    title: "A very long title that should wrap into multiple lines on the cover",
    category: "Educational",
  });
  
  // Brand mark
  assert.ok(result.svg.includes("QuickXchange"));
  assert.ok(result.svg.includes("EDITORIAL") || result.svg.includes("EDUCATIONAL"));
  
  // Output format
  assert.ok(Buffer.isBuffer(result.buffer));
});
