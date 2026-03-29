import { useState, useEffect, useCallback } from "react";
import { createSSE } from "../api/sse";
import {
  gauntletApi,
  type GauntletRoundPrompt,
  type GauntletRun,
} from "../api/client";

export type GauntletPhase =
  | "idle"
  | "generating"
  | "playing"
  | "deliberating"
  | "complete";

interface GauntletState {
  phase: GauntletPhase;
  gauntletId: string | null;
  runId: string | null;
  rounds: GauntletRoundPrompt[];
  currentRoundIndex: number;
  submitting: boolean;
  runData: GauntletRun | null;
  error: string | null;
}

const INITIAL_STATE: GauntletState = {
  phase: "idle",
  gauntletId: null,
  runId: null,
  rounds: [],
  currentRoundIndex: 0,
  submitting: false,
  runData: null,
  error: null,
};

export function useGauntlet(initialGauntletId?: string) {
  const [state, setState] = useState<GauntletState>(INITIAL_STATE);

  // Auto-start from a shared URL
  useEffect(() => {
    if (initialGauntletId && state.phase === "idle") {
      startFromId(initialGauntletId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGauntletId]);

  // SSE listener during deliberating phase
  useEffect(() => {
    if (
      state.phase !== "deliberating" ||
      !state.gauntletId ||
      !state.runId
    )
      return;

    const disconnect = createSSE({
      url: `/api/gauntlet/${state.gauntletId}/run/${state.runId}/stream`,
      events: {
        "gauntlet-run-complete": (run: unknown) => {
          setState((prev) => ({
            ...prev,
            phase: "complete",
            runData: run as GauntletRun,
          }));
        },
      },
    });

    return disconnect;
  }, [state.phase, state.gauntletId, state.runId]);

  // Write/clear ?gauntlet= URL param when entering/leaving playing phase
  useEffect(() => {
    if (state.phase === "playing" && state.gauntletId) {
      const url = new URL(window.location.href);
      url.searchParams.set("gauntlet", state.gauntletId);
      window.history.pushState({}, "", url.toString());
    }
  }, [state.phase, state.gauntletId]);

  async function startFromId(gauntletId: string) {
    setState((prev) => ({ ...prev, phase: "generating", error: null }));
    try {
      const data = await gauntletApi.start(gauntletId);
      setState((prev) => ({
        ...prev,
        phase: "playing",
        gauntletId: data.gauntletId,
        runId: data.runId,
        rounds: data.rounds,
        currentRoundIndex: 0,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "idle",
        error: err instanceof Error ? err.message : "Failed to start gauntlet",
      }));
    }
  }

  const startGauntlet = useCallback(async () => {
    setState((prev) => ({ ...prev, phase: "generating", error: null }));
    try {
      const data = await gauntletApi.generate();
      setState((prev) => ({
        ...prev,
        phase: "playing",
        gauntletId: data.gauntletId,
        runId: data.runId,
        rounds: data.rounds,
        currentRoundIndex: 0,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "idle",
        error:
          err instanceof Error ? err.message : "Failed to generate gauntlet",
      }));
    }
  }, []);

  const submitRound = useCallback(
    async (punText: string, secondsRemaining: number) => {
      if (!state.gauntletId || !state.runId) return;
      setState((prev) => ({ ...prev, submitting: true }));
      try {
        await gauntletApi.submitRound(
          state.gauntletId,
          state.runId,
          state.currentRoundIndex,
          punText,
          secondsRemaining,
        );
      } catch {
        // Non-fatal: the server still processed the round
      }

      const nextIndex = state.currentRoundIndex + 1;
      if (nextIndex >= 5) {
        setState((prev) => ({
          ...prev,
          submitting: false,
          phase: "deliberating",
        }));
      } else {
        setState((prev) => ({
          ...prev,
          submitting: false,
          currentRoundIndex: nextIndex,
        }));
      }
    },
    [state.gauntletId, state.runId, state.currentRoundIndex],
  );

  const timerExpired = useCallback(() => {
    submitRound("", 0);
  }, [submitRound]);

  const reset = useCallback(() => {
    // Clear ?gauntlet= param
    const url = new URL(window.location.href);
    url.searchParams.delete("gauntlet");
    window.history.replaceState({}, "", url.toString());
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    startGauntlet,
    submitRound,
    timerExpired,
    reset,
  };
}
