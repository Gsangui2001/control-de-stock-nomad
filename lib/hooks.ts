"use client";

import { useEffect, useState, useCallback } from "react";
import { useRepoContext } from "./providers/RepoProvider";
import type { Boat, Expense } from "./domain/types";
import type { ExpenseFilter } from "./repo/Repo";

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

export function useBoats() {
  const { repo } = useRepoContext();
  return useAsync<Boat[]>(() => repo.listBoats(), [], []);
}

export function useExpenses(filter?: ExpenseFilter) {
  const { repo } = useRepoContext();
  const key = JSON.stringify(filter ?? {});
  return useAsync<Expense[]>(() => repo.listExpenses(filter), [key], []);
}
