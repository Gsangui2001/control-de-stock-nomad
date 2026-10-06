const STORAGE_KEY = "restaurant-stock-reservations-v1";

const demoState = {
  products: [
    {
      id: crypto.randomUUID(),
      name: "Tomate perita",
      category: "Verduras",
      unit: "kg",
      min: 8,
      current: 12,
      cost: 950,
      supplier: "Mercado central",
    },
    {
      id: crypto.randomUUID(),
      name: "Mozzarella",
      category: "Lacteos",
      unit: "kg",
      min: 6,
      current: 4,
      cost: 4200,
      supplier: "Lacteos Sur",
    },
    {
      id: crypto.randomUUID(),
      name: "Vino malbec",
      category: "Bebidas",
      unit: "bot",
      min: 10,
      current: 18,
      cost: 3100,
      supplier: "Distribuidora Norte",
    },
    {
      id: crypto.randomUUID(),
      name: "Detergente",
      category: "Limpieza",
      unit: "lt",
      min: 5,
      current: 2,
      cost: 1350,
      supplier: "Insumos Pro",
    },
  ],
  movements: [],
  purchases: [],
  menuItems: [],
  orders: [],
  reservations: [
    {
      id: crypto.randomUUID(),
      name: "Laura Gimenez",
      phone: "11 5555-2468",
      date: new Date().toISOString().slice(0, 10),
      time: "21:00",
      guests: 4,
      tableNumber: 6,
      status: "confirmada",
      notes: "Mesa alejada de la puerta",
    },
  ],
};

let state = loadState();
let currentTicketLines = [];
let currentRecipeLines = [];

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const els = {
  viewTitle: document.querySelector("#viewTitle"),
  navButtons: document.querySelectorAll(".nav-btn"),
  views: document.querySelectorAll(".view"),
  productForm: document.querySelector("#productForm"),
  purchaseForm: document.querySelector("#purchaseForm"),
  menuItemForm: document.querySelector("#menuItemForm"),
  orderForm: document.querySelector("#orderForm"),
  reservationForm: document.querySelector("#reservationForm"),
  movementForm: document.querySelector("#movementForm"),
  stockTable: document.querySelector("#stockTable"),
  purchaseTable: document.querySelector("#purchaseTable"),
  ticketLineTable: document.querySelector("#ticketLineTable"),
  recipeLineTable: document.querySelector("#recipeLineTable"),
  menuItemTable: document.querySelector("#menuItemTable"),
  orderTable: document.querySelector("#orderTable"),
  movementTable: document.querySelector("#movementTable"),
  reservationTable: document.querySelector("#reservationTable"),
  movementProduct: document.querySelector("#movementProduct"),
  recipeProduct: document.querySelector("#recipeProduct"),
  orderMenuItem: document.querySelector("#orderMenuItem"),
  categoryFilter: document.querySelector("#categoryFilter"),
  stockSearch: document.querySelector("#stockSearch"),
  toast: document.querySelector("#toast"),
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return ensureStateShape(structuredClone(demoState));

  try {
    return ensureStateShape(JSON.parse(saved));
  } catch {
    return ensureStateShape(structuredClone(demoState));
  }
}

