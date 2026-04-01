import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface AboutModalProps {
  onClose: () => void;
}

const QUICK_START = [
  {
    n: "1",
    title: "Join or create a Group",
    body: "Invite friends via QR code or share link. You can be in multiple groups simultaneously — pun-bigamy is encouraged.",
  },
  {
    n: "2",
    title: "Get the daily challenge",
    body: "Every day at midnight AEST a new Topic + Focus combo drops. Read it. Stew on it. Let the wordplay percolate.",
  },
  {
    n: "3",
    title: "Submit up to 3 puns",
    body: "Other players' submissions stay hidden until you submit your first. No peeking — it's a level pun-ning field.",
  },
  {
    n: "4",
    title: "Get AI-scored",
    body: "Our AI judge rates each pun 0–10 on wit, relevance, and certified punniness. Results may cause involuntary groaning.",
  },
  {
    n: "5",
    title: "🙄 Groan — it's a compliment",
    body: "React to your group's puns with a Groan. Your best score of the day counts toward the weekly leaderboard.",
  },
];

const DETAILS = [
  {
    heading: "Scoring",
    body: "The AI evaluates humour, topic relevance, and wordplay craft. Your daily score is the highest of your three attempts — so a bad first pun isn't a write-off.",
  },
  {
    heading: "Weekly Leaderboard",
    body: "Mon–Sun, each player's best score per day accumulates. The lowest-scoring day is dropped automatically — because everyone deserves one bad pun day.",
  },
  {
    heading: "Global Leaderboards 🏆🍅📜",
    body: "The Trophy button in the header opens global leaderboards: Daily Crown (today's 10/10 puns ranked by Groans), Hall of Shame (≤2/10 puns, also ranked by Groans — solidarity), and All-Time Groaners (the greatest 10s ever submitted).",
  },
  {
    heading: "The Gauntlet ⚔️",
    body: "A solo endurance test: five rounds, sixty seconds each, no group required. Each prompt pairs a Topic with a Focus — your job is to bridge them with a pun. Score ≥5/10 and a speed bonus kicks in; idle thumbs forfeit it. Challenge a mate by sharing your link — they face the same five prompts blind. Both runs then appear side by side for comparison, with per-pun comment threads for the inevitable post-match debrief. Past gauntlets persist in the lobby history. For the truly pun-ished.",
  },
  {
    heading: "Challenge History",
    body: "In the Pun Board, switch to History to expand any past day and see every submission. Great for revisiting the pun that made you wish you'd thought of it first.",
  },
  {
    heading: "Groups",
    body: "Groups are shared spaces. Join via invite code or QR, or browse open groups in the lobby. One daily challenge for everyone, with group leaderboards for comparing scores.",
  },
];

export function AboutModal({ onClose }: AboutModalProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
        className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-md w-full relative shadow-2xl border border-gray-100 dark:border-zinc-800 max-h-[90vh] flex flex-col"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white p-2"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="mb-6">
          <h3 className="text-2xl font-serif italic dark:text-zinc-100">
            PunIntended
          </h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400 italic mt-1">
            Where bad jokes are totally intentional.
          </p>
        </div>

        <div className="overflow-y-auto pr-2 space-y-5 text-gray-600 dark:text-zinc-300 flex-1">
          {/* Quick Start */}
          <div className="space-y-4">
            {QUICK_START.map((step) => (
              <div key={step.n}>
                <h4 className="font-bold text-gray-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                  <span className="bg-orange-100 dark:bg-violet-900/50 text-orange-600 dark:text-violet-400 w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0">
                    {step.n}
                  </span>
                  {step.title}
                </h4>
                <p className="text-sm pl-8">{step.body}</p>
              </div>
            ))}
          </div>

          {/* Expandable details */}
          <div className="border-t border-gray-100 dark:border-zinc-800 pt-4">
            <button
              onClick={() => setDetailsOpen((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-medium text-gray-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-violet-400 transition-colors"
            >
              <span>Under the Hood</span>
              {detailsOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            <AnimatePresence initial={false}>
              {detailsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-4 space-y-4">
                    {DETAILS.map((item) => (
                      <div key={item.heading}>
                        <h5 className="font-semibold text-sm text-gray-800 dark:text-zinc-200 mb-0.5">
                          {item.heading}
                        </h5>
                        <p className="text-sm text-gray-500 dark:text-zinc-400">
                          {item.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 text-center">
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              v{__APP_VERSION__} &bull; Built with AI for the pun of it.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
