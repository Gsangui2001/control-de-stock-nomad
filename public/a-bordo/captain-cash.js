"use strict";
let captainCashData = null;
let captainCashOwner = "";
let captainCashSession = null;
let captainCashLoading = false;
let captainCashError = "";
let captainCashRequest = 0;
let captainCashBookingsStatus = "initial";
const captainCashCurrentOwner = () => [boatId, session?.id, role].join("/");

function invalidateCaptainCash() {
  captainCashRequest++;
  captainCashData = null;
  captainCashError = "";
  captainCashLoading = false;
  captainCashBookingsStatus = "initial";
}

async function loadCaptainCash(refreshBookings = false) {
  const owner = captainCashOwner, boat = boatId, user = session, sequence = ++captainCashRequest;
  const current = () => sequence === captainCashRequest && session === user && owner === captainCashCurrentOwner();
  captainCashLoading = true;
  captainCashError = "";
  const refresh = refreshBookings && !session.admin;
  if (refresh) {
    captainCashBookingsStatus = "loading";
    render();
  }
  try {
    const [wallet, bookings] = await Promise.allSettled([opsFetch("captain_wallet", null, boat), refresh ? opsFetch("reservations", null, boat) : null]);
    if (!current()) return;
    if (refresh) {
      captainCashBookingsStatus = bookings.status === "fulfilled" ? "ready" : "error";
      if (bookings.status === "fulfilled") opsReservations = bookings.value;
    }
    if (wallet.status === "rejected") throw wallet.reason;
    captainCashData = wallet.value;
  } catch (error) {
    if (current()) captainCashError = error.message;
  } finally {
    if (sequence === captainCashRequest) {
      captainCashLoading = false;
      if (current() && ["ops-cash","ops-collections"].includes(dayPage)) render();
    }
  }
}

