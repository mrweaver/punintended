import { useState } from "react";
import { motion } from "motion/react";
import { Share2, RotateCcw, LogOut, Trophy, BarChart2 } from "lucide-react";
import type { GauntletRun, GauntletRoundPrompt } from "../api/client";
import { ShareModal } from "./modals/ShareModal";
import { Button } from "./ui/Button";

interface GauntletReceiptProps {
  run: GauntletRun;
  gauntletId: string;
  rounds: GauntletRoundPrompt[];
  onPlayAgain: () => void;
  onExit: () => void;
  onViewComparison: () => void;
}

function getScoreRating(total: number): string {
  if (total >= 4500) return "Pun Legend";
  if (total >= 3500) return "Wordsmith";
  if (total >= 2500) return "Pun Enthusiast";
  if (total >= 1500) return "Getting There";
  return "Keep Practising";
}

const MAX_SCORE = 5 * (10 * 100 + 60 * 10); // 8,000

export function GauntletReceipt({
  run,
  gauntletId,
  rounds,
  onPlayAgain,
  onExit,
  onViewComparison,
}: GauntletReceiptProps) {
  const [showShareModal, setShowShareModal] = useState(false);

  const totalScore = run.totalScore ?? 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl mx-auto space-y-4"
      >
        {/* Receipt header */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-6 text-center">
          <div className="inline-flex p-3 rounded-xl bg-orange-100 dark:bg-violet-900/30 mb-4">
            <Trophy className="w-8 h-8 text-orange-600 dark:text-violet-400" />
          </div>
          <p className="font-mono text-xs uppercase tracking-widest text-orange-500 dark:text-violet-400 mb-1">
            Arcade Receipt
          </p>
          <h2 className="text-3xl font-serif italic dark:text-zinc-100 mb-4">
            The Gauntlet
          </h2>

          <div className="border-t border-dashed border-zinc-200 dark:border-zinc-700 pt-4">
            <p className="text-5xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
              {totalScore.toLocaleString()}
            </p>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">
              out of {MAX_SCORE.toLocaleString()} possible
            </p>
            <p className="mt-2 font-serif italic text-orange-600 dark:text-violet-400 text-lg">
              {getScoreRating(totalScore)}
            </p>
          </div>
        </div>

        {/* Round breakdowns */}
        {run.rounds.map((round, i) => {
          const prompt = rounds[i];
          const aiScore = round.ai_score ?? 0;
          const baseScore = aiScore * 100;
          const qualityGateMet = aiScore >= 5;
          const timeBonus = qualityGateMet
            ? (round.seconds_remaining ?? 0) * 10
            : 0;
          const roundTotal = round.round_score ?? 0;
          const skipped = !round.pun_text;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-5 space-y-3"
            >
              {/* Round label + prompts */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1">
                    Round {i + 1}
                  </p>
                  {prompt && (
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {prompt.topic}
                      </span>
                      {" + "}
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {prompt.focus}
                      </span>
                    </p>
                  )}
                </div>
                <span className="text-lg font-mono font-bold text-zinc-900 dark:text-zinc-100 shrink-0">
                  {roundTotal.toLocaleString()} pts
                </span>
              </div>

              {/* The pun */}
              <p className="font-serif italic text-zinc-800 dark:text-zinc-200 border-l-2 border-orange-300 dark:border-violet-500 pl-3">
                {skipped ? (
                  <span className="text-gray-400 dark:text-zinc-500 not-italic">
                    — skipped —
                  </span>
                ) : (
                  `"${round.pun_text}"`
                )}
              </p>

              {/* AI feedback */}
              {round.ai_feedback && (
                <p className="text-sm text-gray-500 dark:text-zinc-400 italic">
                  {round.ai_feedback}
                </p>
              )}

              {/* Score breakdown */}
              {!skipped && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-1 text-xs font-mono text-gray-500 dark:text-zinc-500">
                  <div className="flex justify-between">
                    <span>AI Score: {aiScore}/10</span>
                    <span>+{baseScore}</span>
                  </div>
                  {qualityGateMet ? (
                    <div className="flex justify-between">
                      <span>Speed Bonus: {round.seconds_remaining}s × 10</span>
                      <span>+{timeBonus}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-zinc-400 dark:text-zinc-600">
                      <span>Speed bonus locked (score too low)</span>
                      <span>+0</span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Button
            onClick={() => setShowShareModal(true)}
            variant="secondary"
            className="flex-1"
          >
            <Share2 className="w-4 h-4" />
            Share Challenge
          </Button>
          <Button
            onClick={onViewComparison}
            variant="outline"
            className="flex-1"
          >
            <BarChart2 className="w-4 h-4" />
            View Comparison
          </Button>
          <Button onClick={onPlayAgain} variant="outline" className="flex-1">
            <RotateCcw className="w-4 h-4" />
            Play Again
          </Button>
          <Button onClick={onExit} variant="ghost">
            <LogOut className="w-4 h-4" />
            Exit
          </Button>
        </motion.div>
      </motion.div>

      {showShareModal && (
        <ShareModal
          title="Share This Gauntlet"
          description="Send this link so someone else can replay the exact same five prompts and compare scores later."
          shareUrl={`${window.location.origin}?gauntlet=${gauntletId}`}
          shareMessage="Take on my PunIntended gauntlet and see if you can beat my score."
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}
