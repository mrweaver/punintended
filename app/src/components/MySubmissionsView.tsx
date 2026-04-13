import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Search,
} from "lucide-react";
import {
  profileApi,
  punsApi,
  commentsApi,
  type Pun,
  type PunComment,
} from "../api/client";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { PunCard } from "./PunCard";

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

function getLocalDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calculateStreak(punsList: Pun[]) {
  if (!punsList || punsList.length === 0) return 0;

  const dates = [
    ...new Set(
      punsList
        .map((p) =>
          p.createdAt ? getLocalDateString(new Date(p.createdAt)) : null,
        )
        .filter(Boolean),
    ),
  ] as string[];

  dates.sort((a, b) => b.localeCompare(a));
  if (dates.length === 0) return 0;

  const today = new Date();
  const todayStr = getLocalDateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) return 0;

  let streak = 0;
  const currentCheckDate = new Date(dates[0] + "T12:00:00");

  for (let i = 0; i < dates.length; i++) {
    const dStr = getLocalDateString(currentCheckDate);
    if (dates[i] === dStr) {
      streak++;
      currentCheckDate.setDate(currentCheckDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

const SORT_OPTIONS: { label: string; value: SortField }[] = [
  { label: "Recent", value: "date" },
  { label: "Score", value: "score" },
  { label: "Groans", value: "groans" },
];

export function MySubmissionsView({ onClose }: { onClose: () => void }) {
  const [puns, setPuns] = useState<Pun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [punComments, setPunComments] = useState<Record<string, PunComment[]>>(
    {},
  );
  const [loadingCommentIds, setLoadingCommentIds] = useState<Set<string>>(
    new Set(),
  );

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
      streak: calculateStreak(puns),
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

  const loadCommentsForPun = async (punId: string) => {
    if (Object.prototype.hasOwnProperty.call(punComments, punId)) {
      return;
    }

    setLoadingCommentIds((current) => new Set(current).add(punId));

    try {
      const comments = await commentsApi.list(punId);
      setPunComments((prev) => ({ ...prev, [punId]: comments }));
    } catch {
      setPunComments((prev) => ({ ...prev, [punId]: [] }));
    } finally {
      setLoadingCommentIds((current) => {
        const next = new Set(current);
        next.delete(punId);
        return next;
      });
    }
  };

  const handleEditPun = async (punId: string, text: string) => {
    await punsApi.edit(punId, text);
    setPuns((current) =>
      current.map((pun) =>
        pun.id === punId ? { ...pun, text, updatedAt: new Date().toISOString() } : pun,
      ),
    );
  };

  const handleDeletePun = async (punId: string) => {
    await punsApi.delete(punId);
    setPuns((current) => current.filter((pun) => pun.id !== punId));
    setPunComments((current) => {
      const next = { ...current };
      delete next[punId];
      return next;
    });
  };

  const handleReactPun = async (punId: string, reaction: Pun["myReaction"]) => {
    await punsApi.react(punId, reaction);
    setPuns((current) =>
      current.map((pun) => {
        if (pun.id !== punId) return pun;

        const previousReaction = pun.myReaction;
        let nextGroanCount = pun.groanCount;

        if (previousReaction === "groan") {
          nextGroanCount = Math.max(0, nextGroanCount - 1);
        }

        if (reaction === "groan") {
          nextGroanCount += 1;
        }

        return {
          ...pun,
          myReaction: reaction,
          groanCount: nextGroanCount,
        };
      }),
    );
  };

  const handleAddComment = async (punId: string, text: string) => {
    await commentsApi.add(punId, text);
    const comments = await commentsApi.list(punId);
    setPunComments((prev) => ({ ...prev, [punId]: comments }));
  };

  const handleCommentReact = async (
    commentId: string,
    punId: string,
    reaction: string | null,
  ) => {
    await commentsApi.react(commentId, reaction);
    const comments = await commentsApi.list(punId);
    setPunComments((prev) => ({ ...prev, [punId]: comments }));
  };

  return (
    <motion.div
      key="submissions"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* ── Header ── */}
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
          </div>

          {/* Stats grid — matches profile stat style */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:min-w-[260px]">
            <div className="bg-surface-muted px-3 py-2 rounded-xl flex flex-col items-center justify-center text-center">
              <span className="text-text font-bold text-xl">
                {summary.totalPuns}
              </span>
              <span className="text-xs uppercase tracking-wider text-text-muted mt-1">
                Puns
              </span>
            </div>
            <div className="bg-surface-muted px-3 py-2 rounded-xl flex flex-col items-center justify-center text-center">
              <span className="text-text font-bold text-xl">
                {summary.totalDates}
              </span>
              <span className="text-xs uppercase tracking-wider text-text-muted mt-1">
                Days
              </span>
            </div>
            <div className="bg-accent-subtle px-3 py-2 rounded-xl flex flex-col items-center justify-center text-center">
              <span className="text-accent-foreground font-bold text-xl">
                {summary.totalGroans}
              </span>
              <span className="text-xs uppercase tracking-wider text-accent-foreground/70 mt-1">
                Groans
              </span>
            </div>
            <div className="bg-surface-muted px-3 py-2 rounded-xl flex flex-col items-center justify-center text-center">
              <span className="text-text font-bold text-xl">
                {summary.streak}
              </span>
              <span className="text-xs uppercase tracking-wider text-text-muted mt-1">
                Streak
              </span>
            </div>
            <div className="bg-surface-muted px-3 py-2 rounded-xl flex flex-col items-center justify-center text-center">
              <span className="text-text font-bold text-xl">
                {summary.avgScore}
              </span>
              <span className="text-xs uppercase tracking-wider text-text-muted mt-1">
                Avg Score
              </span>
            </div>
          </div>
        </div>

        {/* ── Search + Sort ── */}
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

          <div className="flex flex-wrap items-center gap-1">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSortField(option.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  sortField === option.value
                    ? "bg-accent-subtle text-accent-foreground"
                    : "text-text-muted hover:bg-surface-muted"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Content ── */}
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
        <div className="space-y-2">
          {groupedPuns.map((group, groupIndex) => {
            const isExpanded = expandedDates.has(group.challengeId);
            const isToday =
              group.challengeId === new Date().toLocaleDateString("en-CA");

            return (
              <section key={group.challengeId} className="space-y-4">
                <div className="relative flex items-center pt-1">
                  <div className="flex-1 border-t border-border" />
                  <div className="mx-4 flex-shrink-0">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-mono font-semibold text-text-muted shadow-sm">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                      {formatChallengeDate(group.challengeId)}
                    </span>
                  </div>
                  <div className="flex-1 border-t border-border" />
                </div>

                <button
                  type="button"
                  onClick={() => toggleDate(group.challengeId)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/70 px-4 py-3 text-left text-sm text-text-secondary transition-colors hover:bg-surface-muted"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
                    <div className="min-w-0">
                      <p className="font-medium text-text">
                        {group.puns.length} pun{group.puns.length === 1 ? "" : "s"}
                        {isToday ? " today" : " archived"}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        Avg {group.avgScore}/10 • {group.totalGroans} groan
                        {group.totalGroans === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 opacity-60" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                  )}
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
                      <div className="space-y-4 pb-2">
                        {(group.challengeTopic || group.challengeFocus) && (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {group.challengeTopic && (
                              <motion.div
                                key={`archive-topic-${group.challengeId}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className="rounded-2xl border border-transparent bg-text p-4 text-surface"
                              >
                                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-accent/80">
                                  Topic
                                </p>
                                <h3 className="text-lg font-serif italic sm:text-xl">
                                  {group.challengeTopic}
                                </h3>
                              </motion.div>
                            )}
                            {group.challengeFocus && (
                              <motion.div
                                key={`archive-focus-${group.challengeId}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: 0.04 }}
                                className="rounded-2xl border border-transparent bg-accent p-4 text-accent-foreground"
                              >
                                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-accent-foreground/70">
                                  Focus
                                </p>
                                <h3 className="text-lg font-serif italic sm:text-xl">
                                  {group.challengeFocus}
                                </h3>
                              </motion.div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:gap-6">
                          {group.puns.map((pun, punIndex) => (
                            <PunCard
                              key={pun.id}
                              pun={pun}
                              index={groupIndex + punIndex * 0.1}
                              comments={punComments[pun.id] ?? []}
                              commentsLoading={loadingCommentIds.has(pun.id)}
                              submitting={false}
                              hideAuthor={true}
                              onReact={handleReactPun}
                              onViewed={() => {}}
                              onEdit={handleEditPun}
                              onDelete={handleDeletePun}
                              onComment={handleAddComment}
                              onCommentReact={(commentId, reaction) =>
                                handleCommentReact(commentId, pun.id, reaction)
                              }
                              onLoadComments={loadCommentsForPun}
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
