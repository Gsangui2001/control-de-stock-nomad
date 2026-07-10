import type { Repo } from "./Repo";
import { DemoRepo } from "./demoRepo";
import { isSupabaseConfigured } from "../config";

let instance: Repo | null = null;

/**
 * Returns the active repository singleton.
 * - If Supabase env vars are present -> SupabaseRepo (real data).
 * - Otherwise -> DemoRepo (localStorage demo data), so the app runs with no setup.
 */
export function getRepo(): Repo {
  if (instance) return instance;
  if (isSupabaseConfigured) {
    // Lazy require to avoid pulling supabase-js into the demo bundle path.
    const { SupabaseRepo } = require("./supabaseRepo") as typeof import("./supabaseRepo");
    instance = new SupabaseRepo();
  } else {
    instance = new DemoRepo();
  }
  return instance;
}

export type { Repo } from "./Repo";
