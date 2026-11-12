// 実行：node --test tests/pages.test.js
// HTMLとJSファイルの「つながり」の確認（ブラウザなし）。読み込みの速さと、版の印の付け忘れを防ぐ。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const pages = ["index.html", "shipping-fees.html"];
const scriptTags = html => [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);

test("すべての <script src> に版の印(?v=)が付き、全ファイルで同じ数字", () => {
  const versions = new Set();
  for (const page of pages) {
    const srcs = scriptTags(read(page)).map(a => a.match(/src="([^"]+)"/)?.[1]).filter(Boolean);
    assert.ok(srcs.length > 0, page);
    for (const src of srcs) {
      const m = src.match(/\?v=(\d+)$/);
      assert.ok(m, `${page}: ${src} に ?v= がない`);
      versions.add(m[1]);
      assert.ok(fs.existsSync(path.join(__dirname, "..", src.split("?")[0])), `${src} が存在しない`);
    }
  }
  assert.equal(versions.size, 1, `版の数字がそろっていない: ${[...versions]}`);
});

test("index.html：スクリプトはすべて defer（HTMLの表示を止めない）で、インラインJSを持たない", () => {
  const tags = scriptTags(read("index.html"));
  assert.ok(tags.length >= 3);
  for (const attrs of tags) {
    assert.match(attrs, /\bsrc=/, "インラインの<script>が残っている");
    assert.match(attrs, /\bdefer\b/);
  }
});

test("index.html：都道府県と商品の入力欄をHTMLに直書きしない（データから作る）", () => {
  const html = read("index.html");
  assert.ok(!html.includes("<option>北海道</option>"));
  assert.ok(!html.includes('id="a"'));
});
