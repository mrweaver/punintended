import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { PunCard } from './PunCard';
import type { PunComment, PunReaction } from '../api/client';
import type { useChallengeHistory } from '../hooks/useChallengeHistory';

interface ChallengeHistoryPanelProps {
  historyState: ReturnType<typeof useChallengeHistory>;
  getCommentsForPun: (punId: string) => PunComment[];
  submitting: boolean;
  onReact: (punId: string, reaction: PunReaction | null) => void;
  onEdit: (punId: string, text: string) => void;
  onDelete: (punId: string) => void;
  onComment: (punId: string, text: string) => void;
}

function formatDateLabel(challengeId: string): string {
  const [year, month, day] = challengeId.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Generate the last N days as YYYY-MM-DD strings, excluding today. */
function pastDates(count: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(d.toLocaleDateString('en-CA'));
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
}: ChallengeHistoryPanelProps) {
  const { expandedDates, punsByDate, loadingDate, toggleDate } = historyState;
  const dates = useMemo(() => pastDates(14), []);

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
                  ? `${puns.length} pun${puns.length !== 1 ? 's' : ''}`
                  : 'View puns'}
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
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {isLoading ? (
                    <div className="py-6 text-center text-gray-400 dark:text-zinc-500 italic text-sm mb-4">
                      Loading puns...
                    </div>
                  ) : puns.length === 0 ? (
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
