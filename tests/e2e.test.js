// ブラウザ(画面のないChromium)で実際にページを開いて動かすテスト。スマホの幅も確かめる。
// 実行：npm run test:e2e   （初回だけ：npm install && npx playwright install chromium）
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const INDEX_URL = pathToFileURL(path.join(__dirname, "..", "index.html")).href;
const FEES_URL = pathToFileURL(path.join(__dirname, "..", "shipping-fees.html")).href;

// 確かめるスマホの幅。320pxは小さめのスマホ、375・390pxは一般的なiPhone。
const PHONES = [
  { name: "幅320px(小さめのスマホ)", width: 320, height: 568 },
  { name: "幅375px(iPhone SE/8)", width: 375, height: 667 },
  { name: "幅390px(iPhone 13/14)", width: 390, height: 844 }
];
const MIN_TAP_PX = 44; // 指で押しやすい大きさの目安(AppleのHuman Interface Guidelines)

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

// スマホのように、タッチ操作・画面の向きの設定つきでページを開く。
async function openPage(url, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const problems = [];   // ページのエラー(JSの例外・読み込み失敗)
  const alerts = [];     // 画面に出たalert(エラー文)
  page.on("pageerror", error => problems.push(error.message));
  page.on("console", message => { if (message.type() === "error") problems.push(message.text()); });
  page.on("dialog", dialog => { alerts.push(dialog.message()); dialog.dismiss(); });
  await page.goto(url);
  return { page, context, problems, alerts };
}

// 入力欄に値を入れて「計算する」を指で押す。
async function fillAndCalculate(page, { prefecture = "東京都", rice = {}, flour, bran, book } = {}) {
  await page.selectOption("#destPrefecture", prefecture);
  for (const [id, kg] of Object.entries(rice)) await page.fill(`#${id}`, String(kg));
  if (flour !== undefined) await page.fill("#riceFlourWeight", String(flour));
  if (bran !== undefined) await page.fill("#riceBranWeight", String(bran));
  if (book !== undefined) await page.fill("#bookCount", String(book));
  await page.tap(".calc");
}

const text = (page, selector) => page.textContent(selector);

for (const phone of PHONES) {
  test(`${phone.name}：横にはみ出さず、タブが1行に収まって押しやすい`, async () => {
    const { page, context, problems } = await openPage(INDEX_URL, phone);
    try {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= phone.width, `横幅 ${scrollWidth}px が画面 ${phone.width}px を超えている`);

      const tabs = await page.$$eval(".tab", list => list.map(el => {
        const r = el.getBoundingClientRect();
        return { label: el.textContent, top: Math.round(r.top), width: r.width, height: r.height, right: r.right };
      }));
      assert.equal(tabs.length, 3);
      assert.equal(new Set(tabs.map(t => t.top)).size, 1, "タブが2段に分かれている");
      for (const tab of tabs) {
        assert.ok(tab.height >= MIN_TAP_PX, `${tab.label}の高さ ${tab.height}px が小さい`);
        assert.ok(tab.width >= MIN_TAP_PX, `${tab.label}の幅 ${tab.width}px が小さい`);
        assert.ok(tab.right <= phone.width, `${tab.label}が画面の右にはみ出している`);
      }
      assert.deepEqual(problems, []);
    } finally { await context.close(); }
  });

  test(`${phone.name}：3つのタブとも、結果を表示してもはみ出さない`, async () => {
    const { page, context } = await openPage(INDEX_URL, phone);
    try {
      for (const mode of ["normal", "simple", "limited"]) {
        await page.tap(`#tab-${mode}`);
        // 一番長い表示が出るように、お米3kg以上(期間限定版では送料無料の表示になる)で計算する。
        await fillAndCalculate(page, { rice: { a: 3, b: 3, c: 3, d: 3, e: 3, f: 3 }, flour: 12345, bran: 5000, book: 999 });
        const overflow = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const wide = [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > width + 0.5);
          return { scrollWidth: document.documentElement.scrollWidth, width, wide: wide.map(el => el.id || el.className || el.tagName) };
        });
        assert.ok(overflow.scrollWidth <= overflow.width, `${mode}：横にはみ出している ${JSON.stringify(overflow)}`);
        assert.deepEqual(overflow.wide, [], `${mode}：画面の外に出ている部品がある`);
      }
    } finally { await context.close(); }
  });

  test(`${phone.name}：送料一覧ページが横にはみ出さない`, async () => {
    const { page, context, problems } = await openPage(FEES_URL, phone);
    try {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollWidth <= phone.width, `横幅 ${scrollWidth}px が画面 ${phone.width}px を超えている`);
      assert.deepEqual(problems, []);
    } finally { await context.close(); }
  });
}