const captainMoney = (amount, currency) => esc(currency) + " " + Number(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const captainCurrency = () => '<label>Moneda<select name="currency"><option>USD</option><option>EUR</option><option>ARS</option><option>PAB</option></select></label>';

function captainPanamaDay(today = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone:"America/Panama", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(today);
  const part = type => parts.find(p => p.type === type).value;
  return [part("year"),part("month"),part("day")].join("-");
}
function captainPendingCollections(rows, today = captainPanamaDay()) {
  return rows.filter(r => {
    const start = /^\d{4}-\d{2}-\d{2}/.exec(String(r.start ?? ""))?.[0];
    const amount = r.captainBalance?.amountUsd;
    return start && start <= today && (!r.status || ["confirmed","in_progress"].includes(r.status)) &&
      r.cashAssigned !== false && !r.cashLegacyReview && !r.captainPayment &&
      r.brief?.version > 0 && !r.brief.sourceChanged && r.details?.captainCollection === "collect" &&
      r.captainBalance?.status === "known" && !r.captainBalance.reportedCount &&
      typeof amount === "number" && Number.isFinite(amount) && amount > 0;
  }).sort((a,b) => String(a.start).localeCompare(String(b.start)));
}
function captainPendingCollectionCards() {
  const heading = '<h2>Por cobrar a huéspedes</h2>';
  if (captainCashBookingsStatus === "loading") return heading + '<p role="status">Actualizando cobros pendientes…</p>';
  if (captainCashBookingsStatus === "error" || (captainCashBookingsStatus === "initial" && typeof opsError === "string" && opsError)) return heading + '<p role="alert">No se pudieron verificar los cobros pendientes. Volvé a actualizar la caja.</p>';
  const due = captainPendingCollections(opsReservations);
  return heading + (due.length ? '<p class="day-muted">No es efectivo en caja. Confirmá «Sí cobré» en la ficha solo después de recibirlo.</p>' : '') +
    (due.map(r => '<article class="day-inventory"><h3>Por cobrar ' + captainMoney(r.captainBalance.amountUsd,"USD") +
      '</h3><p>' + esc(r.name || "Huésped") + ' · ' + esc(date(r.start)) +
      '</p><button type="button" class="day-primary" data-agenda-open="' + esc(r.id) + '">Abrir ficha del huésped</button></article>').join("") ||
      empty("No tenés cobros autorizados pendientes."));
}

const captainPersonalKinds = {
  personal_contribution:"Aporté efectivo propio",
  personal_withdrawal:"Retiré efectivo propio aportado",
  personal_spend:"Pagué un gasto de mi bolsillo",
  personal_reimburse:"Recuperé un gasto de mi bolsillo desde caja Nomad"
};
function captainPersonalMetrics(b, personal) {
  const inHand = Number(personal.contributed) - Number(personal.withdrawn);
  const owed = Number(personal.spent) - Number(personal.reimbursed);
  const metric = (label,value) => '<div><dt>' + label + '</dt><dd><strong>' + value + '</strong></dd></div>';
  const format = value => captainMoney(value,b.currency);
  const physical = b.balance == null ? "Pendiente de conciliación" : format(Number(b.balance)+inHand);
  return '<p><strong>Efectivo físico: ' + physical + '</strong></p><p>Plata propia en caja: ' + format(inHand) +
    '<br>Gastos de bolsillo por recuperar: ' + format(owed) + '</p>' +
    '<dl class="guest-facts" aria-label="Totales por tipo de movimiento">' +
    metric("Ingreso capitán",format(personal.contributed)) +
    metric("Extracción capitán",format(Number(personal.withdrawn)+Number(personal.reimbursed))) +
    metric("Ingreso cliente",format(b.incoming)) + metric("Extracción Gustavo/Boris",format(b.handed_over ?? 0)) +
    '</dl><p class="day-muted">Los movimientos de Nomad y cobros se muestran desde el conteo inicial, cuando existe. Los gastos pagados directamente con caja Nomad quedan en su historial.</p>';
}

function captainFixedFund(wallet) {
  const fund = wallet.fixedFund;
  const hasFund = fund != null && Number.isFinite(fund.amount);
  const unit = hasFund ? fund.currency : "USD";
  const currencies = ["USD","EUR","ARS","PAB"].map(currency =>
    '<option' + (currency === unit ? ' selected' : '') + '>' + currency + '</option>').join("");
  const edit = session.admin ? '<details class="day-disclosure"><summary>' +
    (hasFund ? "Editar monto fijo" : "Definir monto fijo") + '</summary>' +
    opsForm("captain_fixed_fund_set",
      '<input type="hidden" name="revision" value="' + esc(fund?.revision ?? 0) + '">' +
      '<label>Moneda<select name="currency">' + currencies + '</select></label>' +
      opsField("Monto fijo","amount","number",hasFund ? fund.amount : "","required min=\"0\" max=\"1000000000\" step=\"0.01\""),
      wallet.captainId) + '</details>' : '';
  return '<article class="day-inventory"><h3>Fondo fijo de caja</h3><strong>' +
    (hasFund ? captainMoney(fund.amount,unit) : "Sin definir") + '</strong>' +
    '<p>No suma al efectivo ni se registra como cobro.</p>' +
    (hasFund ? '<p class="day-muted">Actualizado: ' + esc(briefTime(fund.updatedAt)) + '</p>' : '') + edit + '</article>';
}

function captainWallet(wallet) {
  const handovers = wallet.handovers || [];
  const personalEntries = wallet.personalEntries || [];
  const personalDetails = personalEntries.map(e => '<p><strong>' + captainMoney(e.amount,e.currency) + '</strong> · ' +
    esc(captainPersonalKinds[e.kind] || "Movimiento propio") + ' · ' + esc(e.concept) + ' · ' + esc(briefTime(e.at)) + '</p>').join("");
  const amounts = wallet.balances.map(b => {
    const balance = b.balance != null ? captainMoney(b.balance, b.currency) : b.opening == null ? "Conteo inicial pendiente" : "Saldo por conciliar en el CRM";
    const description = b.opening == null ? "Movimientos registrados" : "Desde el conteo de " + captainMoney(b.opening, b.currency);
    const personal = wallet.personal?.find(v => v.currency === b.currency);
    return '<article class="day-inventory"><h3>' + (personal ? 'Saldo de Nomad en caja · ' : 'Efectivo disponible · ') + esc(b.currency) + '</h3><strong>' + balance + '</strong><p>' + description +
      ' · Cobrado ' + captainMoney(b.incoming, b.currency) + ' · ' + (personal ? 'Gastos y reintegros ' : 'Gastado ') + captainMoney(b.spent, b.currency) +
      ' · Entregado ' + captainMoney(b.handed_over ?? 0, b.currency) + '</p>' + (personal ? captainPersonalMetrics(b,personal) : '') + '</article>';
  }).join("");
  const receipts = wallet.receipts.map(r => '<p><strong>' + captainMoney(r.amount, r.currency) + '</strong> · ' + esc(r.guest) +
    ' · ' + esc(briefTime(r.at)) + (r.reviewing ? ' · En revisión en el CRM' : ' · Registrado en el CRM') + '</p>').join("");
  const expenses = wallet.expenses.map(e => '<p><strong>' + captainMoney(e.amount, e.currency) + '</strong> · ' + esc(e.concept) +
    ' · ' + esc(briefTime(e.at)) + '</p>').join("");
  const delivered = handovers.map(h => '<p><strong>' + captainMoney(h.amount, h.currency) + '</strong> · ' + esc(h.concept) +
    ' · ' + esc(briefTime(h.at)) + ' · Recibió ' + esc(h.receivedBy) + '</p>').join("");
  return (session.admin ? '<h2>' + esc(wallet.name) + '</h2>' : '<h2>Mi efectivo</h2>') + captainFixedFund(wallet) + amounts +
    '<details class="day-disclosure"><summary>Cobros recibidos (' + wallet.receipts.length + ')</summary>' +
    (receipts || empty("Sin cobros registrados.")) + '</details><details class="day-disclosure"><summary>Gastos pagados con caja Nomad (' + wallet.expenses.length +
    ')</summary>' + (expenses || empty("Sin gastos registrados.")) + '</details>' + (wallet.personal ? '<details class="day-disclosure"><summary>Movimientos de plata propia (' + personalEntries.length + ')</summary>' + (personalDetails || empty("Sin movimientos de plata propia.")) + '</details>' : '') + '<details class="day-disclosure"><summary>Entregas (' + handovers.length +
    ')</summary>' + (delivered || empty("Sin entregas registradas.")) + '</details>';
}

function captainCashView() {
  if (!session.admin && role !== "capitan") return empty("Caja personal no disponible.");
  const owner = captainCashCurrentOwner();
  if (captainCashOwner !== owner || captainCashSession !== session) { invalidateCaptainCash(); captainCashOwner = owner; captainCashSession = session; }
  if (!captainCashData && !captainCashLoading && !captainCashError) loadCaptainCash();
  const heading = session.admin ? "Efectivo de los capitanes" : "Mi caja";
  const refresh = '<button type="button" class="day-secondary" data-captain-cash-reload>Actualizar caja</button>';
  if (captainCashError) return '<h1>' + heading + '</h1><p role="alert">' + esc(captainCashError) + '</p>' + refresh;
  if (!captainCashData) return '<h1>' + heading + '</h1><p role="status">Cargando caja…</p>';
  const wallets = captainCashData.wallets || [];
  let content = '<h1>' + heading + '</h1>' + (session.admin ? '' : captainPendingCollectionCards()) + (wallets.map(captainWallet).join("") || empty("Todavía no hay un capitán asignado al barco."));
  if (session.admin && wallets.length) {
    const choices = wallets.map(w => '<option value="' + esc(w.captainId) + '">' + esc(w.name) + '</option>').join("");
    content += '<details class="day-disclosure"><summary>Registrar conteo inicial</summary><p>Contá el efectivo que tiene el capitán en esa moneda. Podés registrar cero.</p>' +
      opsForm("captain_opening", '<label>Capitán<select name="captainId">' + choices + '</select></label>' + captainCurrency() +
        opsField("Efectivo contado","amount","number","","required min=\"0\" step=\"0.01\"")) + '</details>';
    content += '<details class="day-disclosure"><summary>Registrar entrega</summary><p>Registrá únicamente el importe que recibiste del capitán. ' +
      'El importe se descuenta de su caja en esa moneda. Sale un aviso al grupo comercial de Telegram, sin nombres.</p>' +
      (session.name?'<p>Recibe: <strong>'+esc(session.name)+'</strong></p>':'') +
      opsForm("captain_handover", '<label>Capitán<select name="captainId">' + choices + '</select></label>' + captainCurrency() +
        opsField("Importe entregado","amount","number","","required min=\"0.01\" step=\"0.01\"") +
        opsField("Nota (opcional)","note","text","","maxlength=\"140\"")) + '</details>';
  } else if (!session.admin) {
    content += '<details class="day-disclosure"><summary>Registrar un gasto de caja Nomad</summary>' +
      opsForm("captain_expense", opsField("Qué pagaste con efectivo de Nomad (ej.: cerveza, carne, pescado)","concept","text","","required maxlength=\"140\"") +
        captainCurrency() + opsField("Importe pagado","amount","number","","required min=\"0.01\" step=\"0.01\"")) + '</details>';
    if (captainCashData.personalCashVersion === 1) {
      const kinds = Object.entries(captainPersonalKinds).map(([key,label])=>'<option value="' + key + '">' + label + '</option>').join("");
      content += '<details class="day-disclosure"><summary>Registrar un movimiento de plata propia</summary>' +
      '<p>Si pagaste directamente con tu plata, no cambies el efectivo de Nomad. Si pusiste efectivo en caja, usá «Aporté efectivo propio».</p>' +
      opsForm("captain_personal_movement", '<label>Tipo de movimiento<select name="kind" required><option value="">Elegí</option>' + kinds + '</select></label>' +
        captainCurrency() + opsField("Importe","amount","number","","required min=\"0.01\" step=\"0.01\"") +
        opsField("Detalle","concept","text","","required maxlength=\"140\"")) + '</details>';
    }


  }
  return content + refresh;
}

document.addEventListener("click", event => {
  if (event.target.closest("[data-captain-cash-reload]") && !captainCashLoading) {
    loadCaptainCash(true);
  }
});
