"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_JOIN_DATA, type JoinData } from "@/lib/join-data";

const JoinDataContext = createContext<JoinData>(DEFAULT_JOIN_DATA);

/** Hands the server-read site data to every window. */
export function JoinDataProvider({
  data,
  children,
}: {
  data: JoinData;
  children: ReactNode;
}) {
  return (
    <JoinDataContext.Provider value={data}>{children}</JoinDataContext.Provider>
  );
}

export function useJoinData(): JoinData {
  return useContext(JoinDataContext);
}
