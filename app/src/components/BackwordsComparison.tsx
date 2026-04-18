import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  Share2,
  Target,
  XCircle,
} from "lucide-react";
import {
  backwordsApi,
  type BackwordsAttempt,
  type BackwordsComparison,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { buildBackwordsResultsShareMessage } from "../utils/backwordsShare";
import { ShareModal } from "./modals/ShareModal";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { JudgeHint } from "./ui/JudgeHint";

interface BackwordsComparisonProps {
  gameId: string;
  highlightRunId?: string;
  onBack: () => void;
}

function Avatar({ src, name }: { src: string; name: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-200 text-xs font-bold dark:bg-violet-800">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function AttemptRow({
  attempt,
  index,
}: {
  attempt: BackwordsAttempt;
  index: number;
}) {
  const statusTone = attempt.matched
    ? "text-green-600 dark:text-green-400"
    : "text-zinc-500 dark:text-zinc-400";

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-gray-400 dark:text-zinc-500">
            Attempt {index + 1}
          </p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">A:</span> {attempt.guess_a}
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">B:</span> {attempt.guess_b}
          </p>
        </div>
        <div className={`text-right text-sm font-mono font-bold ${statusTone}`}>
          {attempt.overall_similarity ?? 0}%
        </div>
      </div>

      {(attempt.feedback || attempt.ai_judge_name) && (
        <p className="mt-3 flex items-start gap-1.5 text-sm italic text-gray-500 dark:text-zinc-400">
          {attempt.feedback ?? "No feedback recorded."}
          <JudgeHint
            judgeName={attempt.ai_judge_name}
            judgeVersion={attempt.ai_judge_version}
            className="mt-0.5 inline-flex items-center text-gray-400 hover:text-gray-500 dark:text-zinc-500 dark:hover:text-zinc-300"
            iconClassName="h-3.5 w-3.5 shrink-0"
          />
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-mono text-gray-500 dark:text-zinc-500">
        <div className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-900">
          Topic {attempt.topic_similarity ?? 0}%
        </div>
        <div className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-900">
          Focus {attempt.focus_similarity ?? 0}%
        </div>
        <div className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-900">
          {attempt.matched ? "Resolved" : "Missed"}
        </div>
      </div>
    </div>
  );
}

export function BackwordsComparison({
  gameId,
  highlightRunId,
  onBack,
}: BackwordsComparisonProps) {
  const { user } = useAuth();
  const [data, setData] = useState<BackwordsComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    backwordsApi
      .comparison(gameId)
      .then(setData)
      .catch((err) => setError(err.message ?? "Failed to load results"))
      .finally(() => setLoading(false));

    const onFocus = () => {
      backwordsApi
        .comparison(gameId)
        .then(setData)
        .catch(() => {});
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [gameId]);

  const viewerRun =
    data?.viewerRole === "guesser" && user
      ? (data.runs.find((run) => run.guesserId === user.uid) ?? null)
      : null;
  const activeHighlightRunId = highlightRunId ?? viewerRun?.id ?? null;

  useEffect(() => {
    if (!data || !activeHighlightRunId) return;

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`backwords-run-${activeHighlightRunId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeHighlightRunId, data]);

  if (loading) {
    return (
      <Card className="py-16 text-center text-gray-400 dark:text-zinc-500">
        Loading results...
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="space-y-4 py-16 text-center">
        <p className="text-red-500">{error ?? "Results unavailable"}</p>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </Card>
    );
  }

  const shareTitle =
    data.viewerRole === "guesser"
      ? "Share Your Backwords Results"
      : "Share This Backwords Puzzle";
  const shareButtonLabel =
    data.viewerRole === "guesser" ? "Share Results" : "Share Puzzle";
  const shareDescription =
    data.viewerRole === "guesser"
      ? "Send this link to open the comparison view with your completed run highlighted, so the creator can see exactly how you did."
      : "Send this link to challenge someone else to reverse-engineer the hidden Topic and Focus from the clue puns.";
  const shareUrl =
    data.viewerRole === "guesser" && activeHighlightRunId
      ? `${window.location.origin}?backwordsComparison=${gameId}&backwordsRun=${activeHighlightRunId}`
      : `${window.location.origin}?backwords=${gameId}`;
  const shareMessage =
    data.viewerRole === "guesser" && viewerRun
      ? buildBackwordsResultsShareMessage(viewerRun)
      : "Try to crack my Backwords puzzle on PunIntended.";

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-3xl space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={onBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-orange-500 dark:text-violet-400">
                Comparison
              </p>
              <h2 className="text-2xl font-serif italic dark:text-zinc-100">
                Backwords
              </h2>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowShareModal(true)}
          >
            <Share2 className="h-4 w-4" /> {shareButtonLabel}
          </Button>
        </div>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                Hidden Pair
              </p>
              <h3 className="mt-1 text-2xl font-serif italic dark:text-zinc-100">
                {data.game.topic} + {data.game.focus}
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                Crafted by {data.game.creatorName ?? "Unknown"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                Clue Score
              </p>
              <p className="text-3xl font-mono font-bold text-orange-600 dark:text-violet-400">
                {(data.game.creatorScore ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {data.game.clues.map((clue, index) => (
              <div
                key={`${clue.pun_text}-${index}`}
                className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <p className="font-mono text-[11px] uppercase tracking-widest text-orange-500 dark:text-violet-400">
                  Clue {index + 1}
                </p>
                <p className="mt-2 font-serif italic text-zinc-800 dark:text-zinc-200">
                  “{clue.pun_text}”
                </p>
                <p className="mt-3 text-sm font-mono font-bold text-zinc-700 dark:text-zinc-300">
                  {clue.ai_score ?? 0}/10 ·{" "}
                  {(clue.clue_score ?? 0).toLocaleString()} pts
                </p>
                {clue.ai_feedback && (
                  <p className="mt-2 flex items-start gap-1.5 text-sm italic text-gray-500 dark:text-zinc-400">
                    {clue.ai_feedback}
                    <JudgeHint
                      judgeName={clue.ai_judge_name}
                      judgeVersion={clue.ai_judge_version}
                      className="mt-0.5 inline-flex items-center text-gray-400 hover:text-gray-500 dark:text-zinc-500 dark:hover:text-zinc-300"
                      iconClassName="h-3.5 w-3.5 shrink-0"
                    />
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                Guessers
              </p>
              <h3 className="mt-1 text-xl font-serif italic dark:text-zinc-100">
                {data.solvedCount}/{data.totalGuessers} solved
              </h3>
            </div>
            <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {data.viewerRole === "creator"
                ? "Creator view"
                : "Resolved guesser view"}
            </div>
          </div>

          {data.runs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-gray-400 dark:border-zinc-700 dark:text-zinc-500">
              No one has taken this puzzle yet.
            </div>
          ) : (
            <div className="space-y-4">
              {data.runs.map((run) => {
                const isSolved = run.status === "solved";
                const title = run.guesserName ?? "Player";
                const isHighlighted = run.id === activeHighlightRunId;
                const isViewerRun = run.id === viewerRun?.id;
                const runBadgeLabel = isViewerRun
                  ? "Your run"
                  : isHighlighted
                    ? "Shared result"
                    : null;

                return (
                  <motion.div
                    key={run.id}
                    id={`backwords-run-${run.id}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`space-y-3 rounded-2xl border p-4 ${
                      isHighlighted
                        ? "border-orange-200 bg-orange-50/70 shadow-sm dark:border-violet-700/60 dark:bg-violet-950/25"
                        : "border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar src={run.guesserPhoto} name={title} />
                        <div>
                          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {title}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-zinc-500">
                            {run.attemptsUsed} attempt
                            {run.attemptsUsed === 1 ? "" : "s"} · best{" "}
                            {run.bestSimilarity ?? 0}%
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 text-sm font-medium">
                        {runBadgeLabel && (
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 dark:bg-zinc-900 dark:text-violet-300">
                            {runBadgeLabel}
                          </span>
                        )}
                        {isSolved ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-green-600 dark:text-green-400">
                              Solved
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-orange-500" />
                            <span className="text-orange-600 dark:text-orange-400">
                              {run.status === "failed"
                                ? "Failed"
                                : "In progress"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {run.attempts.length > 0 ? (
                      <div className="space-y-2">
                        {run.attempts.map((attempt, index) => (
                          <AttemptRow
                            key={`${run.id}-${index}`}
                            attempt={attempt}
                            index={index}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-sm text-gray-400 dark:border-zinc-700 dark:text-zinc-500">
                        No guesses submitted yet.
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-zinc-400">
          <BookOpenText className="h-4 w-4 shrink-0 text-orange-500 dark:text-violet-400" />
          <span>Creator clue quality is AI-scored.</span>
          <Target className="h-4 w-4 shrink-0 text-orange-500 dark:text-violet-400" />
          <span>
            Guesser ranking is determined by solve state, attempts used, and
            semantic proximity.
          </span>
        </Card>
      </motion.div>

      {showShareModal && (
        <ShareModal
          title={shareTitle}
          description={shareDescription}
          shareUrl={shareUrl}
          shareMessage={shareMessage}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}
