"use client";

import { useEffect, useState, useCallback } from "react";
import { useRepoContext } from "./providers/RepoProvider";
import type {
  Product,
  Recipe,
  StockMovement,
  Charter,
  Alert,
  PreparedDish,
  Purchase,
  PlannedMeal,
} from "./domain/types";
import type { MovementFilter, MealPlanFilter } from "./repo/Repo";

/** Generic async loader that refetches when the global revision changes. */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[],
  initial: T
): { data: T; loading: boolean; reload: () => void } {
  const { revision } = useRepoContext();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [localRev, setLocalRev] = useState(0);

  const reload = useCallback(() => setLocalRev((r) => r + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loader()
      .then((res) => {
        if (active) setData(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, localRev, ...deps]);

  return { data, loading, reload };
}

export function useProducts() {
  const { repo } = useRepoContext();
  return useAsync<Product[]>(() => repo.listProducts(), [], []);
}

export function useRecipes() {
  const { repo } = useRepoContext();
  return useAsync<Recipe[]>(() => repo.listRecipes(), [], []);
}

export function useMovements(filter?: MovementFilter) {
  const { repo } = useRepoContext();
  const key = JSON.stringify(filter ?? {});
  return useAsync<StockMovement[]>(() => repo.listMovements(filter), [key], []);
}

export function useCharters() {
  const { repo } = useRepoContext();
  return useAsync<Charter[]>(() => repo.listCharters(), [], []);
}

export function useAlerts() {
  const { repo } = useRepoContext();
  return useAsync<Alert[]>(() => repo.computeAlerts(), [], []);
}

export function usePreparedDishes() {
  const { repo } = useRepoContext();
  return useAsync<PreparedDish[]>(() => repo.listPreparedDishes(), [], []);
}

export function usePurchases() {
  const { repo } = useRepoContext();
  return useAsync<Purchase[]>(() => repo.listPurchases(), [], []);
}

export function useMealPlans(filter?: MealPlanFilter) {
  const { repo } = useRepoContext();
  const key = JSON.stringify(filter ?? {});
  return useAsync<PlannedMeal[]>(() => repo.listMealPlans(filter), [key], []);
}
