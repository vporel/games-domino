"use client";

import { useEffect, useRef, useState } from "react";
import { describeEvents, LogLine, SeatInfo } from "@/game/describe";
import type { TableState } from "@/game/engine";

const MAX_LOG = 40;

type Entry = LogLine & { id: number };

/** Journal of the game: appends the lines of each new action, newest first. */
export function useGameLog(state: TableState, seats: SeatInfo[]) {
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const nextId = useRef(0);
  const toEntries = (lines: LogLine[]) => lines.map((l) => ({ ...l, id: nextId.current++ })).reverse();

  const [log, setLog] = useState<Entry[]>(() => toEntries(describeEvents(state.events, seats)));
  const seen = useRef(state.seq);

  useEffect(() => {
    if (state.seq <= seen.current) return;
    seen.current = state.seq;
    const lines = describeEvents(state.events, seatsRef.current);
    setLog((prev) => [...toEntries(lines), ...prev].slice(0, MAX_LOG));
  }, [state.seq, state.events]);

  return log;
}
