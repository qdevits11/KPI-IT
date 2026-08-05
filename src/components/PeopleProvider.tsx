"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PeopleDirectory } from "@/lib/avatars";
import { avatarForName } from "@/lib/avatars";

const PeopleCtx = createContext<{
  directory: PeopleDirectory;
  avatarUrl: (name: string) => string | undefined;
  refresh: () => void;
}>({
  directory: {},
  avatarUrl: () => undefined,
  refresh: () => undefined,
});

export function PeopleProvider({ children }: { children: React.ReactNode }) {
  const [directory, setDirectory] = useState<PeopleDirectory>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/people");
      if (!res.ok) return;
      const json = (await res.json()) as { people?: PeopleDirectory };
      setDirectory(json.people ?? {});
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo(
    () => ({
      directory,
      avatarUrl: (name: string) => avatarForName(directory, name),
      refresh: () => void load(),
    }),
    [directory, load],
  );

  return <PeopleCtx.Provider value={value}>{children}</PeopleCtx.Provider>;
}

export function usePeopleAvatars() {
  return useContext(PeopleCtx);
}
