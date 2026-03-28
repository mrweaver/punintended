import { motion } from 'motion/react';

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
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
        >
          ✕
        </button>
        <h3 className="text-2xl font-serif italic mb-6 dark:text-zinc-100">How to Play</h3>

        <div className="overflow-y-auto pr-2 space-y-6 text-gray-600 dark:text-zinc-300">
          <div>
            <h4 className="font-bold text-gray-900 dark:text-zinc-100 mb-2 flex items-center gap-2">
              <span className="bg-orange-100 dark:bg-violet-900/50 text-orange-600 dark:text-violet-400 w-6 h-6 rounded-full flex items-center justify-center text-sm">
                1
              </span>
              Check the Daily Topic
            </h4>
            <p className="text-sm">
              Every day brings a new topic. Read the prompt and get your creative juices flowing.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-900 dark:text-zinc-100 mb-2 flex items-center gap-2">
              <span className="bg-orange-100 dark:bg-violet-900/50 text-orange-600 dark:text-violet-400 w-6 h-6 rounded-full flex items-center justify-center text-sm">
                2
              </span>
              Submit Your Pun
            </h4>
            <p className="text-sm">
              Type in your best pun related to the topic. You only get one shot per day, so make it
              count!
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-900 dark:text-zinc-100 mb-2 flex items-center gap-2">
              <span className="bg-orange-100 dark:bg-violet-900/50 text-orange-600 dark:text-violet-400 w-6 h-6 rounded-full flex items-center justify-center text-sm">
                3
              </span>
              Get AI Scored
            </h4>
            <p className="text-sm">
              Our AI judge will instantly score your pun out of 10 based on humor, relevance, and
              "punniness" (the groan factor).
            </p>
          </div>

          <div>
            <h4 className="font-bold text-gray-900 dark:text-zinc-100 mb-2 flex items-center gap-2">
              <span className="bg-orange-100 dark:bg-violet-900/50 text-orange-600 dark:text-violet-400 w-6 h-6 rounded-full flex items-center justify-center text-sm">
                4
              </span>
              Vote & Chat
            </h4>
            <p className="text-sm">
              Read other players' puns, upvote your favorites, and chat with the community in the
              session chat.
            </p>
          </div>

          <div className="pt-6 border-t border-gray-100 dark:border-zinc-800 text-center">
            <p className="text-xs text-gray-400 dark:text-zinc-500">Version 1.1.0</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
