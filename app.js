const TABS = [
  { key: "materials", label: "재료 주문" },
  { key: "packages", label: "패키지 비용" },
  { key: "products", label: "상품 제작" },
  { key: "prices", label: "상품 가격" },
  { key: "inventory", label: "재료 재고" },
  { key: "scenario", label: "수익 시나리오" },
];

const colorMap = ["#fde68a", "#bfdbfe", "#bbf7d0", "#fecaca", "#e9d5ff"];

const state = {
  activeTab: "materials",
  materials: [],
  packages: [],
  products: [],
  prices: [],
  baseStocks: {},
  sales: [],
  scenarios: [],
  productFilter: "ALL",
  usageDraft: [],
};

const $ = (id) => document.getElementById(id);
const format3 = (v) => Number(v || 0).toFixed(3);
const uid = () => Math.random().toString(36).slice(2, 10);

function materialUnitCost(materialName) {
  const records = state.materials.filter((m) => m.materialName === materialName);
  if (!records.length) return 0;
  const total = records.reduce((sum, m) => sum + (m.orderCost + m.cardFee + m.shippingPerUnit * m.quantity), 0);
  const qty = records.reduce((sum, m) => sum + m.quantity, 0);
  return qty ? total / qty : 0;
}

function packageCostByType(productType) {
  return state.packages
    .filter((p) => p.productType === productType)
    .reduce((sum, p) => sum + p.costPerUnit, 0);
}

function productionCost(product) {
  const materialCost = product.materials.reduce((sum, row) => sum + materialUnitCost(row.materialName) * row.requiredQty, 0);
  return materialCost + packageCostByType(product.productType);
}

function priceByProduct(productId) {
  return state.prices.find((p) => p.productId === productId);
}

function netProfitPerUnit(productId) {
  const price = priceByProduct(productId);
  const product = state.products.find((p) => p.id === productId);
  if (!price || !product) return 0;
  const salePrice = price.listPrice * (1 - price.discountPct / 100);
  return salePrice - productionCost(product);
}

function usedMaterialsFromSales() {
  const usage = {};
  state.sales.forEach((sale) => {
    const product = state.products.find((p) => p.id === sale.productId);
    if (!product) return;
    product.materials.forEach((m) => {
      usage[m.materialName] = (usage[m.materialName] || 0) + m.requiredQty * sale.quantity;
    });
  });
  return usage;
}

function buildSidebar() {
  const sidebar = $("sidebar");
  sidebar.innerHTML = "";
  TABS.forEach((tab) => {
    const btn = document.createElement("button");
    btn.textContent = tab.label;
    if (tab.key === state.activeTab) btn.classList.add("active");
    btn.onclick = () => {
      state.activeTab = tab.key;
      render();
    };
    sidebar.appendChild(btn);
  });
}

function renderTemplate(name) {
  const content = $("content");
  content.innerHTML = "";
  content.appendChild($(name + "-template").content.cloneNode(true));
}

function actionButtons(onEdit, onDelete) {
  return `<div class="row-actions"><button data-action="edit">수정</button><button data-action="delete">삭제</button></div>`;
}

function renderMaterials() {
  renderTemplate("materials");
  const body = $("materials-body");
  state.materials.forEach((m) => {
    const total = m.orderCost + m.cardFee + m.shippingPerUnit * m.quantity;
    const unit = m.quantity ? total / m.quantity : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${m.vendor}</td><td>${m.materialName}</td><td>${m.category}</td><td>${format3(m.quantity)}</td><td>${format3(m.orderCost)}</td><td>${format3(m.cardFee)}</td><td>${format3(m.shippingPerUnit)}</td><td>${format3(unit)}</td><td>${format3(total)}</td><td>${actionButtons()}</td>`;
    tr.querySelector('[data-action="edit"]').onclick = () => {
      const vendor = prompt("구매처", m.vendor); if (vendor == null) return;
      const category = prompt("카테고리", m.category); if (category == null) return;
      m.vendor = vendor; m.category = category; render();
    };
    tr.querySelector('[data-action="delete"]').onclick = () => {
      state.materials = state.materials.filter((x) => x.id !== m.id); render();
    };
    body.appendChild(tr);
  });
  $("materials-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.materials.push({
      id: uid(),
      vendor: f.get("vendor"),
      materialName: f.get("materialName"),
      category: f.get("category"),
      quantity: Number(f.get("quantity")),
      orderCost: Number(f.get("orderCost")),
      cardFee: Number(f.get("cardFee")),
      shippingPerUnit: Number(f.get("shippingPerUnit")),
    });
    e.target.reset();
    render();
  };
}

function renderPackages() {
  renderTemplate("packages");
  const body = $("packages-body");
  state.packages.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.productType}</td><td>${p.component}</td><td>${format3(p.costPerUnit)}</td><td>${actionButtons()}</td>`;
    tr.querySelector('[data-action="edit"]').onclick = () => {
      const v = prompt("개당 비용", p.costPerUnit); if (v == null) return;
      p.costPerUnit = Number(v); render();
    };
    tr.querySelector('[data-action="delete"]').onclick = () => {
      state.packages = state.packages.filter((x) => x.id !== p.id); render();
    };
    body.appendChild(tr);
  });
  const grouped = {};
  state.packages.forEach((p) => grouped[p.productType] = (grouped[p.productType] || 0) + p.costPerUnit);
  $("package-summary").innerHTML = Object.entries(grouped).map(([k, v]) => `<li>${k}: ${format3(v)}</li>`).join("") || "<li>데이터 없음</li>";
  $("packages-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.packages.push({ id: uid(), productType: f.get("productType"), component: f.get("component"), costPerUnit: Number(f.get("costPerUnit")) });
    e.target.reset(); render();
  };
}

