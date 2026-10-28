# 商品A〜F 請求額計算ロジック（他アプリ流用用）

発送請求額計算アプリ（index.html / shipping-fees.js）から、**商品A〜Fの単価・送料・最終請求額**だけを抜き出したもの。
米粉・米ぬか・書籍・期間限定版（送料無料判定）は含めていない。

## 1. コピペ用コード（DOM非依存・単体で動く）

```js
// ===== 価格表（税抜・円/kg）。価格を変えるときはここだけ =====
const products = {
  A: 1850,
  B: 1450,
  C: 865,
  D: 797,
  E: 697,
  F: 1450,
};
const PRODUCT_TAX_RATE_PERCENT = 108; // 商品は消費税8%（税込 = 税抜 × 108%）

// ===== 送料表（税込・円）。グループ × 列（1番〜4番） =====
const shippingFees = {
  "埼玉県": { "1番": 605, "2番": 797, "3番": 1050, "4番": 1303 },
  "東北・関東・信越・北陸・東海": { "1番": 610, "2番": 854, "3番": 1092, "4番": 1353 },
  "近畿": { "1番": 693, "2番": 942, "3番": 1188, "4番": 1441 },
  "中国・四国": { "1番": 818, "2番": 1045, "3番": 1314, "4番": 1556 },
  "北海道・九州": { "1番": 1023, "2番": 1265, "3番": 1507, "4番": 1760 },
  "沖縄県": { "1番": 1056, "2番": 1342, "3番": 1622, "4番": 1908 },
};

// ===== 都道府県 → 送料グループ =====
const T = "東北・関東・信越・北陸・東海";
const prefectureGroups = {
  北海道: "北海道・九州",
  青森県: T, 岩手県: T, 宮城県: T, 秋田県: T, 山形県: T, 福島県: T,
  茨城県: T, 栃木県: T, 群馬県: T, 埼玉県: "埼玉県", 千葉県: T, 東京都: T, 神奈川県: T,
  新潟県: T, 富山県: T, 石川県: T, 福井県: T, 山梨県: T, 長野県: T, 岐阜県: T, 静岡県: T, 愛知県: T, 三重県: T,
  滋賀県: "近畿", 京都府: "近畿", 大阪府: "近畿", 兵庫県: "近畿", 奈良県: "近畿", 和歌山県: "近畿",
  鳥取県: "中国・四国", 島根県: "中国・四国", 岡山県: "中国・四国", 広島県: "中国・四国", 山口県: "中国・四国",
  徳島県: "中国・四国", 香川県: "中国・四国", 愛媛県: "中国・四国", 高知県: "中国・四国",
  福岡県: "北海道・九州", 佐賀県: "北海道・九州", 長崎県: "北海道・九州", 熊本県: "北海道・九州",
  大分県: "北海道・九州", 宮崎県: "北海道・九州", 鹿児島県: "北海道・九州", 沖縄県: "沖縄県",
};

// ===== 合計重量 → 送料の列。上から見て weight <= maxKg になった最初の行 =====
const MAX_WEIGHT_KG = 24; // 超えたらエラー（2箱に分ける）
const packagingRules = {
  normal: [ // 普通計算
    { maxKg: 4.5, column: "1番" },
    { maxKg: 10, column: "2番" },
    { maxKg: 20, column: "3番" },
    { maxKg: 24, column: "4番" },
  ],
  simple: [ // 簡易包装計算（4番は使わない）
    { maxKg: 5, column: "1番" },
    { maxKg: 14, column: "2番" },
    { maxKg: 24, column: "3番" },
  ],
};

// ===== 計算 =====
// 1円未満の切り捨て。小数の誤差を避けるため、分子・分母とも整数で渡す。
const floorDivide = (numerator, denominator) => Math.floor(numerator / denominator);

// 入力文字列（kg）を「0.01kg単位の整数」にする（1.25kg → 125）。
// 空欄は0。マイナス・数値以外・小数第3位以上はエラー。
function toCentiKg(raw, label) {
  const s = String(raw ?? "").trim();
  if (s === "") return 0;
  if (s.startsWith("-")) throw new Error(`${label}は0以上で入力してください`);
  const m = s.match(/^\d+(?:\.(\d+))?$/);
  if (!m) throw new Error(`${label}は「1.25」のように半角数字で入力してください`);
  if ((m[1] ?? "").length > 2) throw new Error(`${label}は小数第2位までで入力してください`);
  return Math.round(Number(s) * 100);
}

// 1商品の税込額（1円未満切り捨て）。商品ごとに切り捨てる。
// 税抜(0.01円単位) = 単価 × 0.01kg単位の重さ。これに108を掛け、100(0.01円→円) × 100(%) で割る。
function productTaxIncluded(centiKg, unitPrice) {
  return floorDivide(unitPrice * centiKg * PRODUCT_TAX_RATE_PERCENT, 100 * 100);
}

function getShippingColumn(weightKg, packaging) {
  if (weightKg > MAX_WEIGHT_KG) {
    throw new Error(`合計重量が${MAX_WEIGHT_KG}kgを超えています（${weightKg}kg）。2箱に分けてください`);
  }
  const rule = packagingRules[packaging].find(r => weightKg <= r.maxKg);
  if (!rule) throw new Error(`この重さの送料が設定されていません（${weightKg}kg）`);
  return rule.column;
}

/**
 * @param {string} prefecture  配送先都道府県（例: "東京都"）
 * @param {Object} kg          重量(kg)。例: { A: "1.5", C: "0.25" }（未指定・空欄は0）
 * @param {"normal"|"simple"} packaging
 * @returns {{ weight, band, productTotal, shipping, total, details }}
 */
function calcInvoice(prefecture, kg, packaging = "normal") {
  if (!prefecture) throw new Error("配送先都道府県を選んでください");
  const group = prefectureGroups[prefecture];
  if (!group) throw new Error(`送料が設定されていない都道府県です: ${prefecture}`);

  const ids = Object.keys(products);
  const centiKg = ids.map(id => toCentiKg(kg[id], `商品${id}の重量`));
  const sumCentiKg = centiKg.reduce((a, b) => a + b, 0);
  if (sumCentiKg === 0) throw new Error("商品の数量を入力してください");

  // 合計重量(kg)。0.01kg単位の整数で足してから kg に戻す（浮動小数の誤差を避ける）。
  const weight = sumCentiKg / 100;

  // 送料（税込）。重さの帯 → 列 → 送料表。
  const band = getShippingColumn(weight, packaging);
  const shipping = shippingFees[group]?.[band];
  if (typeof shipping !== "number") throw new Error(`送料の設定が見つかりません: ${group} / ${band}`);

  // 商品代（税込8%）。商品ごとに切り捨ててから合計。
  const details = ids.map((id, i) => ({ id, unitPrice: products[id], kg: centiKg[i] / 100, taxIncluded: productTaxIncluded(centiKg[i], products[id]) }));
  const productTotal = details.reduce((sum, d) => sum + d.taxIncluded, 0);

  return { weight, band, productTotal, shipping, total: productTotal + shipping, details };
}

// 使用例
// calcInvoice("東京都", { A: "1.5", C: "0.25" }, "normal")
// → weight 1.75, band "1番", productTotal 3230, shipping 610, total 3840
```