test("スマホ：ボタン(計算する・クリア)が押しやすい大きさ", async () => {
  const { page, context } = await openPage(INDEX_URL, PHONES[0]);
  try {
    for (const selector of [".calc", ".clear"]) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.height >= MIN_TAP_PX && box.width >= MIN_TAP_PX, `${selector} が小さい ${box.width}x${box.height}`);
    }
  } finally { await context.close(); }
});

test("起動：エラーなし。価格ラベル・初期のタブ・説明文が出る", async () => {
  const { page, context, problems } = await openPage(INDEX_URL);
  try {
    assert.deepEqual(problems, []);
    assert.equal(await text(page, 'label[for="a"]'), "商品A　1,850円/kg（税抜・消費税8%）");
    assert.equal(await text(page, 'label[for="bookCount"]'), "書籍　1,600円（税抜・消費税10%）");
    assert.equal(await page.getAttribute("#tab-normal", "aria-pressed"), "true");
    assert.equal(await page.getAttribute("#tab-limited", "aria-pressed"), "false");
    assert.match(await text(page, "#packagingNote"), /^送料：〜4\.5kg→1番/);
  } finally { await context.close(); }
});

test("普通計算：商品A 1.75kg・東京都 → 商品代3,496円＋送料610円", async () => {
  const { page, context, alerts } = await openPage(INDEX_URL);
  try {
    await fillAndCalculate(page, { rice: { a: 1.75 } });
    assert.equal(await text(page, "#productTotal"), "3,496円");
    assert.equal(await text(page, "#shippingTotal"), "610円");
    assert.equal(await text(page, "#total"), "4,106円");
    assert.equal(await text(page, "#shippingBand"), "（普通・1番）");
    assert.equal(await page.inputValue("#weight"), "1.75");
    assert.equal(await text(page, "#freeShippingNote"), "");
    assert.deepEqual(alerts, []);
  } finally { await context.close(); }
});

test("簡易包装計算：5kgまでは1番、5kg超は2番（普通計算と帯が違う）", async () => {
  const { page, context } = await openPage(INDEX_URL);
  try {
    await page.tap("#tab-simple");
    await fillAndCalculate(page, { rice: { a: 5 } });
    assert.equal(await text(page, "#shippingBand"), "（簡易包装・1番）");
    await page.fill("#a", "5.01");
    await page.tap(".calc");
    assert.equal(await text(page, "#shippingBand"), "（簡易包装・2番）");
  } finally { await context.close(); }
});

test("期間限定版：お米3kg以上で送料無料、2.99kgでは送料がかかる", async () => {
  const { page, context } = await openPage(INDEX_URL);
  try {
    await page.tap("#tab-limited");
    await fillAndCalculate(page, { rice: { a: 2.99 } });
    assert.equal(await text(page, "#shippingTotal"), "610円");
    assert.match(await text(page, "#freeShippingNote"), /合計重量 2\.99kg（3kg以上で無料）/);

    await page.fill("#a", "3");
    await page.tap(".calc");
    assert.equal(await text(page, "#shippingTotal"), "0円");
    assert.equal(await text(page, "#shippingBand"), "（期間限定・送料無料）");
    assert.equal(await text(page, "#total"), await text(page, "#productTotal"));
    assert.equal(await page.inputValue("#shipping"), "0");
  } finally { await context.close(); }
});

test("期間限定版：複数のお米を合計して3kg。米粉・書籍では無料にならない", async () => {
  const { page, context } = await openPage(INDEX_URL);
  try {
    await page.tap("#tab-limited");
    await fillAndCalculate(page, { rice: { a: 1, b: 1, c: 1 } });
    assert.equal(await text(page, "#shippingTotal"), "0円");

    await page.tap("#tab-limited"); // 同じタブを押しても結果は変わらない
    await page.fill("#b", "0");
    await page.fill("#c", "0");
    await page.fill("#riceFlourWeight", "5000");
    await page.fill("#bookCount", "10");
    await page.tap(".calc");
    // 商品A 1kg ＋ 米粉5kg ＝ 6kg なので、4.5kg超〜10kgの「2番」の送料（無料にはならない）
    assert.equal(await text(page, "#shippingTotal"), "854円");
    assert.equal(await text(page, "#shippingBand"), "（期間限定・2番）");
  } finally { await context.close(); }
});

test("タブを切り替えると、古い結果が消える。入力は残る", async () => {
  const { page, context } = await openPage(INDEX_URL);
  try {
    await fillAndCalculate(page, { rice: { a: 3 } });
    assert.notEqual(await text(page, "#total"), "0円");
    await page.tap("#tab-limited");
    assert.equal(await text(page, "#total"), "0円");
    assert.equal(await page.inputValue("#a"), "3");
    assert.equal(await page.getAttribute("#tab-limited", "aria-pressed"), "true");
    assert.equal(await page.getAttribute("#tab-normal", "aria-pressed"), "false");
  } finally { await context.close(); }
});