function renderUsageDraft() {
  const el = $("material-usage-list");
  if (!el) return;
  el.innerHTML = "";
  state.usageDraft.forEach((row) => {
    const wrap = document.createElement("div");
    wrap.className = "material-usage-row";
    wrap.innerHTML = `<select data-id="${row.id}" data-field="materialName"></select><input data-id="${row.id}" data-field="requiredQty" type="number" min="0.001" step="0.001" value="${format3(row.requiredQty)}" /><button data-id="${row.id}" data-action="remove">삭제</button>`;
    const select = wrap.querySelector("select");
    const materials = [...new Set(state.materials.map((m) => m.materialName))];
    select.innerHTML = materials.map((m) => `<option value="${m}" ${m === row.materialName ? "selected" : ""}>${m}</option>`).join("");
    select.onchange = (e) => row.materialName = e.target.value;
    wrap.querySelector('input').onchange = (e) => row.requiredQty = Number(e.target.value);
    wrap.querySelector('[data-action="remove"]').onclick = () => { state.usageDraft = state.usageDraft.filter((x) => x.id !== row.id); renderUsageDraft(); };
    el.appendChild(wrap);
  });
}

function renderProducts() {
  renderTemplate("products");
  $("add-material-usage").onclick = () => {
    const first = state.materials[0]?.materialName || "";
    state.usageDraft.push({ id: uid(), materialName: first, requiredQty: 1 });
    renderUsageDraft();
  };
  renderUsageDraft();

  const types = [...new Set(state.products.map((p) => p.productType))];
  const filters = $("product-type-filters");
  filters.innerHTML = `<button data-type="ALL">전체</button>` + types.map((t) => `<button data-type="${t}">${t}</button>`).join("");
  filters.querySelectorAll("button").forEach((b) => b.onclick = () => { state.productFilter = b.dataset.type; render(); });

  const body = $("products-body");
  state.products
    .filter((p) => state.productFilter === "ALL" || p.productType === state.productFilter)
    .forEach((p) => {
      const idx = types.indexOf(p.productType);
      const bg = colorMap[idx % colorMap.length] || "#e5e7eb";
      const tr = document.createElement("tr");
      const materialsText = p.materials.map((m) => `${m.materialName} x ${format3(m.requiredQty)}`).join(", ");
      tr.innerHTML = `<td><span class="category-badge" style="background:${bg}">${p.productType}</span></td><td>${p.productName}</td><td>${materialsText}</td><td>${format3(packageCostByType(p.productType))}</td><td>${format3(productionCost(p))}</td><td>${actionButtons()}</td>`;
      tr.querySelector('[data-action="edit"]').onclick = () => {
        const n = prompt("상품명", p.productName); if (n == null) return; p.productName = n; render();
      };
      tr.querySelector('[data-action="delete"]').onclick = () => { state.products = state.products.filter((x) => x.id !== p.id); render(); };
      body.appendChild(tr);
    });

  $("products-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!state.usageDraft.length) return alert("재료 구성을 1개 이상 추가해주세요.");
    state.products.push({
      id: uid(),
      productType: f.get("productType"),
      productName: f.get("productName"),
      materials: state.usageDraft.map((x) => ({ materialName: x.materialName, requiredQty: Number(x.requiredQty) })),
    });
    state.usageDraft = [];
    e.target.reset();
    render();
  };
}

