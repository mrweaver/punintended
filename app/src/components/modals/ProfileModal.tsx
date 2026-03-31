import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Share2, Check, LogOut, ChevronDown, X, Search } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { profileApi, commentsApi } from "../../api/client";
import { Button } from "../ui/Button";
import { GroanBadge } from "../ui/GroanBadge";
import type { Pun, PunComment } from "../../api/client";

interface ProfileModalProps {
  onClose: () => void;
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

type SortField = "date" | "score" | "reactions";

const SORT_OPTIONS: { label: string; value: SortField }[] = [
  { label: "Recent", value: "date" },
  { label: "Score", value: "score" },
  { label: "Groans", value: "reactions" },
];

export function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, logout } = useAuth();
  const [userPuns, setUserPuns] = useState<Pun[]>([]);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [expandedPunId, setExpandedPunId] = useState<string | null>(null);
  const [punComments, setPunComments] = useState<Record<string, PunComment[]>>(
    {},
  );
  const [loadingComments, setLoadingComments] = useState<string | null>(null);

  useEffect(() => {
    profileApi.getPuns().then(setUserPuns).catch(console.error);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const streak = useMemo(() => calculateStreak(userPuns), [userPuns]);

  const avgScore = useMemo(() => {
    const scored = userPuns.filter(
      (p) => p.aiScore !== undefined && p.aiScore !== null,
    );
    return scored.length > 0
      ? (
          scored.reduce((acc, p) => acc + (p.aiScore || 0), 0) / scored.length
        ).toFixed(1)
      : "-";
  }, [userPuns]);

  const totalReactions = useMemo(
    () => userPuns.reduce((acc, pun) => acc + pun.groanCount, 0),
    [userPuns],
  );

  const displayPuns = useMemo(() => {
    let result = [...userPuns];
    if (filter.trim()) {
      const q = filter.toLowerCase();
      result = result.filter(
        (p) =>
          p.text.toLowerCase().includes(q) ||
          p.challengeTopic?.toLowerCase().includes(q) ||
          p.challengeFocus?.toLowerCase().includes(q),
      );
    }
    result.sort((a, b) => {
      if (sortField === "date")
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      if (sortField === "score") return (b.aiScore ?? -1) - (a.aiScore ?? -1);
      return b.groanCount - a.groanCount;
    });
    return result;
  }, [userPuns, filter, sortField]);

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

  const copyStats = () => {
    const text = `I'm on a ${streak}-day pun streak on PunIntended!\nAvg AI Score: ${avgScore}/10\nTotal Puns: ${userPuns.length}\n\nCan you out-pun me? Play at ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-2xl w-full relative shadow-2xl max-h-[90vh] flex flex-col border border-gray-100 dark:border-zinc-800"
      >
        {/* Close button — opaque background prevents visual overlap */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-black dark:hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Profile header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8 border-b border-gray-100 dark:border-zinc-800 pb-8">
          <img
            src={user.photoURL || ""}
            className="w-24 h-24 rounded-full border-4 border-orange-100 dark:border-violet-900/50"
            alt="Profile"
          />
          <div className="flex-1 w-full text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
              <h3 className="text-3xl font-serif italic font-bold dark:text-zinc-100">
                {user.displayName}
              </h3>
              {/* sm:pr-10 keeps buttons clear of the close button on desktop */}
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:pr-10">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyStats}
                  className="w-full sm:w-auto"
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                  {copied ? "Copied!" : "Share Stats"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={logout}
                  className="sm:hidden w-full text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm font-medium text-gray-500 dark:text-zinc-400">
              <div className="bg-gray-50 dark:bg-zinc-800 px-3 py-2 rounded-xl flex flex-col items-center justify-center text-center">
                <span className="text-black dark:text-zinc-100 font-bold text-xl">
                  {userPuns.length}
                </span>
                <span className="text-xs uppercase tracking-wider mt-1">
                  Puns
                </span>
              </div>
              <div className="bg-orange-50 dark:bg-violet-900/20 px-3 py-2 rounded-xl text-orange-600 dark:text-violet-400 flex flex-col items-center justify-center text-center">
                <span className="font-bold text-xl">{totalReactions}</span>
                <span className="text-xs uppercase tracking-wider mt-1">
                  Reactions
                </span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-xl text-blue-600 dark:text-blue-400 flex flex-col items-center justify-center text-center">
                <span className="font-bold text-xl">{streak}</span>
                <span className="text-xs uppercase tracking-wider mt-1">
                  Day Streak
                </span>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-xl text-green-600 dark:text-green-400 flex flex-col items-center justify-center text-center">
                <span className="font-bold text-xl">{avgScore}</span>
                <span className="text-xs uppercase tracking-wider mt-1">
                  Avg Score
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pun history */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Sticky controls */}
          <div className="sticky top-0 bg-white dark:bg-zinc-900 pb-3 z-10">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-gray-900 dark:text-zinc-100">
                Your Pun History
              </h4>
              <div className="flex gap-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortField(opt.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      sortField === opt.value
                        ? "bg-orange-100 dark:bg-violet-900/40 text-orange-700 dark:text-violet-300"
                        : "text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {userPuns.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter by pun or challenge topic…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-orange-300 dark:focus:border-violet-500 dark:text-zinc-200 placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                />
              </div>
            )}
          </div>

          {/* Pun list */}
          <div className="space-y-2">
            {userPuns.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-zinc-500 italic">
                You haven't submitted any puns yet.
              </div>
            ) : displayPuns.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-zinc-500 italic">
                No puns match your filter.
              </div>
            ) : (
              displayPuns.map((pun) => {
                const isExpanded = expandedPunId === pun.id;
                const pComments = punComments[pun.id] ?? [];
                const isLoadingC = loadingComments === pun.id;
                const hasChallenge = pun.challengeTopic || pun.challengeFocus;

                return (
                  <div
                    key={pun.id}
                    className="rounded-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden"
                  >
                    <div className="bg-gray-50 dark:bg-zinc-800/50">
                      <button
                        onClick={() => handleToggleExpand(pun.id)}
                        className="w-full text-left p-4 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                      {/* Challenge badge row */}
                      {hasChallenge && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs bg-orange-50 dark:bg-violet-900/30 text-orange-600 dark:text-violet-400 px-2 py-0.5 rounded-full font-medium truncate">
                            {pun.challengeTopic}
                            {pun.challengeFocus
                              ? ` · ${pun.challengeFocus}`
                              : ""}
                          </span>
                          {pun.aiScore !== null &&
                            pun.aiScore !== undefined && (
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
                            )}
                        </div>
                      )}

                      {/* Pun text + chevron */}
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-base font-serif italic text-gray-800 dark:text-zinc-200">
                          "{pun.text}"
                        </p>
                        <ChevronDown
                          className={`w-4 h-4 text-gray-400 dark:text-zinc-500 flex-shrink-0 mt-1 transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                      </button>

                      {/* Footer */}
                      <div className="flex items-center gap-3 px-4 pb-4 text-xs text-gray-400 dark:text-zinc-500">
                        <span>
                          {new Date(pun.createdAt).toLocaleDateString()}
                        </span>
                        {pun.groanCount > 0 && (
                          <GroanBadge
                            count={pun.groanCount}
                            groaners={pun.groaners}
                            triggerClassName="inline-flex items-center gap-1 rounded-md font-semibold text-orange-400 transition-colors hover:text-orange-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 dark:text-violet-400 dark:hover:text-violet-300 dark:focus-visible:ring-violet-500"
                            onClick={(event) => event.stopPropagation()}
                          />
                        )}
                        {!hasChallenge &&
                          pun.aiScore !== null &&
                          pun.aiScore !== undefined && (
                            <span
                              className={`ml-auto font-bold ${
                                pun.aiScore >= 7
                                  ? "text-green-500"
                                  : pun.aiScore >= 4
                                    ? "text-yellow-500"
                                    : "text-red-400"
                              }`}
                            >
                              {pun.aiScore}/10
                            </span>
                          )}
                      </div>
                    </div>

                    {/* Expanded panel */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-3 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 space-y-3">
                            {/* AI Feedback */}
                            {pun.aiFeedback && (
                              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm text-blue-700 dark:text-blue-300">
                                <span className="font-semibold text-xs uppercase tracking-wider text-blue-400 dark:text-blue-500 block mb-1">
                                  AI Verdict
                                </span>
                                {pun.aiFeedback}
                              </div>
                            )}

                            {/* Comments */}
                            <div>
                              <span className="font-semibold text-xs uppercase tracking-wider text-gray-400 dark:text-zinc-500 block mb-2">
                                Comments
                                {!isLoadingC && pComments.length > 0
                                  ? ` (${pComments.length})`
                                  : ""}
                              </span>
                              {isLoadingC ? (
                                <p className="text-xs text-gray-400 dark:text-zinc-500 italic py-1">
                                  Loading…
                                </p>
                              ) : pComments.length === 0 ? (
                                <p className="text-xs text-gray-400 dark:text-zinc-500 italic py-1">
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
                                        src={comment.userPhoto}
                                        alt={comment.userName}
                                        className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                                            {comment.userName}
                                          </span>
                                          <span className="text-xs text-gray-400 dark:text-zinc-500">
                                            {new Date(
                                              comment.createdAt,
                                            ).toLocaleDateString()}
                                          </span>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-zinc-400 mt-0.5">
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
              })
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
