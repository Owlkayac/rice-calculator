// 請求額の計算（画面には一切さわらない部分）。index.html が読み込む。
// 価格や税率を変えるときは、この上の方の表だけを直す。
// 先に shipping-fees.js を読み込んでおくこと（送料表を使うため）。

// ===== 価格表（税抜） =====
// 消費税率（%）。食品は8%、書籍は10%。送料は税込の固定額なので、ここには含めない。
const TAX_PERCENT = { food: 8, book: 10 };

// 商品A〜F（お米）：1kgあたりの価格 × 重さ（kg）で計算する（普通計算・簡易包装計算・期間限定版とも同じ）。
const products = [
  { id: "a", name: "商品A", unitPrice: 1850 },
  { id: "b", name: "商品B", unitPrice: 1450 },
  { id: "c", name: "商品C", unitPrice: 865 },
  { id: "d", name: "商品D", unitPrice: 797 },
  { id: "e", name: "商品E", unitPrice: 697 },
  { id: "f", name: "商品F", unitPrice: 1450 }
];
const riceFlour = { price: 270, perGrams: 300 }; // 米粉：300gあたり270円
const riceBran = { price: 100, perGrams: 100 };   // 米ぬか：100gあたり100円
const book = { price: 1600 };                     // 書籍：1個1,600円

// ===== 入力の上限 =====
const MAX_WEIGHT_KG = 24;     // 1箱の重さの上限（書籍を除く）
const MAX_BOOK_COUNT = 999;   // 書籍の個数の上限（書籍は重さの上限で止まらないため、打ち間違い防止）

// ===== 金額の計算 =====

// 税込額（1円未満は切り捨て）。小数の計算誤差が出ないよう、すべて整数のまま計算する。
//   税込額 = 単価 × 数量 × (100 + 税率) ÷ (単位 × 100)
//   price: 単価（円） / quantity: 数量（整数） / perUnit: 単価が何単位あたりか（数量と同じ単位）
function taxIncludedYen({ price, quantity, perUnit, taxPercent }) {
  return Math.floor(price * quantity * (100 + taxPercent) / (perUnit * 100));
}

// 商品A〜F1つ分の税込額。重さは0.01kg単位の整数（1.25kg → 125）、単価は円/kg。
// 「perUnit: 100」は、0.01kg単位の重さ(100で1kg)を kg あたりの単価に合わせるための数。
function productTaxIncluded(centiKg, unitPrice) {
  return taxIncludedYen({ price: unitPrice, quantity: centiKg, perUnit: 100, taxPercent: TAX_PERCENT.food });
}

// ===== 入力の読み取り（文字 → 整数） =====

// 入力された文字を「小数第decimals位まで」の数として読み、10^decimals倍した整数で返す（例: 1.25kg → 125）。
// 空欄は0。マイナス・数値以外・桁数オーバーはエラーにする。
function parseAmount(rawText, label, decimals) {
  const raw = rawText.trim();
  if (raw === "") return 0;
  if (raw.startsWith("-")) throw new Error(`${label}は0以上で入力してください`);
  const match = raw.match(/^\d+(?:\.(\d+))?$/);
  const example = decimals === 0 ? "12" : "1.25";
  if (!match) throw new Error(`${label}は「${example}」のように半角数字で入力してください（「.5」「1e3」のような書き方は使えません）`);
  const fraction = match[1] ?? "";
  if (fraction.length > decimals) {
    throw new Error(decimals === 0 ? `${label}は整数で入力してください` : `${label}は小数第${decimals}位までで入力してください`);
  }
  return Math.round(Number(raw) * 10 ** decimals);
}

// ===== 送料の計算 =====

// 合計重量（kg）から、送料表のどの列（1番〜4番）を使うかを返す。
// 重量0（書籍のみの注文）は最小の重量帯で送る。
function getWeightBand(weightKg, mode) {
  if (weightKg > MAX_WEIGHT_KG) {
    throw new Error(`合計重量が${MAX_WEIGHT_KG}kgを超えています（${weightKg}kg）。2箱に分けて計算してください`);
  }
  const rule = mode.rules.find(candidate => weightKg <= candidate.maxKg);
  if (!rule) throw new Error(`この重さの送料が設定されていません（${weightKg}kg）`);
  return rule.column;
}

