import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Share2, Check, LogOut, X, ChevronDown } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { profileApi, adminApi, type JudgeSettings } from "../../api/client";
import { Button } from "../ui/Button";
import type { Pun } from "../../api/client";

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

export function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, logout, updateDisplayName, updatePrivacy } = useAuth();
  const [userPuns, setUserPuns] = useState<Pun[]>([]);
  const [copied, setCopied] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  // Developer settings state
  const [judgeSettings, setJudgeSettings] = useState<JudgeSettings | null>(null);
  const [judgeSaving, setJudgeSaving] = useState<Record<string, boolean>>({});
  const [judgeSaved, setJudgeSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    profileApi.getPuns().then(setUserPuns).catch(console.error);
  }, []);

  useEffect(() => {
    if (!user?.isDeveloper) return;
    adminApi.getJudgeSettings().then(setJudgeSettings).catch(console.error);
  }, [user?.isDeveloper]);

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

  const handleJudgeChange = async (role: string, judgeKey: string) => {
    if (!judgeSettings) return;
    setJudgeSaving((prev) => ({ ...prev, [role]: true }));
    try {
      const result = await adminApi.setJudgeRole(role, judgeKey || null);
      setJudgeSettings((prev) =>
        prev ? { ...prev, activeByRole: result.activeByRole } : prev,
      );
      setJudgeSaved((prev) => ({ ...prev, [role]: true }));
      setTimeout(() => setJudgeSaved((prev) => ({ ...prev, [role]: false })), 2000);
    } catch (err) {
      console.error("Failed to update judge:", err);
    } finally {
      setJudgeSaving((prev) => ({ ...prev, [role]: false }));
    }
  };

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
          <div className="px-4 sm:px-8 pt-16 sm:pt-8 flex flex-col gap-6 pb-8 mt-2">
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

          {/* Developer Settings — only visible to developer accounts */}
          {user.isDeveloper && (
            <div className="px-4 sm:px-8 pb-8">
              <div className="border-t border-gray-200 dark:border-zinc-700 pt-6">
                <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500 dark:text-violet-400 mb-4 flex items-center gap-2">
                  <span>⚙</span> Developer Settings
                </h4>

                {!judgeSettings ? (
                  <p className="text-xs text-gray-400 dark:text-zinc-500">Loading judge configuration…</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {Object.entries(judgeSettings.roles)
                      .filter(([, roleKey]) => roleKey !== judgeSettings.roles.PUN_BACKUP)
                      .map(([roleName, roleKey]) => {
                        const roleLabel: Record<string, string> = {
                          PUN: "Pun Scoring",
                          BACKWORDS: "Backwords Judging",
                          CLUE_GENERATOR: "Clue Generation",
                          PUN_BACKUP: "Pun Backup",
                        };
                        const activeKey = judgeSettings.activeByRole[roleKey];
                        const activeJudge = judgeSettings.judges.find((j) => j.key === activeKey);
                        const compatibleJudges = judgeSettings.judges.filter(
                          (j) =>
                            j.isActive &&
                            j.responseSchemaVersion === activeJudge?.responseSchemaVersion,
                        );
                        const saving = !!judgeSaving[roleKey];
                        const saved = !!judgeSaved[roleKey];

                        return (
                          <div
                            key={roleKey}
                            className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/60"
                          >
                            <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-gray-500 dark:text-zinc-400 mb-3">
                              {roleLabel[roleName] ?? roleName}
                            </label>

                            {activeJudge && (
                              <div className="flex items-center gap-2 mb-3">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide ${activeJudge.provider === "minimax" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                                  {activeJudge.provider}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                                  {activeJudge.model}
                                </span>
                              </div>
                            )}

                            <div className="relative">
                              <select
                                value={activeKey ?? ""}
                                disabled={saving}
                                onChange={(e) => handleJudgeChange(roleKey, e.target.value)}
                                className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2 pr-8 text-sm text-gray-900 outline-none transition-colors focus:border-orange-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-violet-500 disabled:opacity-60"
                              >
                                {compatibleJudges.map((j) => (
                                  <option key={j.key} value={j.key}>
                                    {j.name} ({j.provider})
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-zinc-500" />
                            </div>

                            <div className="mt-2 h-4">
                              {saving && <p className="text-xs text-gray-400 dark:text-zinc-500">Saving…</p>}
                              {saved && !saving && <p className="text-xs text-green-500 dark:text-green-400">Saved ✓</p>}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                <p className="mt-3 text-xs text-gray-400 dark:text-zinc-500">
                  Changes take effect immediately for all players. Judge overrides persist across server restarts.
                </p>
              </div>
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
}