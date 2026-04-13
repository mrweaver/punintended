import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronUp, MessageSquare, Send } from "lucide-react";
import { PunCard } from "./PunCard";
import type { PunComment, PunReaction } from "../api/client";
import type { useChallengeHistory } from "../hooks/useChallengeHistory";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/Button";

interface ChallengeHistoryPanelProps {
  historyState: ReturnType<typeof useChallengeHistory>;
  getCommentsForPun: (punId: string) => PunComment[];
  submitting: boolean;
  onReact: (punId: string, reaction: PunReaction | null) => void;
  onEdit: (punId: string, text: string) => void;
  onDelete: (punId: string) => void;
  onComment: (punId: string, text: string) => void;
  submitPun: (text: string, responseTimeMs?: number | null, overrideChallengeId?: string) => Promise<void>;
  groupCreatedAt: string;
}

function formatDateLabel(challengeId: string): string {
  const [year, month, day] = challengeId.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Generate past dates, ending at today, filtering those before group creation */
function pastDatesValid(groupCreatedAt: string): string[] {
  const dates: string[] = [];
  const now = new Date();
  
  const createdDateStr = groupCreatedAt.split("T")[0]; // "YYYY-MM-DD"
  
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateId = d.toLocaleDateString("en-CA");
    if (dateId >= createdDateStr) {
      dates.push(dateId);
    }
  }
  return dates;
}

export function ChallengeHistoryPanel({
  historyState,
  getCommentsForPun,
  submitting,
  onReact,
  onEdit,
  onDelete,
  onComment,
  submitPun,
  groupCreatedAt,
}: ChallengeHistoryPanelProps) {
  const { user } = useAuth();
  const { expandedDates, punsByDate, challengesByDate, loadingDate, toggleDate } = historyState;
  const dates = useMemo(() => pastDatesValid(groupCreatedAt), [groupCreatedAt]);
  const [punTexts, setPunTexts] = useState<Record<string, string>>({});

  return (
    <div className="space-y-0">
      {dates.map((dateId, idx) => {
        const isExpanded = expandedDates.has(dateId);
        const isLoading = loadingDate === dateId;
        const puns = punsByDate[dateId] ?? [];

        return (
          <div key={dateId}>
            {/* Day separator */}
            <div className="relative flex items-center py-5">
              <div className="flex-1 border-t border-gray-200 dark:border-zinc-700" />
              <div className="mx-4 flex-shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 dark:bg-violet-400 inline-block" />
                  {formatDateLabel(dateId)}
                </span>
              </div>
              <div className="flex-1 border-t border-gray-200 dark:border-zinc-700" />
            </div>

            {/* Expand/collapse trigger */}
            <button
              onClick={() => toggleDate(dateId)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl border border-gray-100 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-sm text-gray-600 dark:text-zinc-400 mb-4"
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 opacity-60" />
                {isExpanded && puns.length > 0
                  ? `${puns.length} pun${puns.length !== 1 ? "s" : ""}`
                  : "View puns"}
              </span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 opacity-60" />
              ) : (
                <ChevronDown className="w-4 h-4 opacity-60" />
              )}
            </button>

            {/* Puns for this day */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {isLoading ? (
                    <div className="py-6 text-center text-gray-400 dark:text-zinc-500 italic text-sm mb-4">
                      Loading puns...
                    </div>
                  ) : (
                    <>
                      {/* Submission Component if attemptsLeft > 0 */}
                      {(() => {
                        const myPuns = puns.filter((p) => p.authorId === user?.uid);
                        const attemptsLeft = Math.max(0, 3 - myPuns.length);
                        const challenge = challengesByDate[dateId];
                        
                        if (attemptsLeft > 0 && challenge) {
                          return (
                            <div className="mb-6 p-4 rounded-xl border-2 border-dashed border-orange-200 dark:border-violet-800/60 bg-white/50 dark:bg-zinc-900/50">
                              <div className="mb-3">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Submit a Pun for this Day</h4>
                                <p className="text-xs text-gray-500 dark:text-zinc-500 font-mono mt-1">Topic: <span className="text-orange-600 dark:text-violet-400">{challenge.topic}</span> | Focus: <span className="text-orange-600 dark:text-violet-400">{challenge.focus}</span></p>
                              </div>
                              <textarea
                                placeholder="Type your late pun here..."
                                value={punTexts[dateId] || ""}
                                onChange={(e) => setPunTexts((prev) => ({ ...prev, [dateId]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && e.ctrlKey) {
                                    e.preventDefault();
                                    if ((punTexts[dateId] || "").trim() && !submitting) {
                                      submitPun(punTexts[dateId], null, dateId).then(() => {
                                        setPunTexts((prev) => ({ ...prev, [dateId]: "" }));
                                      });
                                    }
                                  }
                                }}
                                className="w-full p-3 text-sm font-serif italic bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 rounded-lg border-none focus:ring-2 focus:ring-orange-500 dark:focus:ring-violet-500 min-h-[60px] resize-none mb-3"
                              />
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500 dark:text-zinc-500">{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining</p>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if ((punTexts[dateId] || "").trim() && !submitting) {
                                      submitPun(punTexts[dateId], null, dateId).then(() => {
                                        setPunTexts((prev) => ({ ...prev, [dateId]: "" }));
                                      });
                                    }
                                  }}
                                  disabled={!(punTexts[dateId] || "").trim() || submitting}
                                  loading={submitting}
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  Submit
                                </Button>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {puns.length === 0 ? (
                        <div className="py-6 text-center text-gray-400 dark:text-zinc-500 italic text-sm mb-4">
                          No puns for this day.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 sm:gap-6 mb-4">
                          {puns.map((pun, punIdx) => (
                            <PunCard
                              key={pun.id}
                              pun={pun}
                              index={idx + punIdx * 0.1}
                              comments={getCommentsForPun(pun.id)}
                              submitting={submitting}
                              onReact={onReact}
                              onViewed={() => {}}
                              onEdit={onEdit}
                              onDelete={onDelete}
                              onComment={onComment}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
