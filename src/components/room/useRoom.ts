"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getMyHand, getRoomSnapshot } from "@/app/actions/room";
import type { PublicState } from "@/game/engine";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { handIsStale, newerGame, newerHand } from "@/lib/game-row";
import type { GameRow, GameUpdate, RoomSnapshot } from "@/lib/types";

/** Safety-net refresh period while realtime is connected, and while it is down. */
const POLL_MS = 12_000;
const POLL_DEGRADED_MS = 3_000;
const RESUBSCRIBE_MS = 3_000;

type GamePayload = { state: PublicState; version: number; turn_deadline: string | null };

export function useRoom(initial: RoomSnapshot) {
  const [snap, setSnap] = useState(initial);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(initial.serverNow - Date.now());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(false);
  /** Bumped to tear down and recreate the realtime channel after a failure. */
  const [attempt, setAttempt] = useState(0);
  const refreshing = useRef<Promise<void> | null>(null);
  const loadingHand = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      const res = await getRoomSnapshot(initial.code);
      if (!res.ok || !res.data) {
        if (!res.ok) setGone(res.error);
        return;
      }
      const next = res.data;
      setClockOffset(next.serverNow - Date.now());
      setSnap((prev) => ({
        ...next,
        // A snapshot without a game (lobby) resets it; otherwise keep whichever is newer.
        game: next.game ? newerGame(prev.game, next.game) : null,
        hand: next.game ? newerHand(prev.hand, next.hand) : null,
      }));
    })().finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [initial.code]);

  const applyGame = useCallback((row: GameRow) => {
    setSnap((prev) => ({ ...prev, game: newerGame(prev.game, row) }));
  }, []);

  const applyUpdate = useCallback((update: GameUpdate) => {
    setSnap((prev) => ({ ...prev, game: newerGame(prev.game, update.game), hand: newerHand(prev.hand, update.hand) }));
  }, []);

  /** Tells the other clients to refresh (after a lobby change). */
  const notify = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "refresh", payload: {} });
  }, []);

  const roomId = snap.id;
  const userId = snap.me.userId;

  // The public game only says that my hand changed (handRevs): fetch my tiles then.
  const stale = handIsStale(snap.game, snap.hand, userId);
  useEffect(() => {
    if (!stale || loadingHand.current) return;
    loadingHand.current = true;
    void getMyHand(roomId)
      .then((res) => {
        if (res.ok && res.data) {
          const hand = res.data;
          setSnap((prev) => ({ ...prev, hand: newerHand(prev.hand, hand) }));
        }
      })
      .finally(() => {
        loadingHand.current = false;
      });
  }, [stale, roomId, snap.game?.version]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const sb = supabaseBrowser();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    // Realtime applies RLS with the user's JWT: an expired or missing token silently yields no events.
    const { data: authSub } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) sb.realtime.setAuth(session.access_token);
    });

    (async () => {
      let { data } = await sb.auth.getSession();
      const expiresAt = (data.session?.expires_at ?? 0) * 1000;
      if (data.session && expiresAt - Date.now() < 60_000) {
        ({ data } = await sb.auth.refreshSession());
      }
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = sb
        .channel(`domino:${roomId}`, { config: { presence: { key: userId }, broadcast: { self: false } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "domino_games", filter: `room_id=eq.${roomId}` }, (p) => {
          const row = p.new as Partial<GamePayload> | null;
          if (row && row.state && typeof row.version === "number") {
            applyGame({ state: row.state, version: row.version, turnDeadline: row.turn_deadline ?? null });
          } else {
            void refresh();
          }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "domino_rooms", filter: `id=eq.${roomId}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "domino_room_players", filter: `room_id=eq.${roomId}` }, () => void refresh())
        .on("broadcast", { event: "refresh" }, () => void refresh())
        .on("presence", { event: "sync" }, () => {
          if (channel) setOnline(new Set(Object.keys(channel.presenceState())));
        })
        .on("presence", { event: "join" }, () => void refresh())
        .on("presence", { event: "leave" }, () => void refresh())
        .subscribe(async (status, err) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setRealtimeOk(true);
            await channel?.track({ at: Date.now() });
            void refresh();
            return;
          }
          setRealtimeOk(false);
          console.warn("[domino realtime]", status, err?.message ?? "");
          if (!retry) retry = setTimeout(() => setAttempt((a) => a + 1), RESUBSCRIBE_MS);
        });
      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      authSub.subscription.unsubscribe();
      channelRef.current = null;
      if (channel) void sb.removeChannel(channel);
    };
  }, [roomId, userId, applyGame, refresh, attempt]);

  // Safety net: periodic refresh (faster while realtime is down) and when the page regains focus.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, realtimeOk ? POLL_MS : POLL_DEGRADED_MS);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh, realtimeOk]);

  return { snap, online, gone, clockOffset, refresh, applyGame, applyUpdate, notify };
}
