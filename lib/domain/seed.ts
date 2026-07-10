import type {
  DatabaseSnapshot,
  Product,
  Recipe,
  Charter,
  StockMovement,
  PreparedDish,
  PlannedMeal,
} from "./types";
import { weightedAverageCost } from "./stock";

const now = new Date();
const iso = (offsetDays = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};
const dateOnly = (offsetDays = 0) => iso(offsetDays).slice(0, 10);

function p(
  id: string,
  name: string,
  category: Product["category"],
  unit: Product["unit"],
  currentQuantity: number,
  averageUnitCost: number,
  minimumQuantity: number,
  criticalQuantity: number,
  location: Product["location"],
  extra: Partial<Product> = {}
): Product {
  return {
    id,
    name,
    category,
    unit,
    currentQuantity,
    averageUnitCost,
    minimumQuantity,
    criticalQuantity,
    location,
    active: true,
    createdAt: iso(-30),
    updatedAt: iso(-1),
    ...extra,
  };
}

export function buildSeed(): DatabaseSnapshot {
  const products: Product[] = [
    // Pescados
    p("prod-pescado", "Pescado (filet)", "pescados", "g", 6000, 0.012, 3000, 1500, "freezer", { supplier: "Pesca del Río", expirationDate: dateOnly(6) }),
    // Carnes
    p("prod-pollo", "Pollo", "carnes", "g", 5000, 0.006, 3000, 1500, "freezer", { supplier: "Granja Sur" }),
    p("prod-carne", "Carne (bife)", "carnes", "g", 4000, 0.014, 2500, 1200, "freezer"),
    // Verduras
    p("prod-papa", "Papa", "verduras", "g", 12000, 0.0015, 5000, 2000, "deposito"),
    p("prod-tomate", "Tomate", "verduras", "g", 3000, 0.003, 2000, 800, "heladera", { expirationDate: dateOnly(4) }),
    p("prod-lechuga", "Lechuga", "verduras", "unidad", 6, 1.2, 4, 2, "heladera", { expirationDate: dateOnly(3) }),
    // Secos
    p("prod-arroz", "Arroz", "secos", "g", 8000, 0.0018, 3000, 1500, "deposito"),
    p("prod-pasta", "Pasta", "secos", "g", 6000, 0.0022, 3000, 1500, "deposito"),
    p("prod-pan", "Pan", "secos", "unidad", 20, 0.4, 10, 5, "cocina"),
    // Frutas
    p("prod-limon", "Limón", "frutas", "unidad", 24, 0.25, 12, 6, "heladera"),
    p("prod-frutas", "Frutas surtidas", "frutas", "g", 4000, 0.004, 2000, 1000, "heladera", { expirationDate: dateOnly(5) }),
    // Condimentos
    p("prod-aceite", "Aceite", "condimentos", "ml", 4000, 0.004, 1500, 800, "cocina"),
    p("prod-sal", "Sal", "condimentos", "g", 2000, 0.0008, 800, 300, "cocina"),
    p("prod-pimienta", "Pimienta", "condimentos", "g", 400, 0.02, 150, 60, "cocina"),
    // Lácteos
    p("prod-huevos", "Huevos", "lacteos", "unidad", 30, 0.18, 18, 8, "heladera"),
    // Bebidas
    p("prod-agua", "Agua", "bebidas", "botella", 24, 0.5, 12, 6, "bar"),
    p("prod-gaseosa", "Gaseosa", "bebidas", "botella", 15, 1.1, 8, 4, "bar"),
    p("prod-cerveza", "Cerveza", "bebidas", "lata", 18, 1.3, 12, 6, "heladera"),
    p("prod-vino-blanco", "Vino blanco", "bebidas", "botella", 6, 8, 4, 2, "bar"),
    p("prod-vino-tinto", "Vino tinto", "bebidas", "botella", 5, 9, 4, 2, "bar"),
    p("prod-jugo", "Jugo", "bebidas", "botella", 9, 1.4, 6, 3, "heladera"),
    p("prod-hielo", "Hielo", "bebidas", "pack", 4, 2, 3, 1, "freezer"),
    p("prod-energizante", "Energizante", "bebidas", "lata", 6, 1.8, 6, 3, "bar"),
  ];

  const recipes: Recipe[] = [
    {
      id: "rec-pescado-papas",
      name: "Pescado con papas",
      description: "Filet de pescado grillado con papas.",
      category: "Almuerzo",
      icon: "🐟",
      active: true,
      createdAt: iso(-20),
      updatedAt: iso(-2),
      items: [
        { productId: "prod-pescado", quantityPerServing: 250, unit: "g" },
        { productId: "prod-papa", quantityPerServing: 300, unit: "g" },
        { productId: "prod-aceite", quantityPerServing: 20, unit: "ml" },
        { productId: "prod-sal", quantityPerServing: 5, unit: "g" },
        { productId: "prod-limon", quantityPerServing: 0.5, unit: "unidad" },
      ],
    },
    {
      id: "rec-pollo-arroz",
      name: "Pollo con arroz",
      description: "Pollo salteado con arroz.",
      category: "Almuerzo",
      icon: "🍗",
      active: true,
      createdAt: iso(-20),
      updatedAt: iso(-2),
      items: [
        { productId: "prod-pollo", quantityPerServing: 220, unit: "g" },
        { productId: "prod-arroz", quantityPerServing: 120, unit: "g" },
        { productId: "prod-aceite", quantityPerServing: 15, unit: "ml" },
        { productId: "prod-sal", quantityPerServing: 5, unit: "g" },
      ],
    },
    {
      id: "rec-pasta-veg",
      name: "Pasta con vegetales",
      description: "Pasta con salteado de vegetales.",
      category: "Cena",
      icon: "🍝",
      active: true,
      createdAt: iso(-18),
      updatedAt: iso(-2),
      items: [
        { productId: "prod-pasta", quantityPerServing: 150, unit: "g" },
        { productId: "prod-tomate", quantityPerServing: 100, unit: "g" },
        { productId: "prod-aceite", quantityPerServing: 15, unit: "ml" },
        { productId: "prod-sal", quantityPerServing: 4, unit: "g" },
      ],
    },
    {
      id: "rec-ensalada-tropical",
      name: "Ensalada tropical",
      description: "Ensalada fresca con frutas.",
      category: "Entrada",
      icon: "🥗",
      active: true,
      createdAt: iso(-18),
      updatedAt: iso(-2),
      items: [
        { productId: "prod-lechuga", quantityPerServing: 0.3, unit: "unidad" },
        { productId: "prod-tomate", quantityPerServing: 80, unit: "g" },
        { productId: "prod-frutas", quantityPerServing: 120, unit: "g" },
      ],
    },
    {
      id: "rec-desayuno",
      name: "Desayuno completo",
      description: "Huevos, pan y frutas.",
      category: "Desayuno",
      icon: "🍳",
      active: true,
      createdAt: iso(-16),
      updatedAt: iso(-2),
      items: [
        { productId: "prod-huevos", quantityPerServing: 2, unit: "unidad" },
        { productId: "prod-pan", quantityPerServing: 1, unit: "unidad" },
        { productId: "prod-frutas", quantityPerServing: 100, unit: "g" },
      ],
    },
    {
      id: "rec-tabla-frutas",
      name: "Tabla de frutas",
      description: "Selección de frutas de estación.",
      category: "Snack",
      icon: "🍉",
      active: true,
      createdAt: iso(-14),
      updatedAt: iso(-2),
      items: [{ productId: "prod-frutas", quantityPerServing: 200, unit: "g" }],
    },
    {
      id: "rec-cena-veg",
      name: "Cena vegetariana",
      description: "Arroz con vegetales salteados.",
      category: "Cena",
      icon: "🌱",
      active: true,
      createdAt: iso(-14),
      updatedAt: iso(-2),
      items: [
        { productId: "prod-arroz", quantityPerServing: 130, unit: "g" },
        { productId: "prod-tomate", quantityPerServing: 90, unit: "g" },
        { productId: "prod-lechuga", quantityPerServing: 0.2, unit: "unidad" },
        { productId: "prod-aceite", quantityPerServing: 12, unit: "ml" },
      ],
    },
  ];

  const charters: Charter[] = [
    {
      id: "charter-001",
      code: "NS-2026-001",
      customerName: "Grupo Fernández",
      startDate: dateOnly(-1),
      endDate: dateOnly(2),
      guestCount: 8,
      boat: "Nomad I",
      status: "activo",
      notes: "Salida bahía norte.",
    },
    {
      id: "charter-002",
      code: "NS-2026-002",
      customerName: "Empresa Marea",
      startDate: dateOnly(6),
      endDate: dateOnly(8),
      guestCount: 12,
      boat: "Nomad II",
      status: "proximo",
    },
  ];

  // Demo movements: a couple of purchases + a prepared dish today + beverage consumption.
  const movements: StockMovement[] = [];
  const preparedDishes: PreparedDish[] = [];

  // Prepared dish today: 4 servings of pescado con papas on active charter
  const pd: PreparedDish = {
    id: "pd-demo-1",
    recipeId: "rec-pescado-papas",
    recipeName: "Pescado con papas",
    servings: 4,
    charterId: "charter-001",
    preparedBy: "Cocinero demo",
    preparedAt: iso(0),
    totalCost: 0,
  };
  const recPP = recipes[0];
  let pdCost = 0;
  for (const item of recPP.items) {
    const prod = products.find((x) => x.id === item.productId)!;
    const qty = item.quantityPerServing * pd.servings;
    pdCost += qty * prod.averageUnitCost;
    movements.push({
      id: `mv-pd-${item.productId}`,
      productId: item.productId,
      movementType: "preparacion",
      quantity: -qty,
      unit: item.unit,
      costAmount: qty * prod.averageUnitCost,
      charterId: "charter-001",
      recipeId: recPP.id,
      preparedDishId: pd.id,
      notes: "Demo: 4 porciones",
      createdBy: "Cocinero demo",
      createdAt: iso(0),
    });
  }
  pd.totalCost = pdCost;
  preparedDishes.push(pd);

  // Beverage consumption today: 4 cervezas
  const cerveza = products.find((x) => x.id === "prod-cerveza")!;
  movements.push({
    id: "mv-bev-1",
    productId: "prod-cerveza",
    movementType: "consumo_bebida",
    quantity: -4,
    unit: "lata",
    costAmount: 4 * cerveza.averageUnitCost,
    charterId: "charter-001",
    notes: "El cliente consumió 4 cervezas",
    createdBy: "Cocinero demo",
    createdAt: iso(0),
  });

  // Ajuste manual example (merma)
  movements.push({
    id: "mv-adj-1",
    productId: "prod-tomate",
    movementType: "merma",
    quantity: -200,
    unit: "g",
    costAmount: 200 * products.find((x) => x.id === "prod-tomate")!.averageUnitCost,
    notes: "Tomates en mal estado",
    createdBy: "Admin demo",
    createdAt: iso(-1),
  });

  // A past purchase movement (informational history)
  movements.push({
    id: "mv-buy-1",
    productId: "prod-pescado",
    movementType: "compra",
    quantity: 5000,
    unit: "g",
    costAmount: 60,
    notes: "Compra inicial",
    createdBy: "Admin demo",
    createdAt: iso(-3),
  });

  // Comidas planificadas demo para el charter activo (no descuentan stock).
  const mealPlans: PlannedMeal[] = [
    {
      id: "plan-1",
      charterId: "charter-001",
      date: dateOnly(0),
      slot: "almuerzo",
      dishes: [{ recipeId: "rec-pescado-papas", servings: 8 }],
      beverages: [
        { productId: "prod-agua", quantity: 8 },
        { productId: "prod-vino-blanco", quantity: 2 },
      ],
      status: "planificado",
      createdBy: "Admin demo",
      createdAt: iso(-1),
    },
    {
      id: "plan-2",
      charterId: "charter-001",
      date: dateOnly(0),
      slot: "cena",
      dishes: [{ recipeId: "rec-pasta-veg", servings: 8 }],
      beverages: [{ productId: "prod-cerveza", quantity: 6 }],
      status: "planificado",
      createdBy: "Admin demo",
      createdAt: iso(-1),
    },
    {
      id: "plan-3",
      charterId: "charter-001",
      date: dateOnly(1),
      slot: "desayuno",
      dishes: [{ recipeId: "rec-desayuno", servings: 8 }],
      beverages: [{ productId: "prod-jugo", quantity: 8 }],
      status: "planificado",
      createdBy: "Admin demo",
      createdAt: iso(-1),
    },
  ];

  return {
    products,
    recipes,
    purchases: [],
    movements,
    preparedDishes,
    charters,
    mealPlans,
    settings: {
      currency: "USD",
      allowNegativeStock: false,
      expiryWarningDays: 5,
    },
    activeCharterId: "charter-001",
  };
}

// re-export so callers importing from seed can use it if needed
export { weightedAverageCost };
