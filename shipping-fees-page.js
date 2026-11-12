// 表の中身は shipping-fees.js（計算と同じ送料テーブル）から作る。
const groups = Object.keys(shippingFees);
const bands = Object.keys(shippingFees[groups[0]]);

// 見出し：送料の列の番号（1番〜4番）。重さとの対応は包装の種類で違うので、表の下に書く。
const header = document.getElementById("bandHeader");
bands.forEach(band => {
  const th = document.createElement("th");
  th.textContent = band;
  header.appendChild(th);
});

// 表の下：包装の種類ごとの、重さと番号の対応（計算と同じ packagingModes から作る）。
const ruleNotes = document.getElementById("ruleNotes");
Object.values(packagingModes).forEach(mode => {
  const li = document.createElement("li");
  // 使わない番号があれば書き添える（例：簡易包装は4番を使わない）。
  const unused = bands.filter(band => !mode.rules.some(rule => rule.column === band));
  const freeShippingText = describeFreeShipping(mode);
  li.textContent = `${packagingTitle(mode)}：${describePackagingRule(mode.rules)}` + (unused.length ? `（${unused.join("・")}は使わない）` : "")
    + (freeShippingText ? `。ただし${freeShippingText}` : "");
  ruleNotes.appendChild(li);
});

// 行：送り先グループごとに2行使う。1行目に送り先と都道府県、2行目に各重量帯の送料。
// （スマホの狭い画面でも横にはみ出さないように、送り先を横いっぱいの行にする）
const rows = document.getElementById("feeRows");
groups.forEach(group => {
  const nameRow = document.createElement("tr");
  const th = document.createElement("th");
  th.colSpan = bands.length;
  th.textContent = group;
  const prefectureNames = Object.keys(prefectureGroups).filter(p => prefectureGroups[p] === group).join("、");
  // 埼玉県・沖縄県のように、グループ名と都道府県名が同じなら2回は書かない。
  if (prefectureNames !== group) {
    const prefectures = document.createElement("span");
    prefectures.className = "prefectures";
    prefectures.textContent = prefectureNames;
    th.appendChild(prefectures);
  }
  nameRow.appendChild(th);
  rows.appendChild(nameRow);

  const tr = document.createElement("tr");
  bands.forEach(band => {
    const td = document.createElement("td");
    td.textContent = formatYen(shippingFees[group][band]);
    tr.appendChild(td);
  });
  rows.appendChild(tr);
});