// 送り先と重さから、送料（税込・円）と使った列を返す。
function lookupShippingFee(prefecture, weightKg, mode) {
  if (prefecture === "") throw new Error("配送先都道府県を選んでください");
  const group = prefectureGroups[prefecture];
  if (!group) throw new Error(`送料が設定されていない都道府県です: ${prefecture}`);
  const band = getWeightBand(weightKg, mode);
  const fee = shippingFees[group]?.[band];
  if (typeof fee !== "number") throw new Error(`送料の設定が見つかりません: ${group} / ${band}`);
  return { fee, band };
}

// ===== 請求額の計算（これが入り口） =====

// order（注文）と modeId（包装の種類。packagingModes のキー）から、請求額をすべて計算する。
//   order.prefecture    : 配送先の都道府県（未選択は ""）
//   order.productCentiKg: 商品A〜Fの重さ。products と同じ順の配列。0.01kg単位の整数
//   order.riceFlourGrams: 米粉の重さ（g、整数）
//   order.riceBranGrams : 米ぬかの重さ（g、整数）
//   order.bookCount     : 書籍の個数（整数）
// 入力が正しくないときは、画面に出す文章つきの Error を投げる。
function calcInvoice(order, modeId) {
  const mode = packagingModes[modeId];
  const productCentiKgSum = order.productCentiKg.reduce((sum, centiKg) => sum + centiKg, 0);

  if (order.bookCount > MAX_BOOK_COUNT) throw new Error(`書籍の個数は${MAX_BOOK_COUNT}個までで入力してください`);
  if (productCentiKgSum + order.riceFlourGrams + order.riceBranGrams + order.bookCount === 0) {
    throw new Error("商品の数量を入力してください");
  }

  // 合計重量（kg）は商品A〜F＋米粉＋米ぬか。書籍は含めない。g単位で足してからkgにする。
  const weightKg = (productCentiKgSum * 10 + order.riceFlourGrams + order.riceBranGrams) / 1000;
  const shippingFee = lookupShippingFee(order.prefecture, weightKg, mode);

  // 送料無料の判定：お米（商品A〜F）だけの重さで見る。米粉・米ぬか・書籍は含めない。
  // 重さは0.01kg単位の整数のまま比べる（小数の誤差を避ける）。
  let freeShipping = null;
  if (mode.freeShippingRiceKg !== undefined) {
    freeShipping = {
      riceKg: productCentiKgSum / 100,
      requiredKg: mode.freeShippingRiceKg,
      isFree: productCentiKgSum >= mode.freeShippingRiceKg * 100
    };
  }
  const isFree = freeShipping?.isFree === true;
  const shippingYen = isFree ? 0 : shippingFee.fee;
  const band = isFree ? "送料無料" : shippingFee.band;

  // 商品ごとに税込金額を切り捨ててから足す。
  const productTotal = order.productCentiKg.reduce(
    (sum, centiKg, i) => sum + productTaxIncluded(centiKg, products[i].unitPrice), 0);
  const riceFlourTotal = taxIncludedYen({
    price: riceFlour.price, quantity: order.riceFlourGrams, perUnit: riceFlour.perGrams, taxPercent: TAX_PERCENT.food });
  const riceBranTotal = taxIncludedYen({
    price: riceBran.price, quantity: order.riceBranGrams, perUnit: riceBran.perGrams, taxPercent: TAX_PERCENT.food });
  const bookTotal = taxIncludedYen({
    price: book.price, quantity: order.bookCount, perUnit: 1, taxPercent: TAX_PERCENT.book });

  return {
    weightKg, shippingYen, band, freeShipping,
    productTotal, riceFlourTotal, riceBranTotal, bookTotal,
    total: productTotal + riceFlourTotal + riceBranTotal + bookTotal + shippingYen
  };
}