function ensureStateShape(nextState) {
  nextState.products ||= [];
  nextState.movements ||= [];
  nextState.purchases ||= [];
  nextState.menuItems ||= [];
  nextState.orders ||= [];
  nextState.reservations ||= [];
  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function byDateTime(a, b) {
  return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
}

function productStatus(product) {
  if (Number(product.current) <= 0) return ["danger", "Sin stock"];
  if (Number(product.current) <= Number(product.min)) return ["warn", "Bajo"];
  return ["ok", "OK"];
}

function reservationStatus(status) {
  const map = {
    confirmada: ["ok", "Confirmada"],
    pendiente: ["info", "Pendiente"],
    cancelada: ["danger", "Cancelada"],
  };
  return map[status] || ["info", status];
}

function renderDashboard() {
  const totalProducts = state.products.length;
  const lowStock = state.products.filter((product) => Number(product.current) <= Number(product.min));
  const totalValue = state.products.reduce(
    (sum, product) => sum + Number(product.current) * Number(product.cost),
    0,
  );
  const today = new Date().toISOString().slice(0, 10);
  const todayReservations = state.reservations.filter(
    (reservation) => reservation.date === today && reservation.status !== "cancelada",
  );
  const activeReservations = state.reservations
    .filter((reservation) => reservation.status !== "cancelada")
    .sort(byDateTime)
    .slice(0, 6);

  document.querySelector("#metricProducts").textContent = totalProducts;
  document.querySelector("#metricLowStock").textContent = lowStock.length;
  document.querySelector("#metricValue").textContent = money.format(totalValue);
  document.querySelector("#metricTodayReservations").textContent = todayReservations.length;
  document.querySelector("#alertCount").textContent = `${lowStock.length} alertas`;
  document.querySelector("#reservationCount").textContent = `${activeReservations.length} activas`;

  document.querySelector("#lowStockList").innerHTML =
    lowStock.length === 0
      ? `<div class="empty-state">No hay productos por debajo del minimo.</div>`
      : lowStock
          .map(
            (product) => `
              <article class="list-item">
                <strong>${product.name}</strong>
                <span class="list-meta">${product.current} ${product.unit} disponibles, minimo ${product.min}</span>
                <span class="list-meta">Proveedor: ${product.supplier || "Sin proveedor"}</span>
              </article>
            `,
          )
          .join("");

  document.querySelector("#upcomingReservations").innerHTML =
    activeReservations.length === 0
      ? `<div class="empty-state">No hay reservas activas cargadas.</div>`
      : activeReservations
          .map(
            (reservation) => `
              <article class="list-item">
                <strong>${reservation.name}</strong>
                <span class="list-meta">${formatDate(reservation.date)} ${reservation.time} - ${reservation.guests} personas</span>
                <span class="list-meta">Mesa ${reservation.tableNumber || "sin asignar"} - ${reservation.phone}</span>
              </article>
            `,
          )
          .join("");
}

function renderStock() {
  const query = els.stockSearch.value.trim().toLowerCase();
  const category = els.categoryFilter.value;
  const categories = [...new Set(state.products.map((product) => product.category).filter(Boolean))].sort();

  els.categoryFilter.innerHTML =
    `<option value="">Todas las categorias</option>` +
    categories.map((item) => `<option value="${item}">${item}</option>`).join("");
  els.categoryFilter.value = category;

  const visibleProducts = state.products.filter((product) => {
    const text = `${product.name} ${product.category} ${product.supplier}`.toLowerCase();
    const matchesQuery = !query || text.includes(query);
    const matchesCategory = !category || product.category === category;
    return matchesQuery && matchesCategory;
  });

  els.stockTable.innerHTML =
    visibleProducts.length === 0
      ? `<tr><td colspan="6"><div class="empty-state">No hay productos para mostrar.</div></td></tr>`
      : visibleProducts
          .map((product) => {
            const [statusClass, statusLabel] = productStatus(product);
            return `
              <tr>
                <td><strong>${product.name}</strong><br><span class="list-meta">${product.supplier || "Sin proveedor"}</span></td>
                <td>${product.category}</td>
                <td>${product.current} ${product.unit} <span class="status ${statusClass}">${statusLabel}</span></td>
                <td>${product.min} ${product.unit}</td>
                <td>${money.format(product.cost)}</td>
                <td class="actions">
                  <button class="mini-btn" type="button" data-edit-product="${product.id}">Editar</button>
                  <button class="danger-btn mini-btn" type="button" data-delete-product="${product.id}">Borrar</button>
                </td>
              </tr>
            `;
          })
          .join("");
}

function renderMovementOptions() {
  els.movementProduct.innerHTML = state.products
    .map((product) => `<option value="${product.id}">${product.name} (${product.current} ${product.unit})</option>`)
    .join("");

  els.recipeProduct.innerHTML = state.products
    .map((product) => `<option value="${product.id}">${product.name} (${product.current} ${product.unit})</option>`)
    .join("");

  els.orderMenuItem.innerHTML =
    state.menuItems.length === 0
      ? `<option value="">Primero carga un plato</option>`
      : state.menuItems.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");

  document.querySelector("#productSuggestions").innerHTML = state.products
    .map((product) => `<option value="${product.name}">${product.category} - ${product.unit}</option>`)
    .join("");
}

function renderTicketLines() {
  const total = currentTicketLines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost), 0);
  document.querySelector("#ticketTotal").textContent = money.format(total);
  els.ticketLineTable.innerHTML =
    currentTicketLines.length === 0
      ? `<tr><td colspan="4"><div class="empty-state">Agrega los productos que figuran en el ticket.</div></td></tr>`
      : currentTicketLines
          .map(
            (line, index) => `
              <tr>
                <td><strong>${line.name}</strong><br><span class="list-meta">${line.category || "Sin categoria"} - ${line.unit}</span></td>
                <td>${line.quantity} ${line.unit}</td>
                <td>${money.format(line.unitCost)}</td>
                <td><button class="danger-btn mini-btn" type="button" data-remove-ticket-line="${index}">Quitar</button></td>
              </tr>
            `,
          )
          .join("");
}