function fillProductSelect(selectId) {
  const select = $(selectId);
  if (!select) return;
  select.innerHTML = state.products.map((p) => `<option value="${p.id}">${p.productType} - ${p.productName}</option>`).join("");
}

function renderPrices() {
  renderTemplate("prices");
  fillProductSelect("price-product-select");
  const body = $("prices-body");
  state.prices.forEach((p) => {
    const product = state.products.find((x) => x.id === p.productId);
    const salePrice = p.listPrice * (1 - p.discountPct / 100);
    const profit = salePrice - (product ? productionCost(product) : 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${product ? product.productName : "삭제된 상품"}</td><td>${format3(p.listPrice)}</td><td>${format3(p.discountPct)}</td><td>${format3(salePrice)}</td><td>${format3(profit)}</td><td>${actionButtons()}</td>`;
    tr.querySelector('[data-action="edit"]').onclick = () => {
      const d = prompt("할인율(%)", p.discountPct); if (d == null) return;
      p.discountPct = Number(d); render();
    };
    tr.querySelector('[data-action="delete"]').onclick = () => { state.prices = state.prices.filter((x) => x.id !== p.id); render(); };
    body.appendChild(tr);
  });

  $("prices-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.prices.push({ id: uid(), productId: f.get("productId"), listPrice: Number(f.get("listPrice")), discountPct: Number(f.get("discountPct")) });
    e.target.reset();
    render();
  };
}

function renderInventory() {
  renderTemplate("inventory");
  fillProductSelect("sales-product-select");

  $("base-stock-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.baseStocks[f.get("materialName")] = Number(f.get("baseStock"));
    e.target.reset();
    render();
  };

  $("sales-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.sales.push({ id: uid(), period: f.get("period"), productId: f.get("productId"), quantity: Number(f.get("quantity")) });
    e.target.reset();
    render();
  };

  const usage = usedMaterialsFromSales();
  const materialNames = [...new Set([...Object.keys(state.baseStocks), ...Object.keys(usage)])];
  const body = $("inventory-body");
  materialNames.forEach((name) => {
    const base = state.baseStocks[name] || 0;
    const used = usage[name] || 0;
    const remain = base - used;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${name}</td><td>${format3(base)}</td><td>${format3(used)}</td><td>${format3(remain)}</td>`;
    body.appendChild(tr);
  });

  const salesBody = $("sales-body");
  state.sales.forEach((s) => {
    const product = state.products.find((p) => p.id === s.productId);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${s.period}</td><td>${product ? product.productName : "삭제된 상품"}</td><td>${format3(s.quantity)}</td><td><button data-action="delete">삭제</button></td>`;
    tr.querySelector('[data-action="delete"]').onclick = () => { state.sales = state.sales.filter((x) => x.id !== s.id); render(); };
    salesBody.appendChild(tr);
  });
}

function renderScenario() {
  renderTemplate("scenario");
  fillProductSelect("scenario-product-select");

  $("scenario-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.scenarios.push({ id: uid(), productId: f.get("productId"), quantity: Number(f.get("quantity")) });
    e.target.reset();
    render();
  };

  let total = 0;
  const body = $("scenario-body");
  state.scenarios.forEach((s) => {
    const product = state.products.find((p) => p.id === s.productId);
    const unit = netProfitPerUnit(s.productId);
    const expected = unit * s.quantity;
    total += expected;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${product ? product.productName : "삭제된 상품"}</td><td>${format3(s.quantity)}</td><td>${format3(unit)}</td><td>${format3(expected)}</td><td><button data-action="delete">삭제</button></td>`;
    tr.querySelector('[data-action="delete"]').onclick = () => { state.scenarios = state.scenarios.filter((x) => x.id !== s.id); render(); };
    body.appendChild(tr);
  });
  $("scenario-total").textContent = `총 예상 순수익: ${format3(total)}`;
}

function render() {
  buildSidebar();
  if (state.activeTab === "materials") return renderMaterials();
  if (state.activeTab === "packages") return renderPackages();
  if (state.activeTab === "products") return renderProducts();
  if (state.activeTab === "prices") return renderPrices();
  if (state.activeTab === "inventory") return renderInventory();
  if (state.activeTab === "scenario") return renderScenario();
}

render();
