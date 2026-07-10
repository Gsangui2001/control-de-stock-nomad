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
import type { Charter, Settings, User } from "../domain/types";

interface RepoContextValue {
  repo: Repo;
  mode: "demo" | "supabase";
  ready: boolean;
  user: User | null;
  setUser: (u: User | null) => Promise<void>;
  activeCharter?: Charter;
  setActiveCharter: (id: string | undefined) => Promise<void>;
  settings: Settings;
  revision: number;
  /** bump after any mutation to trigger refetch of hooks */
  refresh: () => void;
}

const RepoContext = createContext<RepoContextValue | null>(null);

const DEFAULT_SETTINGS: Settings = {
  currency: "USD",
  allowNegativeStock: false,
  expiryWarningDays: 5,
};

export function RepoProvider({ children }: { children: React.ReactNode }) {
  const repoRef = useRef<Repo | null>(null);
  if (!repoRef.current) repoRef.current = getRepo();
  const repo = repoRef.current;

  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [user, setUserState] = useState<User | null>(null);
  const [activeCharter, setActiveCharterState] = useState<Charter | undefined>();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  const loadMeta = useCallback(async () => {
    const [u, c, s] = await Promise.all([
      repo.getCurrentUser(),
      repo.getActiveCharter(),
      repo.getSettings(),
    ]);
    setUserState(u);
    setActiveCharterState(c);
    setSettings(s);
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

  const setActiveCharter = useCallback(
    async (id: string | undefined) => {
      await repo.setActiveCharter(id);
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
      activeCharter,
      setActiveCharter,
      settings,
      revision,
      refresh,
    }),
    [repo, ready, user, setUser, activeCharter, setActiveCharter, settings, revision, refresh]
  );

  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepoContext(): RepoContextValue {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepoContext must be used within RepoProvider");
  return ctx;
}
