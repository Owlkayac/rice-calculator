// このファイルは「画面の読み取りと表示」だけを担当する（index.html が defer で読み込む）。
// 価格・税率・計算は calc.js、送料と包装の種類は shipping-fees.js にある。

const $ = id => document.getElementById(id);

// いま選んでいるタブ（packagingModes のキー："normal"＝普通計算、"simple"＝簡易包装計算、"limited"＝期間限定版）。
let currentModeId = "normal";

// ===== 入力欄（価格表から作る） =====

// 入力欄の定義。商品A〜F・米粉・米ぬか・書籍の順に並ぶ。
//   label: 表示名＋価格 / name: エラー文に出す名前 / decimals: 小数の桁数 / unit: 単位
const foodTax = `消費税${TAX_PERCENT.food}%`;
const inputFields = [
  ...products.map(product => ({
    id: product.id, step: "0.01", decimals: 2, unit: "kg", name: `${product.name}の重量`,
    label: `${product.name}　${formatYen(product.unitPrice)}/kg（税抜・${foodTax}）`
  })),
  { id: "riceFlourWeight", step: "1", decimals: 0, unit: "g", name: "米粉の重量",
    label: `米粉　${riceFlour.perGrams}gあたり${formatYen(riceFlour.price)}（税抜・${foodTax}）` },
  { id: "riceBranWeight", step: "1", decimals: 0, unit: "g", name: "米ぬかの重量",
    label: `米ぬか　${riceBran.perGrams}gあたり${formatYen(riceBran.price)}（税抜・${foodTax}）` },
  { id: "bookCount", step: "1", decimals: 0, unit: "個", name: "書籍の個数",
    label: `書籍　${formatYen(book.price)}（税抜・消費税${TAX_PERCENT.book}%）` }
];

// 都道府県の選択肢と入力欄を、まとめて1回でページに入れる（1つずつ足すより速い）。
function createInputs() {
  const prefectures = document.createDocumentFragment();
  Object.keys(prefectureGroups).forEach(name => {
    const option = document.createElement("option");
    option.textContent = name;
    prefectures.appendChild(option);
  });
  $("destPrefecture").appendChild(prefectures);

  const fields = document.createDocumentFragment();
  inputFields.forEach(field => {
    const item = document.createElement("div");
    item.className = "item";
    const label = document.createElement("label");
    label.htmlFor = field.id;
    label.textContent = field.label;
    const input = document.createElement("input");
    input.id = field.id;
    input.type = "number";
    input.min = "0";
    input.step = field.step;
    input.placeholder = "0";
    item.append(label, input, ` ${field.unit}`);
    fields.appendChild(item);
  });
  $("inputFields").appendChild(fields);
}

// ===== 入力の読み取り =====

// 入力欄から数を読む（読み方の決まりは calc.js の parseAmount）。
function readAmount({ id, name, decimals }) {
  const input = $(id);
  // 「1.2.3」など読めない入力は、ブラウザが空欄として渡すため先に調べる。
  if (input.validity.badInput) throw new Error(`${name}は数値で入力してください`);
  return parseAmount(input.value, name, decimals);
}

// 画面の入力欄から、calcInvoice に渡す注文を作る。
// 商品A〜Fの重量は0.01kg単位、米粉・米ぬかはg単位、書籍は個数（いずれも整数）。
function readOrder() {
  const [flour, bran, books] = inputFields.slice(products.length);
  return {
    prefecture: $("destPrefecture").value,
    productCentiKg: inputFields.slice(0, products.length).map(readAmount),
    riceFlourGrams: readAmount(flour),
    riceBranGrams: readAmount(bran),
    bookCount: readAmount(books)
  };
}

// ===== 結果の表示 =====

// 送料無料の判定に使った重さの表示文（無料の条件がない包装の種類では空）。
function describeFreeShippingResult(freeShipping) {
  if (!freeShipping) return "";
  return `送料無料の判定：お米（商品A〜F）の合計重量 ${freeShipping.riceKg}kg（${freeShipping.requiredKg}kg以上で無料）`;
}

