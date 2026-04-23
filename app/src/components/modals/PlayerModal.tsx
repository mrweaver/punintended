import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { X, UserMinus, Activity } from "lucide-react";
import { Button } from "../ui/Button";
import type { Player, PlayerStats } from "../../api/client";
import { groupsApi } from "../../api/client";

interface PlayerModalProps {
  player: Player;
  groupId: string;
  isOwner: boolean;
  onClose: () => void;
  onKick?: (uid: number) => void;
}

export function PlayerModal({ player, groupId, isOwner, onClose, onKick }: PlayerModalProps) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    groupsApi.playerStats(groupId, player.uid)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [groupId, player.uid]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl relative shadow-2xl flex flex-col border border-gray-100 dark:border-zinc-800 overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8 flex flex-col items-center gap-4">
          <img
            src={player.photoURL}
            className="w-24 h-24 rounded-full border-4 border-orange-100 dark:border-violet-900/50 object-cover"
            alt={player.name}
          />
          <h3 className="text-2xl font-serif italic font-bold text-center dark:text-zinc-100">
            {player.name}
          </h3>

          <div className="w-full grid grid-cols-3 gap-2 mt-2">
            <div className="bg-gray-50 dark:bg-zinc-800/60 rounded-xl p-3 flex flex-col items-center">
              <span className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                {loading ? "-" : stats?.totalSubmissions || 0}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mt-1">
                Puns
              </span>
            </div>
            <div className="bg-orange-50 dark:bg-violet-900/20 rounded-xl p-3 flex flex-col items-center">
              <span className="text-xl font-bold text-orange-600 dark:text-violet-400">
                {loading ? "-" : stats?.wins || 0}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-orange-600/70 dark:text-violet-400/70 font-semibold mt-1">
                Wins
              </span>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 flex flex-col items-center">
              <span className="text-xl font-bold text-green-600 dark:text-green-400">
                {loading ? "-" : stats?.averageScore || "-"}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-green-600/70 dark:text-green-400/70 font-semibold mt-1">
                Avg Score
              </span>
            </div>
          </div>

          {!loading && stats && stats.recentEfforts.length > 0 && (
            <div className="w-full mt-4">
              <div className="flex flex-col gap-1 mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-gray-400" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Recent Efforts
                  </h4>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-medium text-gray-500 dark:text-zinc-400">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-1.5 rounded-full bg-orange-500 dark:bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"></div>
                    <span>Win</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-1.5 rounded-full bg-gray-800 dark:bg-zinc-300"></div>
                    <span>Score</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-[2px] h-3 bg-gray-300 dark:bg-zinc-600 relative">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-[2px] bg-gray-400 dark:bg-zinc-400"></div>
                    </div>
                    <span>Range & Avg</span>
                  </div>
                </div>
              </div>

              {/* Graph Container */}
              <div className="relative flex items-end justify-between gap-2 h-32 bg-gray-50 dark:bg-zinc-800/60 rounded-xl p-4 py-6">

                {/* Horizontal Gridlines for Visual Anchoring */}
                <div className="absolute inset-x-0 inset-y-6 flex flex-col justify-between pointer-events-none px-4 z-0">
                  <div className="w-full border-t border-dashed border-gray-200 dark:border-zinc-700/50 relative"><span className="absolute -top-2 -left-0 text-[10px] text-gray-400">10</span></div>
                  <div className="w-full border-t border-dashed border-gray-200 dark:border-zinc-700/50 relative"><span className="absolute -top-2 -left-0 text-[10px] text-gray-400">5</span></div>
                  <div className="w-full border-t border-dashed border-gray-200 dark:border-zinc-700/50 relative"><span className="absolute -top-2 -left-0 text-[10px] text-gray-400">0</span></div>
                </div>

                {(() => {
                  // Fixed absolute scale logic (0 to 10)
                  const chartMin = 0;
                  const chartMax = 10;
                  const chartRange = chartMax - chartMin;

                  // Keep strictly within 0-100% bounds
                  // Map scores to a visually padded range so 0 and 10 don't touch the very edges
                  const getPct = (val: number) => {
                    const rawPct = ((val - chartMin) / chartRange) * 100;
                    // Compress into a 5% to 95% visual range
                    return 5 + (rawPct * 0.9);
                  };

                  return stats.recentEfforts.map((effort, i) => {
                    const score = effort.user_score ?? 0;
                    const winScore = effort.winning_score ?? 10;
                    const worstScore = effort.worst_score ?? 0;
                    const groupAvg = effort.group_average ? Number(effort.group_average) : 0;

                    const scorePct = getPct(score);
                    const winPct = getPct(winScore);
                    const worstPct = getPct(worstScore);
                    const avgPct = getPct(groupAvg);

                    const isWin = score === winScore && score > 0;

                    return (
                      // Ensure this wrapper has full height and grows to fill space
                      <div key={i} className="flex flex-col items-center justify-end h-full w-full relative group z-10 hover:z-50 cursor-pointer">
                        <div className="w-full max-w-[24px] relative h-full flex flex-col justify-end items-center mx-auto">

                          {/* Range Line (Whisker) - Made slightly thicker */}
                          {winPct >= worstPct && (
                            <motion.div
                              initial={{ bottom: `${worstPct}%`, height: 0 }}
                              animate={{ bottom: `${worstPct}%`, height: `${winPct - worstPct}%` }}
                              transition={{ delay: i * 0.1, duration: 0.5, type: "spring" }}
                              className="absolute w-[4px] bg-gray-200 dark:bg-zinc-700 rounded-full"
                            />
                          )}

                          {/* Group Average Tick - Made more visible */}
                          {groupAvg > 0 && (
                            <motion.div
                              initial={{ bottom: 0, opacity: 0 }}
                              animate={{ bottom: `${avgPct}%`, opacity: 1 }}
                              transition={{ delay: i * 0.1 + 0.3, duration: 0.3 }}
                              className="absolute w-4 h-[2px] bg-gray-400 dark:bg-zinc-400 rounded-full"
                            />
                          )}

                          {/* User Score Marker - Thicker, distinct pill shape */}
                          <motion.div
                            initial={{ bottom: 0, opacity: 0 }}
                            animate={{ bottom: `${scorePct}%`, opacity: 1 }}
                            transition={{ delay: i * 0.1, duration: 0.5, type: "spring" }}
                            className={`absolute w-full max-w-[20px] h-[6px] rounded-full translate-y-1/2 ${isWin
                              ? "bg-orange-500 dark:bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]"
                              : "bg-gray-800 dark:bg-zinc-300"
                              } z-20`}
                          />

                          {/* Hover Overlay */}
                          <div className="absolute inset-y-[-10px] inset-x-0 z-30 cursor-pointer"></div>
                        </div>

                        {/* Tooltip */}
                        <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-[10px] py-1.5 px-2.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 flex flex-col items-center leading-tight shadow-xl border border-zinc-700">
                          <span className="font-bold text-white mb-0.5">Score: {score}</span>
                          <span className="text-zinc-400">Range: {worstScore} - {winScore}</span>
                          <span className="text-zinc-400">Avg: {groupAvg.toFixed(1)}</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {isOwner && onKick && (
            <div className="w-full mt-4 pt-6 border-t border-gray-100 dark:border-zinc-800">
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  onKick(player.uid);
                }}
                className="w-full text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <UserMinus className="w-4 h-4 mr-2" />
                Remove from Group
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
