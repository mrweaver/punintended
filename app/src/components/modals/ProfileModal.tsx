import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Sparkles, Share2, Check, LogOut } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { profileApi } from "../../api/client";
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
  const { user, logout } = useAuth();
  const [userPuns, setUserPuns] = useState<Pun[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    profileApi.getPuns().then(setUserPuns).catch(console.error);
  }, []);

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-2xl w-full relative shadow-2xl max-h-[90vh] flex flex-col border border-gray-100 dark:border-zinc-800"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white p-2"
        >
          ✕
        </button>

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

        <div className="flex-1 overflow-y-auto pr-2">
          <h4 className="font-bold text-gray-900 dark:text-zinc-100 mb-4 sticky top-0 bg-white dark:bg-zinc-900 py-2">
            Your Pun History
          </h4>
          <div className="space-y-4">
            {userPuns.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-zinc-500 italic">
                You haven't submitted any puns yet.
              </div>
            ) : (
              userPuns.map((pun) => (
                <div
                  key={pun.id}
                  className="p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl border border-gray-100 dark:border-zinc-800"
                >
                  <p className="text-lg font-serif italic text-gray-800 dark:text-zinc-200 mb-2">
                    "{pun.text}"
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-500 dark:text-zinc-400">
                    <span>{new Date(pun.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1 text-orange-500 dark:text-violet-500 font-bold">
                      <Sparkles className="w-3 h-3" /> {pun.groanCount}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
