import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Calendar, ChevronDown, Search } from "lucide-react";
import {
  profileApi,
  commentsApi,
  type Pun,
  type PunComment,
} from "../api/client";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { GroanBadge } from "./ui/GroanBadge";
import { JudgeHint } from "./ui/JudgeHint";
import { formatFuzzyTime } from "../utils/time";

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
  const [expandedPunId, setExpandedPunId] = useState<string | null>(null);
  const [punComments, setPunComments] = useState<Record<string, PunComment[]>>(
    {},
  );
  const [loadingComments, setLoadingComments] = useState<string | null>(null);

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

  const handleToggleExpand = async (punId: string) => {
    if (expandedPunId === punId) {
      setExpandedPunId(null);
      return;
    }
    setExpandedPunId(punId);
    if (!punComments[punId]) {
      setLoadingComments(punId);
      try {
        const c = await commentsApi.list(punId);
        setPunComments((prev) => ({ ...prev, [punId]: c }));
      } catch {
        setPunComments((prev) => ({ ...prev, [punId]: [] }));
      } finally {
        setLoadingComments(null);
      }
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
        <div className="space-y-4">
          {groupedPuns.map((group) => {
            const isExpanded = expandedDates.has(group.challengeId);
            const isToday =
              group.challengeId === new Date().toLocaleDateString("en-CA");

            return (
              <Card key={group.challengeId} className="space-y-0 p-0">
                {/* ── Date group header ── */}
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
                        <span className="text-xs bg-accent-subtle text-accent-foreground px-2 py-0.5 rounded-full font-medium truncate">
                          {group.challengeTopic}
                          {group.challengeFocus
                            ? ` \u00b7 ${group.challengeFocus}`
                            : ""}
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
                      <p>{group.avgScore}/10 avg</p>
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

                {/* ── Expanded pun list ── */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 border-t border-border px-4 py-4 sm:px-6 sm:py-5">
                        {group.puns.map((pun) => {
                          const isItemExpanded = expandedPunId === pun.id;
                          const pComments = punComments[pun.id] ?? [];
                          const isLoadingC = loadingComments === pun.id;

                          return (
                            <div
                              key={pun.id}
                              className="rounded-2xl border border-border overflow-hidden"
                            >
                              <div className="bg-surface-muted">
                                <button
                                  onClick={() => handleToggleExpand(pun.id)}
                                  className="w-full text-left p-4 hover:bg-surface-muted/80 transition-colors"
                                >
                                  {/* Score badge row */}
                                  <div className="flex items-center gap-2 mb-2">
                                    {pun.responseTimeMs !== null && (
                                      <span className="text-xs text-text-muted">
                                        Answered in{" "}
                                        {formatFuzzyTime(pun.responseTimeMs)}
                                      </span>
                                    )}
                                    {pun.aiScore !== null &&
                                      pun.aiScore !== undefined && (
                                        <>
                                          <span
                                            className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                                              pun.aiScore >= 7
                                                ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                                : pun.aiScore >= 4
                                                  ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                                                  : "bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400"
                                            }`}
                                          >
                                            {pun.aiScore}/10
                                          </span>
                                          <JudgeHint
                                            judgeName={pun.aiJudgeName}
                                            judgeVersion={pun.aiJudgeVersion}
                                            className="inline-flex items-center text-text-muted hover:text-text-secondary"
                                            iconClassName="h-3.5 w-3.5"
                                          />
                                        </>
                                      )}
                                  </div>

                                  {/* Pun text + chevron */}
                                  <div className="flex items-start gap-2">
                                    <p className="flex-1 text-base font-serif italic text-text">
                                      "{pun.text}"
                                    </p>
                                    <ChevronDown
                                      className={`w-4 h-4 text-text-muted flex-shrink-0 mt-1 transition-transform duration-200 ${
                                        isItemExpanded ? "rotate-180" : ""
                                      }`}
                                    />
                                  </div>
                                </button>

                                {/* Footer */}
                                <div className="flex items-center gap-3 px-4 pb-4 text-xs text-text-muted">
                                  <span>
                                    {new Date(pun.createdAt).toLocaleTimeString(
                                      [],
                                      {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      },
                                    )}
                                  </span>
                                  {pun.groanCount > 0 && (
                                    <GroanBadge
                                      count={pun.groanCount}
                                      groaners={pun.groaners}
                                      triggerClassName="inline-flex items-center gap-1 rounded-md font-semibold text-accent-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                    />
                                  )}
                                </div>
                              </div>

                              {/* Expanded panel */}
                              <AnimatePresence>
                                {isItemExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-4 pt-3 bg-surface border-t border-border space-y-3">
                                      {/* AI Feedback */}
                                      {pun.aiFeedback && (
                                        <div className="p-3 bg-accent-subtle rounded-xl text-sm text-accent">
                                          <span className="mb-1 flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wider text-accent-foreground/60">
                                            <span>AI Verdict</span>
                                            <JudgeHint
                                              judgeName={pun.aiJudgeName}
                                              judgeVersion={pun.aiJudgeVersion}
                                              className="inline-flex items-center text-accent-foreground/55 hover:text-accent-foreground"
                                              iconClassName="h-3.5 w-3.5"
                                            />
                                          </span>
                                          <span className="text-accent-foreground italic">
                                            {pun.aiFeedback}
                                          </span>
                                        </div>
                                      )}

                                      {/* Comments */}
                                      <div>
                                        <span className="font-semibold text-xs uppercase tracking-wider text-text-muted block mb-2">
                                          Comments
                                          {!isLoadingC && pComments.length > 0
                                            ? ` (${pComments.length})`
                                            : ""}
                                        </span>
                                        {isLoadingC ? (
                                          <p className="text-xs text-text-muted italic py-1">
                                            Loading...
                                          </p>
                                        ) : pComments.length === 0 ? (
                                          <p className="text-xs text-text-muted italic py-1">
                                            No comments yet
                                          </p>
                                        ) : (
                                          <div className="space-y-2">
                                            {pComments.map((comment) => (
                                              <div
                                                key={comment.id}
                                                className="flex items-start gap-2"
                                              >
                                                <img
                                                  src={comment.userPhoto || ""}
                                                  alt={comment.userName}
                                                  className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
                                                />
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-baseline gap-2">
                                                    <span className="text-xs font-semibold text-text">
                                                      {comment.userName}
                                                    </span>
                                                    <span className="text-xs text-text-muted">
                                                      {new Date(
                                                        comment.createdAt,
                                                      ).toLocaleDateString()}
                                                    </span>
                                                  </div>
                                                  <p className="text-sm text-text-secondary mt-0.5">
                                                    {comment.text}
                                                  </p>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
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