function renderPurchases() {
  els.purchaseTable.innerHTML =
    state.purchases.length === 0
      ? `<tr><td colspan="5"><div class="empty-state">Todavia no hay tickets cargados.</div></td></tr>`
      : [...state.purchases]
          .reverse()
          .map(
            (purchase) => `
              <tr>
                <td>${formatDate(purchase.date)}</td>
                <td><strong>${purchase.supplier}</strong></td>
                <td>${purchase.number || "Sin numero"}</td>
                <td>${purchase.lines.length} productos</td>
                <td>${money.format(purchase.total)}</td>
              </tr>
            `,
          )
          .join("");
}

function renderRecipeLines() {
  els.recipeLineTable.innerHTML =
    currentRecipeLines.length === 0
      ? `<tr><td colspan="3"><div class="empty-state">Agrega los insumos que consume este plato.</div></td></tr>`
      : currentRecipeLines
          .map(
            (line, index) => `
              <tr>
                <td><strong>${line.productName}</strong></td>
                <td>${line.quantity} ${line.unit}</td>
                <td><button class="danger-btn mini-btn" type="button" data-remove-recipe-line="${index}">Quitar</button></td>
              </tr>
            `,
          )
          .join("");
}

function renderMenuItems() {
  els.menuItemTable.innerHTML =
    state.menuItems.length === 0
      ? `<tr><td colspan="4"><div class="empty-state">Todavia no hay platos con consumo configurado.</div></td></tr>`
      : state.menuItems
          .map((item) => {
            const recipeText = item.recipe
              .map((line) => `${line.quantity} ${line.unit} ${line.productName}`)
              .join(", ");
            return `
              <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.price ? money.format(item.price) : "Sin precio"}</td>
                <td>${recipeText || "Sin receta"}</td>
                <td><button class="danger-btn mini-btn" type="button" data-delete-menu-item="${item.id}">Borrar</button></td>
              </tr>
            `;
          })
          .join("");
}

function renderOrders() {
  els.orderTable.innerHTML =
    state.orders.length === 0
      ? `<tr><td colspan="5"><div class="empty-state">Todavia no hay pedidos cargados.</div></td></tr>`
      : [...state.orders]
          .reverse()
          .map(
            (order) => `
              <tr>
                <td>${formatDateTime(order.createdAt)}</td>
                <td><strong>${order.itemName}</strong></td>
                <td>${order.quantity}</td>
                <td>${order.reference || "Sin referencia"}</td>
                <td>${money.format(order.total)}</td>
              </tr>
            `,
          )
          .join("");
}

function renderMovements() {
  els.movementTable.innerHTML =
    state.movements.length === 0
      ? `<tr><td colspan="5"><div class="empty-state">Todavia no hay movimientos registrados.</div></td></tr>`
      : [...state.movements]
          .reverse()
          .map(
            (movement) => `
              <tr>
                <td>${formatDateTime(movement.createdAt)}</td>
                <td>${movement.productName}</td>
                <td><span class="status ${movement.type === "entrada" ? "ok" : "warn"}">${movement.type}</span></td>
                <td>${movement.quantity} ${movement.unit}</td>
                <td>${movement.reason || "Sin motivo"}</td>
              </tr>
            `,
          )
          .join("");
}