test("入力を変えると、計算し直すまで古い結果が消える。クリアで全部空に戻る", async () => {
  const { page, context } = await openPage(INDEX_URL);
  try {
    await fillAndCalculate(page, { rice: { a: 1 } });
    await page.fill("#a", "2");
    assert.equal(await text(page, "#total"), "0円");

    await fillAndCalculate(page, { rice: { a: 1 }, book: 1 });
    await page.tap(".clear");
    assert.equal(await page.inputValue("#a"), "");
    assert.equal(await page.inputValue("#bookCount"), "");
    assert.equal(await page.inputValue("#destPrefecture"), "");
    assert.equal(await text(page, "#total"), "0円");
  } finally { await context.close(); }
});

test("エラー：画面に分かりやすい文章が出て、結果は0円に戻る", async () => {
  const { page, context, alerts } = await openPage(INDEX_URL);
  try {
    await page.tap(".calc");
    assert.deepEqual(alerts.splice(0), ["商品の数量を入力してください"]);

    await page.fill("#a", "1");
    await page.tap(".calc");
    assert.deepEqual(alerts.splice(0), ["配送先都道府県を選んでください"]);

    await page.selectOption("#destPrefecture", "東京都");
    await page.fill("#a", "25");
    await page.tap(".calc");
    assert.match(alerts.splice(0)[0], /24kgを超えています/);
    assert.equal(await text(page, "#total"), "0円");

    await page.fill("#a", "1.234");
    await page.tap(".calc");
    assert.match(alerts.splice(0)[0], /小数第2位まで/);

    await page.fill("#a", "1");
    await page.fill("#bookCount", "1000");
    await page.tap(".calc");
    assert.match(alerts.splice(0)[0], /999個まで/);
  } finally { await context.close(); }
});

test("書籍だけの注文：重さ0kgで最小の送料。書籍は10%", async () => {
  const { page, context } = await openPage(INDEX_URL);
  try {
    await fillAndCalculate(page, { book: 2 });
    assert.equal(await text(page, "#bookTotal"), "3,520円");
    assert.equal(await text(page, "#shippingBand"), "（普通・1番）");
    assert.equal(await page.inputValue("#weight"), "0");
  } finally { await context.close(); }
});

test("送料一覧ページ：全グループの表と、3つの包装の説明が出る", async () => {
  const { page, context, problems } = await openPage(FEES_URL);
  try {
    assert.equal(await page.locator("#feeRows tr").count(), 12);   // 6グループ × 2行
    assert.equal(await page.locator("#bandHeader th").count(), 4);
    const notes = await page.$$eval("#ruleNotes li", items => items.map(li => li.textContent));
    assert.equal(notes.length, 3);
    assert.match(notes[1], /^簡易包装計算：.*（4番は使わない）/);
    assert.match(notes[2], /^期間限定版：.*ただしお米（商品A〜F）の合計重量が3kg以上なら送料無料/);
    assert.deepEqual(problems, []);
  } finally { await context.close(); }
});

test("入力欄はデータから作られる：都道府県47件、入力欄9つ（単位と刻み付き）、エラーなし", async () => {
  const { page, context, problems } = await openPage(INDEX_URL);
  try {
    assert.equal(await page.$$eval("#destPrefecture option", list => list.length), 48); // 先頭の「選択してください」＋47
    const fields = await page.$$eval("#inputFields .item", items => items.map(item => ({
      id: item.querySelector("input").id, step: item.querySelector("input").step, text: item.textContent
    })));
    assert.deepEqual(fields.map(f => f.id), ["a", "b", "c", "d", "e", "f", "riceFlourWeight", "riceBranWeight", "bookCount"]);
    assert.deepEqual(fields.map(f => f.step), ["0.01", "0.01", "0.01", "0.01", "0.01", "0.01", "1", "1", "1"]);
    assert.match(fields[0].text, /商品A　1,850円\/kg（税抜・消費税8%）\s*kg$/);
    assert.match(fields[8].text, /書籍　1,600円（税抜・消費税10%）\s*個$/);
    assert.deepEqual(problems, []);
  } finally { await context.close(); }
});

test("計算したあと入力を変えると、古い結果が消える（あとから作った入力欄でも動く）", async () => {
  const { page, context } = await openPage(INDEX_URL);
  try {
    await fillAndCalculate(page, { rice: { a: 1 } });
    assert.notEqual(await text(page, "#total"), "0円");
    await page.fill("#a", "2");
    assert.equal(await text(page, "#total"), "0円");
    await fillAndCalculate(page, { rice: { a: 1 } });
    await page.selectOption("#destPrefecture", "沖縄県");
    assert.equal(await text(page, "#total"), "0円");
  } finally { await context.close(); }
});
