// 実行：node --test tests/calc.test.js
// shipping-fees.js と calc.js を、ブラウザと同じ順番で読み込んでテストする（画面は使わない）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({});
for (const file of ["shipping-fees.js", "calc.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
}
const {
  calcInvoice, parseAmount, taxIncludedYen, getShippingColumn, lookupShippingFee, formatYen,
  describePackagingRule, describeFreeShipping, packagingTitle,
  packagingModes, shippingFees, prefectureGroups, products
} = vm.runInContext(`({
  calcInvoice, parseAmount, taxIncludedYen, getShippingColumn, lookupShippingFee, formatYen,
  describePackagingRule, describeFreeShipping, packagingTitle,
  packagingModes, shippingFees, prefectureGroups, products
})`, context);

// 注文を作る補助。商品A〜Fは [A, B, ...] の重さ(0.01kg単位)で渡す。
const order = (overrides = {}) => ({
  prefecture: "東京都", productCentiKg: [0, 0, 0, 0, 0, 0], riceFlourGrams: 0, riceBranGrams: 0, bookCount: 0, ...overrides
});

test("商品Aを1.75kg：税込額と送料の合計", () => {
  // 1850円/kg × 1.75kg = 3237.5円 → 8%加算 3496.5円 → 切り捨てて3496円
  const r = calcInvoice(order({ productCentiKg: [175, 0, 0, 0, 0, 0] }), "normal");
  assert.equal(r.productTotal, 3496);
  assert.equal(r.shippingLabel, "1番");
  assert.equal(r.shippingYen, shippingFees["東北・関東・信越・北陸・東海"]["1番"]);
  assert.equal(r.total, 3496 + 610);
});

test("商品ごとに税込額を切り捨ててから足す", () => {
  // 商品C 0.01kg = 8.65円 → 9.342円 → 9円、商品D 0.01kg = 7.97円 → 8.6076円 → 8円
  const r = calcInvoice(order({ productCentiKg: [0, 0, 1, 1, 0, 0] }), "normal");
  assert.equal(r.productTotal, 9 + 8);
});

test("米粉・米ぬか・書籍の税込額（米粉と米ぬかは8%、書籍は10%）", () => {
  const r = calcInvoice(order({ riceFlourGrams: 300, riceBranGrams: 100, bookCount: 2 }), "normal");
  assert.equal(r.riceFlourTotal, Math.floor(270 * 1.08));   // 291
  assert.equal(r.riceBranTotal, 108);
  assert.equal(r.bookTotal, 3520);
});

test("書籍は合計重量に入らない", () => {
  const r = calcInvoice(order({ bookCount: 5 }), "normal");
  assert.equal(r.weightKg, 0);
  assert.equal(r.shippingLabel, "1番");
});

test("重量帯：普通計算は4.5kgまで1番、4.5kg超で2番", () => {
  const at = centiKg => calcInvoice(order({ productCentiKg: [centiKg, 0, 0, 0, 0, 0] }), "normal").shippingLabel;
  assert.equal(at(450), "1番");
  assert.equal(at(451), "2番");
});

test("重量帯：簡易包装計算は5kgまで1番", () => {
  const at = centiKg => calcInvoice(order({ productCentiKg: [centiKg, 0, 0, 0, 0, 0] }), "simple").shippingLabel;
  assert.equal(at(500), "1番");
  assert.equal(at(501), "2番");
});

test("期間限定版：お米3kg以上で送料無料。税込額は変わらない", () => {
  const under = calcInvoice(order({ productCentiKg: [299, 0, 0, 0, 0, 0] }), "limited");
  const exact = calcInvoice(order({ productCentiKg: [300, 0, 0, 0, 0, 0] }), "limited");
  assert.notEqual(under.shippingYen, 0);
  assert.equal(under.freeShipping.isFree, false);
  assert.equal(exact.shippingYen, 0);
  assert.equal(exact.shippingLabel, "送料無料");
  assert.equal(exact.total, exact.productTotal);
});

test("期間限定版：お米の重さは商品A〜Fの合計（複数商品の合算でも判定できる）", () => {
  const r = calcInvoice(order({ productCentiKg: [100, 100, 100, 0, 0, 0] }), "limited");
  assert.equal(r.shippingYen, 0);
});

test("期間限定版：米粉・米ぬか・書籍はお米の3kgに数えない", () => {
  const r = calcInvoice(order({ productCentiKg: [100, 0, 0, 0, 0, 0], riceFlourGrams: 5000, riceBranGrams: 5000, bookCount: 10 }), "limited");
  assert.equal(r.freeShipping.isFree, false);
  assert.notEqual(r.shippingYen, 0);
});

test("普通計算・簡易包装計算には送料無料がない", () => {
  assert.equal(calcInvoice(order({ productCentiKg: [1000, 0, 0, 0, 0, 0] }), "normal").freeShipping, null);
  assert.notEqual(calcInvoice(order({ productCentiKg: [1000, 0, 0, 0, 0, 0] }), "simple").shippingYen, 0);
});

test("送料表：すべての都道府県が送料グループを持ち、すべての包装の列が表にある", () => {
  assert.equal(Object.keys(prefectureGroups).length, 47);
  for (const group of Object.values(prefectureGroups)) assert.ok(shippingFees[group], group);
  for (const mode of Object.values(packagingModes)) {
    for (const group of Object.keys(shippingFees)) {
      for (const rule of mode.rules) assert.equal(typeof shippingFees[group][rule.column], "number");
    }
  }
});

test("エラー：数量なし・都道府県なし・重すぎる・書籍が多すぎる", () => {
  assert.throws(() => calcInvoice(order(), "normal"), /商品の数量を入力してください/);
  assert.throws(() => calcInvoice(order({ prefecture: "", bookCount: 1 }), "normal"), /配送先都道府県を選んでください/);
  assert.throws(() => calcInvoice(order({ productCentiKg: [2401, 0, 0, 0, 0, 0] }), "normal"), /24kgを超えています/);
  assert.throws(() => calcInvoice(order({ bookCount: 1000 }), "normal"), /999個まで/);
  assert.doesNotThrow(() => calcInvoice(order({ productCentiKg: [2400, 0, 0, 0, 0, 0] }), "normal"));
});

test("入力の読み取り：空欄は0、小数の桁数、マイナス、全角などはエラー", () => {
  assert.equal(parseAmount("", "x", 2), 0);
  assert.equal(parseAmount(" 1.25 ", "x", 2), 125);
  assert.equal(parseAmount("0.07", "x", 2), 7);       // 0.07*100 の誤差が出ても整数に丸める
  assert.equal(parseAmount("12", "x", 0), 12);
  assert.throws(() => parseAmount("1.234", "x", 2), /小数第2位まで/);
  assert.throws(() => parseAmount("1.5", "x", 0), /整数/);
  assert.throws(() => parseAmount("-1", "x", 0), /0以上/);
  for (const bad of [".5", "1e3", "abc", "１２"]) assert.throws(() => parseAmount(bad, "x", 2), /半角数字/);
});

test("拡張性：包装の種類を設定に1つ足すだけで、計算に使える", () => {
  packagingModes.testMode = { shortName: "テスト", tabLines: ["テスト"], rules: packagingModes.normal.rules, freeShippingRiceKg: 1 };
  try {
    const r = calcInvoice(order({ productCentiKg: [100, 0, 0, 0, 0, 0] }), "testMode");
    assert.equal(r.shippingYen, 0);
  } finally {
    delete packagingModes.testMode;
  }
});

// ===== 部品ごとのテスト =====

test("formatYen：3桁区切りと「円」。Intl（toLocaleString）と同じ結果で、より軽い", () => {
  for (const n of [0, 7, 999, 1000, 3496, 12345, 1234567]) {
    assert.equal(formatYen(n), n.toLocaleString("ja-JP") + "円");
  }
});

test("taxIncludedYen：税込額は1円未満を切り捨てる（8%と10%）", () => {
  assert.equal(taxIncludedYen({ price: 270, quantity: 300, perUnit: 300, taxPercent: 8 }), 291);
  assert.equal(taxIncludedYen({ price: 1600, quantity: 1, perUnit: 1, taxPercent: 10 }), 1760);
  assert.equal(taxIncludedYen({ price: 865, quantity: 1, perUnit: 100, taxPercent: 8 }), 9); // 9.342円
  assert.equal(taxIncludedYen({ price: 100, quantity: 0, perUnit: 1, taxPercent: 8 }), 0);
});

test("getShippingColumn：境界の重さ（普通計算）", () => {
  const normal = packagingModes.normal;
  assert.equal(getShippingColumn(0, normal), "1番");
  assert.equal(getShippingColumn(4.5, normal), "1番");
  assert.equal(getShippingColumn(4.51, normal), "2番");
  assert.equal(getShippingColumn(10, normal), "2番");
  assert.equal(getShippingColumn(20, normal), "3番");
  assert.equal(getShippingColumn(24, normal), "4番");
  assert.throws(() => getShippingColumn(24.01, normal), /24kgを超えています/);
});

test("getShippingColumn：簡易包装は4番を使わない", () => {
  assert.equal(getShippingColumn(14, packagingModes.simple), "2番");
  assert.equal(getShippingColumn(24, packagingModes.simple), "3番");
});

test("lookupShippingFee：グループの送料表と同じ金額を返す。沖縄は専用の行", () => {
  // vm（別の実行環境）で作られたオブジェクトなので、文字にして比べる
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(lookupShippingFee("沖縄県", 1, packagingModes.normal)), { fee: 1056, column: "1番" });
  assert.deepEqual(plain(lookupShippingFee("埼玉県", 5, packagingModes.normal)), { fee: 797, column: "2番" });
  assert.throws(() => lookupShippingFee("", 1, packagingModes.normal), /都道府県を選んで/);
  assert.throws(() => lookupShippingFee("火星", 1, packagingModes.normal), /設定されていない/);
});

