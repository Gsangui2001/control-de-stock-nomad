/* Inventory and maintenance rules, shared by the interface and verification. */
(function (root) {
  const round = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;
  function number(value, name, positive = false) {
    const n = Number(value);
    if (value === "" || !Number.isFinite(n) || (positive ? n <= 0 : n < 0))
      throw new Error(
        `${name}: ingresá un número ${positive ? "mayor que cero" : "válido, igual o mayor que cero"}.`,
      );
    return n;
  }
  function consume(products, lines) {
    const grouped = new Map();
    for (const line of lines)
      grouped.set(
        line.productId,
        round(
          (grouped.get(line.productId) || 0) +
            number(line.quantity, "Cantidad", true),
        ),
      );
    for (const [id, qty] of grouped) {
      const product = products.find((p) => p.id === id);
      if (!product)
        throw new Error("Uno de los insumos ya no existe. Revisá el trabajo.");
      if (qty > product.current)
        throw new Error(
          `Stock insuficiente de ${product.name}: hay ${product.current} ${product.unit}.`,
        );
    }
    return products.map((p) => ({
      ...p,
      current: round(p.current - (grouped.get(p.id) || 0)),
    }));
  }
  function due(plan, today, hours) {
    if (!plan.nextDate && (plan.nextHours == null || plan.nextHours === "")) {
      if (plan.routineEvent) return "Según operación";
      if (plan.intervalDays || plan.intervalMonths || plan.intervalHours || plan.routineCycle) return "Primera realización";
      return "Sin programación";
    }
    if (
      (plan.nextDate && plan.nextDate < today) ||
      (plan.nextHours !== null &&
        plan.nextHours !== "" &&
        Number(plan.nextHours) <= hours)
    )
      return "Vencido";
    if(plan.nextDate === today) return "Hoy";
    const days = plan.nextDate
      ? (new Date(plan.nextDate + "T12:00:00") -
          new Date(today + "T12:00:00")) /
        86400000
      : Infinity;
    if (
      days <= 7 ||
      (plan.nextHours !== null &&
        plan.nextHours !== "" &&
        Number(plan.nextHours) - hours <= 10)
    )
      return "Próximo";
    return "Al día";
  }
  function scheduleLabel(task) {
    if (task.routineCycle) return task.cycleIndex == null ? `Ciclo de ${task.routineCycle.length} días · inicio por registrar` : `Día ${task.cycleIndex + 1} de ${task.routineCycle.length}`;
    if (task.routineEvent) return task.routineEvent;
    return [task.intervalDays === 1 ? "Diaria" : task.intervalDays === 7 ? "Semanal" : task.intervalDays ? `Cada ${task.intervalDays} días` : "", task.intervalMonths === 1 ? "Mensual" : task.intervalMonths ? `Cada ${task.intervalMonths} meses` : "", task.intervalHours ? `Cada ${task.intervalHours} horas` : ""].filter(Boolean).join(" o ");
  }
  function repeatDate(date, days = 0, months = 0) {
    const [year, month, day] = date.split('-').map(Number);
    const value = new Date(Date.UTC(year, month - 1, day));
    if (months) {
      value.setUTCDate(1);value.setUTCMonth(value.getUTCMonth() + months);
      const last = new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).getUTCDate();
      value.setUTCDate(Math.min(day,last));
    } else value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0,10);
  }
  function completeTask(task, date, hours, cycleDay) {
    task.lastCompleted = date;
    if (task.routineCycle) {
      const day = Number(cycleDay);
      if (!Number.isInteger(day) || day < 1 || day > task.routineCycle.length) throw Error('Indicá el día del ciclo que realmente realizaste.');
      task.cycleIndex = day % task.routineCycle.length;
      task.nextDate = repeatDate(date,1); task.done = false;
    } else if (task.routineEvent) {
      task.done = false; task.nextDate = ""; task.nextHours = "";
    } else if (task.intervalDays || task.intervalMonths || task.intervalHours) {
      task.done = false;
      task.nextDate = task.intervalDays || task.intervalMonths ? repeatDate(date,task.intervalDays || 0,task.intervalMonths || 0) : "";
      task.nextHours = task.intervalHours ? round(number(hours,'Horas del equipo') + task.intervalHours) : "";
    } else task.done = true;
    return task;
  }
  root.BoatRules = { round, number, consume, due, scheduleLabel, repeatDate, completeTask };
  if (typeof module !== "undefined") module.exports = root.BoatRules;
})(typeof globalThis !== "undefined" ? globalThis : this);
