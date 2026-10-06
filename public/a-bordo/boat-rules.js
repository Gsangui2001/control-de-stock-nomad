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
    if (
      (plan.nextDate && plan.nextDate <= today) ||
      (plan.nextHours !== null &&
        plan.nextHours !== "" &&
        Number(plan.nextHours) <= hours)
    )
      return "Vencido";
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
  root.BoatRules = { round, number, consume, due };
  if (typeof module !== "undefined") module.exports = root.BoatRules;
})(typeof globalThis !== "undefined" ? globalThis : this);