function renderReservations() {
  const sortedReservations = [...state.reservations].sort(byDateTime);
  els.reservationTable.innerHTML =
    sortedReservations.length === 0
      ? `<tr><td colspan="6"><div class="empty-state">No hay reservas cargadas.</div></td></tr>`
      : sortedReservations
          .map((reservation) => {
            const [statusClass, statusLabel] = reservationStatus(reservation.status);
            return `
              <tr>
                <td><strong>${formatDate(reservation.date)}</strong><br><span class="list-meta">${reservation.time}</span></td>
                <td><strong>${reservation.name}</strong><br><span class="list-meta">${reservation.phone}</span></td>
                <td>${reservation.guests}</td>
                <td>${reservation.tableNumber || "Sin asignar"}</td>
                <td><span class="status ${statusClass}">${statusLabel}</span></td>
                <td class="actions">
                  <button class="mini-btn" type="button" data-edit-reservation="${reservation.id}">Editar</button>
                  <button class="danger-btn mini-btn" type="button" data-delete-reservation="${reservation.id}">Borrar</button>
                </td>
              </tr>
            `;
          })
          .join("");
}

function renderAll() {
  renderDashboard();
  renderStock();
  renderMovementOptions();
  renderTicketLines();
  renderPurchases();
  renderRecipeLines();
  renderMenuItems();
  renderOrders();
  renderMovements();
  renderReservations();
}

