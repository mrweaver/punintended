import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  MessageSquare,
  Search,
} from "lucide-react";
import { profileApi, type Pun, type PunComment } from "../api/client";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { GroanBadge } from "./ui/GroanBadge";
import { useComments } from "../hooks/useComments";
import { formatElapsedTime } from "../hooks/useChallengeReveal";

type SortField = "date" | "score" | "groans";

type SubmissionGroup = {
  challengeId: string;
  challengeTopic: string | null;
  challengeFocus: string | null;
  puns: Pun[];
  avgScore: string;
  totalGroans: number;
};

function formatChallengeDate(challengeId: string) {
  const [year, month, day] = challengeId.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatReactionSummary(comment: PunComment) {
  const reactions = Object.entries(comment.reactions ?? {});
  if (reactions.length === 0) return null;
  return reactions
    .map(([reaction, count]) => `${reaction} ${count}`)
    .join("  ");
}

function scoreBadgeClass(score: number | null) {
  if (score === null) {
    return "bg-surface-muted text-text-secondary";
  }
  if (score >= 7) {
    return "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  }
  if (score >= 4) {
    return "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
  }
  return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
}

export function MySubmissionsView({ onClose }: { onClose: () => void }) {
  const [puns, setPuns] = useState<Pun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedPuns, setExpandedPuns] = useState<Set<string>>(new Set());
  const { getCommentsForPun, loadCommentsForPun } = useComments();

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    profileApi
      .getPuns()
      .then((result) => {
        if (cancelled) return;

        setPuns(result);

        const newestChallengeId = result[0]?.challengeId;
        if (newestChallengeId) {
          setExpandedDates(new Set([newestChallengeId]));
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load submissions",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const groupedPuns = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const filtered = query
      ? puns.filter((pun) => {
          return (
            pun.text.toLowerCase().includes(query) ||
            pun.challengeTopic?.toLowerCase().includes(query) ||
            pun.challengeFocus?.toLowerCase().includes(query)
          );
        })
      : puns;

    const grouped = new Map<string, Pun[]>();

    filtered.forEach((pun) => {
      const challengeId =
        pun.challengeId || new Date(pun.createdAt).toLocaleDateString("en-CA");
      const current = grouped.get(challengeId) ?? [];
      current.push(pun);
      grouped.set(challengeId, current);
    });

    return Array.from(grouped.entries())
      .map(([challengeId, entries]) => {
        const sortedEntries = [...entries].sort((left, right) => {
          if (sortField === "score") {
            const scoreDiff = (right.aiScore ?? -1) - (left.aiScore ?? -1);
            if (scoreDiff !== 0) return scoreDiff;
          }

          if (sortField === "groans") {
            const groanDiff = right.groanCount - left.groanCount;
            if (groanDiff !== 0) return groanDiff;
          }

          return (
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime()
          );
        });

        const scoredEntries = entries.filter((pun) => pun.aiScore !== null);
        const averageScore =
          scoredEntries.length > 0
            ? (
                scoredEntries.reduce(
                  (sum, pun) => sum + (pun.aiScore ?? 0),
                  0,
                ) / scoredEntries.length
              ).toFixed(1)
            : "-";

        return {
          challengeId,
          challengeTopic: entries[0]?.challengeTopic ?? null,
          challengeFocus: entries[0]?.challengeFocus ?? null,
          puns: sortedEntries,
          avgScore: averageScore,
          totalGroans: entries.reduce((sum, pun) => sum + pun.groanCount, 0),
        } satisfies SubmissionGroup;
      })
      .sort((left, right) => right.challengeId.localeCompare(left.challengeId));
  }, [filter, puns, sortField]);

  const summary = useMemo(() => {
    const scoredEntries = puns.filter((pun) => pun.aiScore !== null);

    return {
      totalPuns: puns.length,
      totalDates: new Set(puns.map((pun) => pun.challengeId)).size,
      avgScore:
        scoredEntries.length > 0
          ? (
              scoredEntries.reduce((sum, pun) => sum + (pun.aiScore ?? 0), 0) /
              scoredEntries.length
            ).toFixed(1)
          : "-",
      totalGroans: puns.reduce((sum, pun) => sum + pun.groanCount, 0),
    };
  }, [puns]);

  const toggleDate = (challengeId: string) => {
    setExpandedDates((current) => {
      const next = new Set(current);
      if (next.has(challengeId)) {
        next.delete(challengeId);
      } else {
        next.add(challengeId);
      }
      return next;
    });
  };

  const togglePun = async (punId: string) => {
    const isExpanded = expandedPuns.has(punId);

    setExpandedPuns((current) => {
      const next = new Set(current);
      if (next.has(punId)) {
        next.delete(punId);
      } else {
        next.add(punId);
      }
      return next;
    });

    if (!isExpanded && getCommentsForPun(punId).length === 0) {
      await loadCommentsForPun(punId).catch(console.error);
    }
  };

  return (
    <motion.div
      key="submissions"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <Card className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Button variant="ghost" onClick={onClose} className="-ml-4">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">
                Personal Archive
              </p>
              <h1 className="text-3xl font-serif italic text-text sm:text-4xl">
                My Submissions
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
              Review every daily pun, AI score, community groan, and comment in
              one place. This stays useful even if you never join a group.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
            <div className="rounded-2xl bg-surface-muted px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                Puns
              </p>
              <p className="mt-1 text-2xl font-semibold text-text">
                {summary.totalPuns}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-muted px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                Days
              </p>
              <p className="mt-1 text-2xl font-semibold text-text">
                {summary.totalDates}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-muted px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                Avg Score
              </p>
              <p className="mt-1 text-2xl font-semibold text-text">
                {summary.avgScore}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-muted px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                Groans
              </p>
              <p className="mt-1 text-2xl font-semibold text-text">
                {summary.totalGroans}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter by pun text, topic, or focus"
              className="w-full rounded-2xl border border-border-strong bg-surface px-10 py-3 text-sm text-text outline-none transition-colors focus:ring-2 focus:ring-accent-ring"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: "Recent", value: "date" },
              { label: "Score", value: "score" },
              { label: "Groans", value: "groans" },
            ].map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={sortField === option.value ? "secondary" : "outline"}
                onClick={() => setSortField(option.value as SortField)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <Card>
          <p className="py-8 text-center text-sm text-text-secondary">
            Loading your submissions...
          </p>
        </Card>
      ) : error ? (
        <Card>
          <p className="py-8 text-center text-sm text-danger">{error}</p>
        </Card>
      ) : groupedPuns.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-text-secondary">
            {puns.length === 0
              ? "You have not submitted any daily puns yet."
              : "No submissions match that filter."}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedPuns.map((group) => {
            const isExpanded = expandedDates.has(group.challengeId);
            const isToday =
              group.challengeId === new Date().toLocaleDateString("en-CA");

            return (
              <Card key={group.challengeId} className="space-y-4 p-0">
                <button
                  type="button"
                  onClick={() => toggleDate(group.challengeId)}
                  className="flex w-full items-start justify-between gap-4 px-4 py-5 text-left sm:px-6"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-text-muted">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatChallengeDate(group.challengeId)}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-accent-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-foreground">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                      {group.challengeTopic && (
                        <span className="rounded-full border border-border px-3 py-1">
                          Topic: {group.challengeTopic}
                        </span>
                      )}
                      {group.challengeFocus && (
                        <span className="rounded-full border border-border px-3 py-1">
                          Focus: {group.challengeFocus}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="hidden text-right text-xs text-text-secondary sm:block">
                      <p>
                        {group.puns.length} pun
                        {group.puns.length === 1 ? "" : "s"}
                      </p>
                      <p>{group.avgScore}/10 avg score</p>
                      <p>
                        {group.totalGroans} groan
                        {group.totalGroans === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 border-t border-border px-4 py-4 sm:px-6 sm:py-5">
                        {group.puns.map((pun) => {
                          const comments = getCommentsForPun(pun.id);
                          const isPunExpanded = expandedPuns.has(pun.id);

                          return (
                            <div
                              key={pun.id}
                              className="rounded-2xl border border-border bg-surface-muted p-4"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-2">
                                  <p className="text-xl font-serif italic text-text">
                                    "{pun.text}"
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                                    <span>
                                      Submitted{" "}
                                      {new Date(
                                        pun.createdAt,
                                      ).toLocaleTimeString([], {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                    {pun.responseTimeMs !== null && (
                                      <span>
                                        Answered in{" "}
                                        {formatElapsedTime(pun.responseTimeMs)}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreBadgeClass(
                                      pun.aiScore,
                                    )}`}
                                  >
                                    {pun.aiScore === null
                                      ? "Scoring"
                                      : `${pun.aiScore}/10`}
                                  </span>
                                  <GroanBadge
                                    count={pun.groanCount}
                                    groaners={pun.groaners}
                                    triggerClassName="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-text-secondary"
                                  />
                                </div>
                              </div>

                              <div className="mt-4 rounded-2xl bg-background px-4 py-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                                  AI feedback
                                </p>
                                <p className="mt-1 text-sm italic text-text-secondary">
                                  {pun.aiFeedback ??
                                    "Your pun is still being scored."}
                                </p>
                              </div>

                              <div className="mt-4">
                                <Button
                                  size="sm"
                                  variant={
                                    isPunExpanded ? "secondary" : "outline"
                                  }
                                  onClick={() => {
                                    void togglePun(pun.id);
                                  }}
                                >
                                  <MessageSquare className="h-4 w-4" />
                                  {isPunExpanded
                                    ? "Hide comments"
                                    : "Show comments"}
                                </Button>

                                <AnimatePresence initial={false}>
                                  {isPunExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="mt-4 space-y-3 rounded-2xl border border-border bg-background p-4">
                                        {comments.length === 0 ? (
                                          <p className="text-sm text-text-secondary">
                                            No community comments on this pun
                                            yet.
                                          </p>
                                        ) : (
                                          comments.map((comment) => {
                                            const reactionSummary =
                                              formatReactionSummary(comment);

                                            return (
                                              <div
                                                key={comment.id}
                                                className="rounded-2xl bg-surface-muted px-4 py-3"
                                              >
                                                <div className="flex items-center justify-between gap-3">
                                                  <p className="text-sm font-medium text-text">
                                                    {comment.userName}
                                                  </p>
                                                  <p className="text-xs text-text-muted">
                                                    {new Date(
                                                      comment.createdAt,
                                                    ).toLocaleString(
                                                      undefined,
                                                      {
                                                        dateStyle: "medium",
                                                        timeStyle: "short",
                                                      },
                                                    )}
                                                  </p>
                                                </div>
                                                <p className="mt-2 text-sm text-text-secondary">
                                                  {comment.text}
                                                </p>
                                                {reactionSummary && (
                                                  <p className="mt-2 text-xs text-text-muted">
                                                    {reactionSummary}
                                                  </p>
                                                )}
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
