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
              <div className="flex items-center gap-2 mb-3 relative group/info">
                <Activity className="w-4 h-4 text-gray-400" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 cursor-help">
                  Recent Efforts
                </h4>
                <div className="absolute -top-10 left-0 bg-black text-white text-[10px] py-1.5 px-3 rounded opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 shadow-xl">
                  Solid bar = Your score. Background = Group best. Line = Group avg.
                </div>
              </div>
              <div className="flex items-end justify-between gap-1 h-24 bg-gray-50 dark:bg-zinc-800/60 rounded-xl p-4">
                {stats.recentEfforts.map((effort, i) => {
                  const score = effort.user_score || 0;
                  const winScore = effort.winning_score || 10;
                  const groupAvg = effort.group_average ? Number(effort.group_average) : 0;
                  const scorePct = Math.max(2, (score / 10) * 100);
                  const winPct = Math.max(2, (winScore / 10) * 100);
                  const avgPct = Math.max(2, (groupAvg / 10) * 100);
                  const isWin = score === winScore && score > 0;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1 h-full">
                      <div className="w-full relative group h-full flex items-end justify-center">
                        {/* Group Best Bar (Background) */}
                        <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${winPct}%` }}
                          transition={{ delay: i * 0.1, duration: 0.5, type: "spring" }}
                          className="absolute bottom-0 w-full rounded-t-sm bg-gray-200 dark:bg-zinc-700 opacity-60"
                        />
                        {/* Group Average Tick */}
                        {groupAvg > 0 && (
                           <motion.div 
                            initial={{ bottom: 0, opacity: 0 }}
                            animate={{ bottom: `${avgPct}%`, opacity: 1 }}
                            transition={{ delay: i * 0.1 + 0.3, duration: 0.3 }}
                            className="absolute w-[120%] -left-[10%] h-[2px] bg-gray-400 dark:bg-zinc-400 z-10"
                          />
                        )}
                        {/* User Score Bar (Foreground) */}
                        <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${scorePct}%` }}
                          transition={{ delay: i * 0.1, duration: 0.5, type: "spring" }}
                          className={`absolute bottom-0 w-3/4 rounded-t-sm ${isWin ? "bg-orange-500 dark:bg-violet-500" : "bg-gray-400 dark:bg-zinc-500"} z-20`}
                        />
                        {/* Tooltip */}
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30 flex flex-col items-center leading-tight shadow-xl">
                          <span className="font-bold">Score: {score}</span>
                          <span className="text-gray-400">Best: {winScore}</span>
                          <span className="text-gray-400">Avg: {groupAvg.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