// invoice は calcInvoice の結果。引数なしなら、結果欄を空（0円）に戻す。
function showResults(invoice) {
  const mode = packagingModes[currentModeId];
  // 例：「（簡易包装・2番）」。どちらのタブで計算した送料かを結果だけで分かるようにする。
  $("shippingBand").textContent = invoice ? `（${mode.shortName}・${invoice.shippingLabel}）` : "";
  $("freeShippingNote").textContent = invoice ? describeFreeShippingResult(invoice.freeShipping) : "";
  $("weight").value = invoice ? invoice.weightKg : "";
  $("shipping").value = invoice ? invoice.shippingYen : "";
  const yen = {
    productTotal: invoice?.productTotal, riceFlourTotal: invoice?.riceFlourTotal, riceBranTotal: invoice?.riceBranTotal,
    bookTotal: invoice?.bookTotal, shippingTotal: invoice?.shippingYen, total: invoice?.total
  };
  Object.entries(yen).forEach(([id, amount]) => { $(id).textContent = formatYen(amount ?? 0); });
}

// 前回の結果を消す（エラー時・入力変更時に、古い請求額が残らないようにする）。
function resetResults() { showResults(); }

// ===== ボタンの動き =====

function calculate() {
  try {
    showResults(calcInvoice(readOrder(), currentModeId));
  } catch (error) {
    resetResults();
    alert(error.message);
  }
}

function clearAll() {
  ["destPrefecture", ...inputFields.map(field => field.id)].forEach(id => { $(id).value = ""; });
  resetResults();
}

// タブを切り替える。入力はそのまま残し、送料の決め方が変わるので結果は消す。
function selectPackaging(modeId) {
  if (modeId === currentModeId) return;
  currentModeId = modeId;
  showPackaging();
  resetResults();
}

// タブを packagingModes から作る（包装の種類を足したら、ここは直さなくてよい）。
function createTabs() {
  const tabs = document.createDocumentFragment();
  Object.entries(packagingModes).forEach(([modeId, mode]) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.id = `tab-${modeId}`;
    tab.addEventListener("click", () => selectPackaging(modeId));
    // 狭い画面で折り返す位置を決めるため、tabLines ごとに .nb で包む。
    mode.tabLines.forEach(line => {
      const span = document.createElement("span");
      span.className = "nb";
      span.textContent = line;
      tab.appendChild(span);
    });
    tabs.appendChild(tab);
  });
  $("tabs").appendChild(tabs);
}

// いま選んでいるタブの見た目と、送料の対応表の説明文を表示する。
function showPackaging() {
  Object.keys(packagingModes).forEach(modeId => {
    const tab = $(`tab-${modeId}`);
    tab.classList.toggle("active", modeId === currentModeId);
    tab.setAttribute("aria-pressed", modeId === currentModeId);
  });
  // 例：「送料：〜5kg→1番、5kg超〜14kg→2番、14kg超〜24kg→3番」
  const mode = packagingModes[currentModeId];
  const freeShippingText = describeFreeShipping(mode);
  $("packagingNote").textContent =
    `送料：${describePackagingRule(mode.rules)}` + (freeShippingText ? `。${freeShippingText}` : "");
}

// 入力を変えたら、計算し直すまで古い結果を表示しない。
// 入力欄は後から作るので、1つずつ付けず、まとめて受け取る（イベントの委譲）。
// 古いiPhoneは選択欄でinputが起きないため、changeでも消す。
function watchInputs() {
  const container = document.querySelector(".container");
  ["input", "change"].forEach(type => container.addEventListener(type, event => {
    if (event.target.matches("select, input:not([readonly])")) resetResults();
  }));
}

// 初期表示。入力欄→タブ→説明の順に作る。
createInputs();
createTabs();
showPackaging();
watchInputs();