function setView(viewName) {
  els.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
  const activeView = document.querySelector(`#${viewName}View`);
  els.viewTitle.textContent = activeView.dataset.title;
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(date) {
  return new Date(date).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readProductForm() {
  return {
    id: document.querySelector("#productId").value || crypto.randomUUID(),
    name: document.querySelector("#productName").value.trim(),
    category: document.querySelector("#productCategory").value.trim(),
    unit: document.querySelector("#productUnit").value.trim(),
    min: Number(document.querySelector("#productMin").value),
    current: Number(document.querySelector("#productCurrent").value),
    cost: Number(document.querySelector("#productCost").value),
    supplier: document.querySelector("#productSupplier").value.trim(),
  };
}

function fillProductForm(product) {
  document.querySelector("#productId").value = product.id;
  document.querySelector("#productName").value = product.name;
  document.querySelector("#productCategory").value = product.category;
  document.querySelector("#productUnit").value = product.unit;
  document.querySelector("#productMin").value = product.min;
  document.querySelector("#productCurrent").value = product.current;
  document.querySelector("#productCost").value = product.cost;
  document.querySelector("#productSupplier").value = product.supplier;
  setView("stock");
}

function clearProductForm() {
  els.productForm.reset();
  document.querySelector("#productId").value = "";
}

function normalizeText(value) {
  return value.trim().toLowerCase();
}

function readTicketLineForm() {
  const name = document.querySelector("#ticketProductName").value.trim();
  const quantity = Number(document.querySelector("#ticketQuantity").value);
  const unitCost = Number(document.querySelector("#ticketUnitCost").value);
  const existing = state.products.find((product) => normalizeText(product.name) === normalizeText(name));

  if (!name || !quantity || quantity <= 0) {
    showToast("Carga producto y cantidad del renglon");
    return null;
  }

  return {
    name,
    category: document.querySelector("#ticketCategory").value.trim() || existing?.category || "Sin categoria",
    unit: document.querySelector("#ticketUnit").value.trim() || existing?.unit || "un",
    quantity,
    unitCost: Number.isFinite(unitCost) ? unitCost : 0,
    min: Number(document.querySelector("#ticketMinStock").value || existing?.min || 0),
  };
}

function clearTicketLineForm() {
  document.querySelector("#ticketProductName").value = "";
  document.querySelector("#ticketCategory").value = "";
  document.querySelector("#ticketUnit").value = "";
  document.querySelector("#ticketQuantity").value = "";
  document.querySelector("#ticketUnitCost").value = "";
  document.querySelector("#ticketMinStock").value = "";
}

function addRecipeLine() {
  const product = state.products.find((item) => item.id === els.recipeProduct.value);
  const quantity = Number(document.querySelector("#recipeQuantity").value);
  if (!product || !quantity || quantity <= 0) {
    showToast("Elegi insumo y cantidad de consumo");
    return;
  }

  const existing = currentRecipeLines.find((line) => line.productId === product.id);
  if (existing) {
    existing.quantity = Number((Number(existing.quantity) + quantity).toFixed(2));
  } else {
    currentRecipeLines.push({
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      quantity,
    });
  }

  document.querySelector("#recipeQuantity").value = "";
  renderRecipeLines();
}

function clearMenuItemForm() {
  els.menuItemForm.reset();
  currentRecipeLines = [];
  renderRecipeLines();
}

function saveMenuItem() {
  if (currentRecipeLines.length === 0) {
    showToast("Agrega al menos una materia prima");
    return;
  }

  const item = {
    id: crypto.randomUUID(),
    name: document.querySelector("#menuItemName").value.trim(),
    price: Number(document.querySelector("#menuItemPrice").value || 0),
    recipe: structuredClone(currentRecipeLines),
    createdAt: new Date().toISOString(),
  };

  state.menuItems.push(item);
  saveState();
  clearMenuItemForm();
  renderAll();
  showToast("Plato guardado con consumo");
}

function applyOrderToStock(orderItem, quantity, reference) {
  const shortages = orderItem.recipe
    .map((line) => {
      const product = state.products.find((item) => item.id === line.productId);
      const needed = Number(line.quantity) * quantity;
      return { product, line, needed };
    })
    .filter(({ product, needed }) => !product || Number(product.current) < needed);

  if (shortages.length > 0) {
    const first = shortages[0];
    const available = first.product ? `${first.product.current} ${first.product.unit}` : "0";
    showToast(`Stock insuficiente: ${first.line.productName}. Necesita ${first.needed}, hay ${available}`);
    return false;
  }

  orderItem.recipe.forEach((line) => {
    const product = state.products.find((item) => item.id === line.productId);
    const used = Number((Number(line.quantity) * quantity).toFixed(2));
    product.current = Number((Number(product.current) - used).toFixed(2));
    state.movements.push({
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      type: "salida",
      quantity: used,
      reason: `Pedido ${orderItem.name}${reference ? ` - ${reference}` : ""}`,
      createdAt: new Date().toISOString(),
    });
  });

  return true;
}

function addTicketLine() {
  const line = readTicketLineForm();
  if (!line) return;
  currentTicketLines.push(line);
  clearTicketLineForm();
  renderTicketLines();
}

function applyPurchaseToStock(purchase) {
  purchase.lines.forEach((line) => {
    let product = state.products.find((item) => normalizeText(item.name) === normalizeText(line.name));

    if (!product) {
      product = {
        id: crypto.randomUUID(),
        name: line.name,
        category: line.category,
        unit: line.unit,
        min: line.min,
        current: 0,
        cost: line.unitCost,
        supplier: purchase.supplier,
      };
      state.products.push(product);
    }

    product.category = line.category || product.category;
    product.unit = line.unit || product.unit;
    product.cost = line.unitCost || product.cost;
    product.supplier = purchase.supplier || product.supplier;
    product.min = line.min || product.min;
    product.current = Number((Number(product.current) + Number(line.quantity)).toFixed(2));

    state.movements.push({
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      type: "entrada",
      quantity: line.quantity,
      reason: `Compra ${purchase.number || purchase.supplier}`,
      createdAt: new Date(`${purchase.date}T12:00:00`).toISOString(),
    });
  });
}

function readReservationForm() {
  return {
    id: document.querySelector("#reservationId").value || crypto.randomUUID(),
    name: document.querySelector("#reservationName").value.trim(),
    phone: document.querySelector("#reservationPhone").value.trim(),
    date: document.querySelector("#reservationDate").value,
    time: document.querySelector("#reservationTime").value,
    guests: Number(document.querySelector("#reservationGuests").value),
    tableNumber: document.querySelector("#reservationTableNumber").value,
    status: document.querySelector("#reservationStatus").value,
    notes: document.querySelector("#reservationNotes").value.trim(),
  };
}

function fillReservationForm(reservation) {
  document.querySelector("#reservationId").value = reservation.id;
  document.querySelector("#reservationName").value = reservation.name;
  document.querySelector("#reservationPhone").value = reservation.phone;
  document.querySelector("#reservationDate").value = reservation.date;
  document.querySelector("#reservationTime").value = reservation.time;
  document.querySelector("#reservationGuests").value = reservation.guests;
  document.querySelector("#reservationTableNumber").value = reservation.tableNumber;
  document.querySelector("#reservationStatus").value = reservation.status;
  document.querySelector("#reservationNotes").value = reservation.notes;
  setView("reservations");
}

function clearReservationForm() {
  els.reservationForm.reset();
  document.querySelector("#reservationId").value = "";
  document.querySelector("#reservationStatus").value = "confirmada";
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stock-reservas-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

els.navButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

els.productForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const product = readProductForm();
  const index = state.products.findIndex((item) => item.id === product.id);
  if (index >= 0) {
    state.products[index] = product;
  } else {
    state.products.push(product);
  }
  saveState();
  clearProductForm();
  renderAll();
  showToast("Producto guardado");
});

els.movementForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const product = state.products.find((item) => item.id === els.movementProduct.value);
  const quantity = Number(document.querySelector("#movementQuantity").value);
  const type = document.querySelector("#movementType").value;
  const reason = document.querySelector("#movementReason").value.trim();
  if (!product) return;

  const nextStock = type === "entrada" ? Number(product.current) + quantity : Number(product.current) - quantity;
  if (nextStock < 0) {
    showToast("No se puede dejar stock negativo");
    return;
  }

  product.current = Number(nextStock.toFixed(2));
  state.movements.push({
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    type,
    quantity,
    reason,
    createdAt: new Date().toISOString(),
  });
  saveState();
  els.movementForm.reset();
  renderAll();
  showToast("Movimiento registrado");
});