test("全都道府県×全包装×全重量帯で、送料が計算できる", () => {
  for (const prefecture of Object.keys(prefectureGroups)) {
    for (const mode of Object.values(packagingModes)) {
      for (const rule of mode.rules) {
        const { fee } = lookupShippingFee(prefecture, rule.maxKg, mode);
        assert.ok(fee > 0, `${prefecture} ${rule.maxKg}kg`);
      }
    }
  }
});

test("説明文：重さと列の対応、送料無料の条件、包装の正式名", () => {
  assert.equal(describePackagingRule(packagingModes.simple.rules), "〜5kg→1番、5kg超〜14kg→2番、14kg超〜24kg→3番");
  assert.match(describeFreeShipping(packagingModes.limited), /3kg以上なら送料無料/);
  assert.equal(describeFreeShipping(packagingModes.normal), "");
  assert.equal(packagingTitle(packagingModes.simple), "簡易包装計算");
});

test("商品A〜Fの合計：6品それぞれの単価で計算される", () => {
  // 各商品を1kgずつ → 税込額を商品ごとに切り捨てて足す
  const r = calcInvoice(order({ productCentiKg: [100, 100, 100, 100, 100, 100] }), "normal");
  const expected = products.reduce((sum, p) => sum + Math.floor(p.unitPrice * 1.08), 0);
  assert.equal(r.productTotal, expected);
  assert.equal(r.weightKg, 6);
});
