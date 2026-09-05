"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getRepo } from "../repo";
import type { Repo } from "../repo/Repo";
import type { User } from "../domain/types";

interface RepoContextValue {
  repo: Repo;
  mode: "demo" | "supabase";
  ready: boolean;
  user: User | null;
  setUser: (u: User | null) => Promise<void>;
  revision: number;
  /** bump after any mutation to trigger refetch of hooks */
  refresh: () => void;
}

const RepoContext = createContext<RepoContextValue | null>(null);

export function RepoProvider({ children }: { children: React.ReactNode }) {
  const repoRef = useRef<Repo | null>(null);
  if (!repoRef.current) repoRef.current = getRepo();
  const repo = repoRef.current;

  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [user, setUserState] = useState<User | null>(null);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  const loadMeta = useCallback(async () => {
    const u = await repo.getCurrentUser();
    setUserState(u);
  }, [repo]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadMeta();
      if (mounted) setReady(true);
    })();
    return () => {
      mounted = false;
    };
    // reload meta on revision changes too
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMeta, revision]);

  const setUser = useCallback(
    async (u: User | null) => {
      await repo.setCurrentUser(u);
      setUserState(u);
      refresh();
    },
    [repo, refresh]
  );

  const value = useMemo<RepoContextValue>(
    () => ({
      repo,
      mode: repo.mode,
      ready,
      user,
      setUser,
      revision,
      refresh,
    }),
    [repo, ready, user, setUser, revision, refresh]
  );

  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepoContext(): RepoContextValue {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepoContext must be used within RepoProvider");
  return ctx;
}