els.reservationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const reservation = readReservationForm();
  const index = state.reservations.findIndex((item) => item.id === reservation.id);
  if (index >= 0) {
    state.reservations[index] = reservation;
  } else {
    state.reservations.push(reservation);
  }
  saveState();
  clearReservationForm();
  renderAll();
  showToast("Reserva guardada");
});

document.addEventListener("click", (event) => {
  const productEditId = event.target.dataset.editProduct;
  const productDeleteId = event.target.dataset.deleteProduct;
  const reservationEditId = event.target.dataset.editReservation;
  const reservationDeleteId = event.target.dataset.deleteReservation;
  const ticketLineIndex = event.target.dataset.removeTicketLine;
  const recipeLineIndex = event.target.dataset.removeRecipeLine;
  const menuItemDeleteId = event.target.dataset.deleteMenuItem;

  if (ticketLineIndex !== undefined) {
    currentTicketLines.splice(Number(ticketLineIndex), 1);
    renderTicketLines();
  }

  if (recipeLineIndex !== undefined) {
    currentRecipeLines.splice(Number(recipeLineIndex), 1);
    renderRecipeLines();
  }

  if (menuItemDeleteId && confirm("Borrar este plato? No borra pedidos ya cargados.")) {
    state.menuItems = state.menuItems.filter((item) => item.id !== menuItemDeleteId);
    saveState();
    renderAll();
    showToast("Plato borrado");
  }

  if (productEditId) {
    fillProductForm(state.products.find((product) => product.id === productEditId));
  }

  if (productDeleteId && confirm("Borrar este producto tambien lo quita de las opciones de movimientos. Continuar?")) {
    state.products = state.products.filter((product) => product.id !== productDeleteId);
    saveState();
    renderAll();
    showToast("Producto borrado");
  }

  if (reservationEditId) {
    fillReservationForm(state.reservations.find((reservation) => reservation.id === reservationEditId));
  }

  if (reservationDeleteId && confirm("Borrar esta reserva?")) {
    state.reservations = state.reservations.filter((reservation) => reservation.id !== reservationDeleteId);
    saveState();
    renderAll();
    showToast("Reserva borrada");
  }
});

