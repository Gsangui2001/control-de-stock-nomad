"use client";

import { Ship } from "lucide-react";
import { useRepoContext } from "@/lib/providers/RepoProvider";
import { useCharters } from "@/lib/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

export function CharterSwitcher() {
  const { activeCharter, setActiveCharter } = useRepoContext();
  const { data: charters } = useCharters();

  const selectable = charters.filter((c) => c.status !== "finalizado");

  return (
    <Select
      value={activeCharter?.id ?? NONE}
      onValueChange={(v) => setActiveCharter(v === NONE ? undefined : v)}
    >
      <SelectTrigger className="h-9 w-auto gap-1.5 border-none bg-primary/10 px-3 text-sm font-semibold text-primary">
        <Ship className="h-4 w-4" />
        <SelectValue placeholder="Sin charter" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sin charter activo</SelectItem>
        {selectable.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
