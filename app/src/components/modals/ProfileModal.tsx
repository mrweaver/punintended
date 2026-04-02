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
  const { user, logout, updateDisplayName, updatePrivacy } = useAuth();
  const [userPuns, setUserPuns] = useState<Pun[]>([]);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [expandedPunId, setExpandedPunId] = useState<string | null>(null);
  const [punComments, setPunComments] = useState<Record<string, PunComment[]>>(
    {},
  );
  const [loadingComments, setLoadingComments] = useState<string | null>(null);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

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

  useEffect(() => {
    if (!user) return;

    setDisplayNameInput(user.customDisplayName ?? "");
    setDisplayNameError(null);
  }, [user]);

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

  const normalizedDisplayNameInput = displayNameInput
    .replace(/\s+/g, " ")
    .trim();
  const savedCustomDisplayName = user.customDisplayName ?? "";
  const hasDisplayNameChanges =
    normalizedDisplayNameInput !== savedCustomDisplayName;

  const handleDisplayNameSave = async () => {
    if (!hasDisplayNameChanges || isSavingDisplayName) return;

    setIsSavingDisplayName(true);
    setDisplayNameError(null);

    try {
      await updateDisplayName(displayNameInput);
    } catch (error) {
      setDisplayNameError(
        error instanceof Error
          ? error.message
          : "Failed to update display name",
      );
    } finally {
      setIsSavingDisplayName(false);
    }
  };

  const resetDisplayNameInput = () => {
    setDisplayNameInput(user.customDisplayName ?? "");
    setDisplayNameError(null);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] sm:p-4"
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
        className="bg-white dark:bg-zinc-900 w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-3xl max-w-2xl relative shadow-2xl flex flex-col border-0 sm:border border-gray-100 dark:border-zinc-800"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-black dark:hover:text-white transition-colors shadow-sm sm:shadow-none"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Unified Scrollable Area */}
        <div className="flex-1 overflow-y-auto relative">
          {/* Profile header */}
          <div className="px-4 sm:px-8 pt-16 sm:pt-8 flex flex-col gap-6 mb-8 border-b border-gray-100 dark:border-zinc-800 pb-8 mt-2">
            {/* Top Row: Avatar, Identity & Stats */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* Avatar */}
              <img
                src={user.photoURL || ""}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-orange-100 dark:border-violet-900/50 shrink-0"
                alt="Profile"
              />

              {/* Identity & Stats Container */}
              <div className="flex-1 w-full flex flex-col gap-5">
                {/* Title & Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:pr-8">
                  <h3 className="text-3xl font-serif italic font-bold text-center sm:text-left dark:text-zinc-100">
                    {user.displayName}
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
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

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm font-medium text-gray-500 dark:text-zinc-400">
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

            {/* Bottom Row: Settings Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Display Name Card */}
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/60 flex flex-col justify-between">
                <div>
                  <label
                    htmlFor="profile-display-name"
                    className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-zinc-400"
                  >
                    Display Name
                  </label>
                  <div className="mt-3 flex flex-col xl:flex-row gap-2">
                    <input
                      id="profile-display-name"
                      type="text"
                      value={displayNameInput}
                      maxLength={255}
                      onChange={(event) => {
                        setDisplayNameInput(event.target.value);
                        if (displayNameError) setDisplayNameError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleDisplayNameSave();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          resetDisplayNameInput();
                        }
                      }}
                      placeholder={
                        user.googleDisplayName ?? "Use your Google name"
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-orange-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-violet-500"
                    />
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={handleDisplayNameSave}
                        disabled={!hasDisplayNameChanges}
                        loading={isSavingDisplayName}
                        className="flex-1 xl:flex-none"
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetDisplayNameInput}
                        disabled={!hasDisplayNameChanges || isSavingDisplayName}
                        className="flex-1 xl:flex-none"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Leave blank to use:{" "}
                    <span className="font-medium text-gray-700 dark:text-zinc-300">
                      {user.googleDisplayName || "your Google name"}
                    </span>
                  </p>
                  {displayNameError && (
                    <p className="mt-1 text-xs font-medium text-red-500 dark:text-red-400">
                      {displayNameError}
                    </p>
                  )}
                </div>
              </div>

              {/* Privacy Card */}
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/60 flex flex-col justify-center">
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-zinc-400 mb-4">
                  Privacy
                </label>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      checked={user.anonymousInLeaderboards}
                      disabled={isSavingPrivacy}
                      onChange={async () => {
                        setIsSavingPrivacy(true);
                        try {
                          await updatePrivacy(!user.anonymousInLeaderboards);
                        } catch {
                          // ignore
                        } finally {
                          setIsSavingPrivacy(false);
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-gray-200 dark:bg-zinc-700 rounded-full peer-checked:bg-orange-500 dark:peer-checked:bg-violet-500 transition-colors" />
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    Hide my name on public leaderboards
                  </span>
                </label>
                <p className="mt-3 text-xs text-gray-500 dark:text-zinc-400">
                  When enabled, your stats will remain private and you will
                  appear anonymously to others.
                </p>
              </div>
            </div>
          </div>

          {/* Pun history */}
          <div className="px-4 sm:px-8 pb-4 sm:pb-8">
            {/* Sticky controls */}
            <div className="sticky top-0 bg-white dark:bg-zinc-900 pb-3 z-10 pt-2 shadow-sm dark:shadow-none border-b border-transparent dark:border-zinc-800">
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
            <div className="space-y-2 mt-2">
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
                  const hasChallenge =
                    pun.challengeTopic || pun.challengeFocus;

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
        </div>
      </motion.div>
    </div>
  );
}