document.querySelector("#clearProductBtn").addEventListener("click", clearProductForm);
document.querySelector("#clearReservationBtn").addEventListener("click", clearReservationForm);
document.querySelector("#addTicketLineBtn").addEventListener("click", addTicketLine);
document.querySelector("#addRecipeLineBtn").addEventListener("click", addRecipeLine);
els.menuItemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveMenuItem();
});
els.orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const orderItem = state.menuItems.find((item) => item.id === els.orderMenuItem.value);
  const quantity = Number(document.querySelector("#orderQuantity").value);
  const reference = document.querySelector("#orderReference").value.trim();
  if (!orderItem || !quantity || quantity <= 0) {
    showToast("Elegi plato y cantidad del pedido");
    return;
  }

  if (!applyOrderToStock(orderItem, quantity, reference)) return;

  state.orders.push({
    id: crypto.randomUUID(),
    itemId: orderItem.id,
    itemName: orderItem.name,
    quantity,
    reference,
    total: Number(orderItem.price) * quantity,
    createdAt: new Date().toISOString(),
  });
  saveState();
  els.orderForm.reset();
  renderAll();
  showToast("Pedido cargado y stock descontado");
});
document.querySelector("#ticketProductName").addEventListener("change", (event) => {
  const product = state.products.find((item) => normalizeText(item.name) === normalizeText(event.target.value));
  if (!product) return;
  document.querySelector("#ticketCategory").value = product.category;
  document.querySelector("#ticketUnit").value = product.unit;
  document.querySelector("#ticketUnitCost").value = product.cost;
  document.querySelector("#ticketMinStock").value = product.min;
});
els.purchaseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (currentTicketLines.length === 0) {
    showToast("Agrega al menos un renglon del ticket");
    return;
  }

  const purchase = {
    id: crypto.randomUUID(),
    supplier: document.querySelector("#purchaseSupplier").value.trim(),
    number: document.querySelector("#purchaseNumber").value.trim(),
    date: document.querySelector("#purchaseDate").value,
    lines: structuredClone(currentTicketLines),
    total: currentTicketLines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost), 0),
    createdAt: new Date().toISOString(),
  };

  state.purchases.push(purchase);
  applyPurchaseToStock(purchase);
  currentTicketLines = [];
  els.purchaseForm.reset();
  document.querySelector("#purchaseDate").value = new Date().toISOString().slice(0, 10);
  saveState();
  renderAll();
  showToast("Ticket cargado y stock actualizado");
});
document.querySelector("#exportDataBtn").addEventListener("click", exportData);
document.querySelector("#resetDemoBtn").addEventListener("click", () => {
  if (!confirm("Restaurar datos de demo? Se reemplazan los datos actuales.")) return;
  state = ensureStateShape(structuredClone(demoState));
  currentTicketLines = [];
  currentRecipeLines = [];
  saveState();
  renderAll();
  showToast("Datos de demo restaurados");
});
els.stockSearch.addEventListener("input", renderStock);
els.categoryFilter.addEventListener("change", renderStock);

document.querySelector("#reservationDate").value = new Date().toISOString().slice(0, 10);
document.querySelector("#purchaseDate").value = new Date().toISOString().slice(0, 10);
renderAll();

// Explicit import preserves old browser data until the user chooses to restore.
document.querySelector('#importLegacyBtn').onclick=()=>document.querySelector('#importLegacyFile').click();
document.querySelector('#importLegacyFile').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;
 try{
  const imported=JSON.parse(await file.text());
  if(!Array.isArray(imported.products)||!Array.isArray(imported.movements)||imported.products.some(p=>!p.id||!p.name||!Number.isFinite(Number(p.current))||Number(p.current)<0))throw new Error('El archivo no es un respaldo gastronómico válido.');
  if(!confirm('Restaurar este respaldo gastronómico? Primero se descargará una copia de los datos actuales.'))return;
  exportData();
  const next=ensureStateShape(imported);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;renderAll();showToast('Respaldo importado');
 }catch(err){showToast(err.message);}finally{event.target.value='';}
};