## 2. 計算ロジックの要点（参考にしている考え方）

| 項目 | ルール |
|---|---|
| 商品代 | 単価（税抜・円/kg）× 重さ（kg）。全商品共通で、特別価格・まとめ割はなし |
| 消費税 | 商品は8%。**商品ごとに**税込額を計算し、1円未満を切り捨て、その後合計する（合計してから切り捨てではない） |
| 送料 | 税込の固定額。表から引くだけで、別途消費税は加えない（画面表示は「税込・10%」） |
| 合計重量 | 商品A〜Fの重量の合計（kg）。送料の帯を決めるのにだけ使う |
| 送料の決め方 | ①都道府県 → 送料グループ ②合計重量 → 列（1〜4番） ③グループ×列 → 送料 |
| 請求額 | 商品代（税込・合計）＋ 送料（税込） |
| 上限 | 合計24kg超はエラー（2箱に分けて計算） |

### 重量帯（送料の列）

| 普通計算 | 簡易包装計算 |
|---|---|
| 〜4.5kg → 1番 | 〜5kg → 1番 |
| 4.5kg超〜10kg → 2番 | 5kg超〜14kg → 2番 |
| 10kg超〜20kg → 3番 | 14kg超〜24kg → 3番 |
| 20kg超〜24kg → 4番 | （4番は使わない） |

### 端数・誤差を出さない工夫（他アプリでも重要）

- 重量は **0.01kg単位の整数**（1.25kg → 125）にして扱う。`0.1 + 0.2` のような浮動小数の誤差を避ける。
- 税込額は `floor(単価 × 重さ(0.01kg単位) × 108 / (100 × 100))`。**掛け算を先に済ませて、最後に1回だけ割る**。
- 入力は「半角数字・小数第2位まで・0以上」に限定。`.5` や `1e3` は受け付けない。
- 空欄は0扱い。全部0ならエラー。

## 3. このアプリに含まれるが、このメモに含めていないもの

- 米粉（300gあたり270円・税8%）、米ぬか（100gあたり100円・税8%）、書籍（1,600円・税10%。重量に含めない）
- 期間限定版タブ：税抜のお米（A〜F）・書籍・米粉の合計が10,000円以上で送料無料（送料の帯は普通計算と同じ）

元のコードは `index.html`（calculate関数）と `shipping-fees.js`。
