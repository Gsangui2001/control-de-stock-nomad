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

function captainWallet(wallet) {
  const handovers = wallet.handovers || [];
  const amounts = wallet.balances.map(b => {
    const balance = b.balance != null ? captainMoney(b.balance, b.currency) : b.opening == null ? "Conteo inicial pendiente" : "Saldo por conciliar en el CRM";
    const description = b.opening == null ? "Movimientos registrados" : "Desde el conteo de " + captainMoney(b.opening, b.currency);
    return '<article class="day-inventory"><h3>' + esc(b.currency) + '</h3><strong>' + balance + '</strong><p>' + description +
      ' · Cobrado ' + captainMoney(b.incoming, b.currency) + ' · Gastado ' + captainMoney(b.spent, b.currency) +
      ' · Entregado ' + captainMoney(b.handed_over ?? 0, b.currency) + '</p></article>';
  }).join("");
  const receipts = wallet.receipts.map(r => '<p><strong>' + captainMoney(r.amount, r.currency) + '</strong> · ' + esc(r.guest) +
    ' · ' + esc(briefTime(r.at)) + (r.reviewing ? ' · En revisión en el CRM' : ' · Registrado en el CRM') + '</p>').join("");
  const expenses = wallet.expenses.map(e => '<p><strong>' + captainMoney(e.amount, e.currency) + '</strong> · ' + esc(e.concept) +
    ' · ' + esc(briefTime(e.at)) + '</p>').join("");
  const delivered = handovers.map(h => '<p><strong>' + captainMoney(h.amount, h.currency) + '</strong> · ' + esc(h.concept) +
    ' · ' + esc(briefTime(h.at)) + ' · Recibió ' + esc(h.receivedBy) + '</p>').join("");
  return (session.admin ? '<h2>' + esc(wallet.name) + '</h2>' : '<h2>Mi efectivo</h2>') + amounts +
    '<details class="day-disclosure"><summary>Cobros recibidos (' + wallet.receipts.length + ')</summary>' +
    (receipts || empty("Sin cobros registrados.")) + '</details><details class="day-disclosure"><summary>Gastos propios (' + wallet.expenses.length +
    ')</summary>' + (expenses || empty("Sin gastos registrados.")) + '</details><details class="day-disclosure"><summary>Entregas (' + handovers.length +
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
  let content = '<h1>' + heading + '</h1>' + (wallets.map(captainWallet).join("") || empty("Todavía no hay un capitán asignado al barco."));
  if (session.admin && wallets.length) {
    const choices = wallets.map(w => '<option value="' + esc(w.captainId) + '">' + esc(w.name) + '</option>').join("");
    content += '<details class="day-disclosure"><summary>Registrar conteo inicial</summary><p>Contá el efectivo que tiene el capitán en esa moneda. Podés registrar cero.</p>' +
      opsForm("captain_opening", '<label>Capitán<select name="captainId">' + choices + '</select></label>' + captainCurrency() +
        opsField("Efectivo contado","amount","number","","required min=\"0\" step=\"0.01\"")) + '</details>';
    content += '<details class="day-disclosure"><summary>Registrar entrega</summary><p>Registrá el efectivo que el capitán te entregó. ' +
      'No puede superar lo que tiene en su caja en esa moneda. Sale un aviso al grupo comercial de Telegram, sin nombres.</p>' +
      opsForm("captain_handover", '<label>Capitán<select name="captainId">' + choices + '</select></label>' + captainCurrency() +
        opsField("Importe entregado","amount","number","","required min=\"0.01\" step=\"0.01\"") +
        opsField("Nota (opcional)","note","text","","maxlength=\"140\"")) + '</details>';
  } else if (!session.admin) {
    content += '<details class="day-disclosure"><summary>Registrar un gasto propio</summary>' +
      opsForm("captain_expense", opsField("Qué pagaste con el efectivo de tu caja","concept","text","","required maxlength=\"140\"") +
        captainCurrency() + opsField("Importe pagado","amount","number","","required min=\"0.01\" step=\"0.01\"")) + '</details>';
    const due = opsReservations.filter(r => r.cashAssigned !== false && !r.cashLegacyReview && !r.captainPayment &&
      r.brief?.version > 0 && !r.brief.sourceChanged && r.details?.captainCollection === "collect" &&
      r.captainBalance?.status === "known" && !r.captainBalance.reportedCount && r.captainBalance.amountUsd > 0);
    content += '<h2>Cobros pendientes</h2>';
    if (captainCashBookingsStatus === "loading") content += '<p role="status">Actualizando cobros pendientes…</p>';
    else if (captainCashBookingsStatus === "error" || (captainCashBookingsStatus === "initial" && typeof opsError === "string" && opsError)) content += '<p role="alert">No se pudieron verificar los cobros pendientes. Volvé a actualizar la caja.</p>';
    else content += (due.map(r => '<article class="day-inventory"><h3>' + esc(r.name || "Huésped") + '</h3><p>' +
      esc(date(r.start)) + ' · ' + captainMoney(r.captainBalance.amountUsd,"USD") +
      '</p><button type="button" class="day-secondary" data-agenda-open="' + esc(r.id) + '">Abrir ficha del huésped</button></article>').join("") ||
      empty("No tenés cobros autorizados pendientes."));
  }
  return content + refresh;
}

document.addEventListener("click", event => {
  if (event.target.closest("[data-captain-cash-reload]") && !captainCashLoading) {
    loadCaptainCash(true);
  }
});
