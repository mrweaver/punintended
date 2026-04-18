import { useCallback, useEffect, useState } from "react";
import { createSSE } from "../api/sse";
import {
  backwordsApi,
  type BackwordsGame,
  type BackwordsRun,
  type BackwordsStartResponse,
} from "../api/client";

export type BackwordsPhase =
  | "idle"
  | "assigning"
  | "crafting"
  | "publishing"
  | "guessing"
  | "judging"
  | "complete";

interface BackwordsState {
  role: "creator" | "guesser" | null;
  phase: BackwordsPhase;
  game: BackwordsGame | null;
  run: BackwordsRun | null;
  submitting: boolean;
  error: string | null;
}

const INITIAL_STATE: BackwordsState = {
  role: null,
  phase: "idle",
  game: null,
  run: null,
  submitting: false,
  error: null,
};

function getCreatorPhase(game: BackwordsGame): BackwordsPhase {
  if (game.status === "draft") return "crafting";
  if (game.creatorScore === null || game.creatorScore === undefined) {
    return "publishing";
  }
  return "complete";
}

function getGuesserPhase(run: BackwordsRun): BackwordsPhase {
  if (run.status === "judging") return "judging";
  if (run.status === "solved" || run.status === "failed") {
    return "complete";
  }
  return "guessing";
}

export function useBackwords(initialGameId?: string) {
  const [state, setState] = useState<BackwordsState>(INITIAL_STATE);

  const hydrateState = useCallback((data: BackwordsStartResponse) => {
    if (data.role === "creator") {
      setState({
        role: "creator",
        phase: getCreatorPhase(data.game),
        game: data.game,
        run: null,
        submitting: false,
        error: null,
      });
      return;
    }

    setState({
      role: "guesser",
      phase: getGuesserPhase(data.run),
      game: data.game,
      run: data.run,
      submitting: false,
      error: null,
    });
  }, []);

  const openBackwords = useCallback(
    async (gameId: string) => {
      setState((prev) => ({
        ...prev,
        phase: "assigning",
        submitting: false,
        error: null,
      }));

      try {
        const data = await backwordsApi.start(gameId);
        hydrateState(data);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          phase: "idle",
          error:
            err instanceof Error
              ? err.message
              : "Failed to open Backwords puzzle",
        }));
      }
    },
    [hydrateState],
  );

  useEffect(() => {
    if (initialGameId && state.phase === "idle") {
      openBackwords(initialGameId);
    }
  }, [initialGameId, openBackwords, state.phase]);

  useEffect(() => {
    if (!state.game || state.phase === "idle") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("backwords") === state.game.id) {
      return;
    }
    url.searchParams.set("backwords", state.game.id);
    window.history.replaceState({}, "", url.toString());
  }, [state.game?.id, state.phase]);

  useEffect(() => {
    if (state.role !== "creator" || state.phase !== "publishing" || !state.game) {
      return;
    }

    return createSSE({
      url: `/api/backwords/${state.game.id}/stream`,
      events: {
        "backwords-game-updated": (game: unknown) => {
          const nextGame = game as BackwordsGame;
          setState((prev) => ({
            ...prev,
            game: nextGame,
            phase: getCreatorPhase(nextGame),
            submitting: false,
          }));
        },
      },
    });
  }, [state.game, state.phase, state.role]);

  useEffect(() => {
    if (
      state.role !== "guesser" ||
      state.phase !== "judging" ||
      !state.game ||
      !state.run
    ) {
      return;
    }

    return createSSE({
      url: `/api/backwords/${state.game.id}/run/${state.run.id}/stream`,
      events: {
        "backwords-run-updated": (run: unknown) => {
          const nextRun = run as BackwordsRun;

          if (nextRun.status === "solved" || nextRun.status === "failed") {
            backwordsApi
              .start(state.game!.id)
              .then(hydrateState)
              .catch(() => {
                setState((prev) => ({
                  ...prev,
                  run: nextRun,
                  phase: "complete",
                  submitting: false,
                }));
              });
            return;
          }

          setState((prev) => ({
            ...prev,
            run: nextRun,
            phase: getGuesserPhase(nextRun),
            submitting: false,
          }));
        },
      },
    });
  }, [hydrateState, state.game, state.phase, state.role, state.run]);

  const startBackwords = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      phase: "assigning",
      submitting: false,
      error: null,
    }));

    try {
      const data = await backwordsApi.generate();
      hydrateState(data);
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "idle",
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate Backwords puzzle",
      }));
    }
  }, [hydrateState]);

  const publishClues = useCallback(
    async (clues: string[]) => {
      if (state.role !== "creator" || !state.game) return;

      setState((prev) => ({ ...prev, submitting: true, error: null }));

      try {
        const data = await backwordsApi.publish(state.game.id, clues);
        hydrateState(data);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          submitting: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to publish Backwords puzzle",
        }));
      }
    },
    [hydrateState, state.game, state.role],
  );

  const submitGuess = useCallback(
    async (guessA: string, guessB: string) => {
      if (state.role !== "guesser" || !state.game || !state.run) return;

      setState((prev) => ({ ...prev, submitting: true, error: null }));

      try {
        const response = await backwordsApi.submitGuess(
          state.game.id,
          state.run.id,
          guessA,
          guessB,
        );
        setState((prev) => ({
          ...prev,
          run: response.run,
          phase: "judging",
          submitting: false,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          submitting: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to submit Backwords guess",
        }));
      }
    },
    [state.game, state.role, state.run],
  );

  const reset = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("backwords");
    window.history.replaceState({}, "", url.toString());
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    startBackwords,
    openBackwords,
    publishClues,
    submitGuess,
    reset,
  };
}