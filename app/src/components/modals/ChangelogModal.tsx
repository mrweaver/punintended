import { motion } from 'motion/react';
import { Sparkles, MessageCircle, Shield, Zap, Bell, Users } from 'lucide-react';

interface ChangelogModalProps {
  onClose: () => void;
}

const CHANGELOG = [
  {
    version: '1.2.0',
    date: '2026-03-28',
    highlights: [
      {
        icon: Zap,
        title: 'Speed Score',
        description:
          'A timer starts when you see the challenge. Faster submissions earn a speed bonus — quick wit + great pun = best outcome.',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-28',
    highlights: [
      {
        icon: Sparkles,
        title: 'AI-Powered Pun Scoring',
        description:
          'Puns are scored by a jaded AI comedy critic who rates creativity, humor, and groan factor.',
      },
      {
        icon: Users,
        title: 'Multiplayer Sessions',
        description:
          'Create or join sessions, invite friends via QR code, and compete head-to-head.',
      },
      {
        icon: Shield,
        title: 'Fair Play Enforcement',
        description:
          'Turn-based pun submission ensures everyone gets a fair shot before you can go again.',
      },
      {
        icon: MessageCircle,
        title: 'Comments & Chat',
        description:
          'React to puns, leave comments, and chat with other players in real-time.',
      },
      {
        icon: Bell,
        title: 'Live Notifications',
        description:
          'Real-time alerts when someone reacts to your pun or the host refreshes a challenge.',
      },
      {
        icon: Zap,
        title: 'Daily Challenges',
        description:
          'AI-generated topic + focus combos that force creative connections between unrelated concepts.',
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-25',
    highlights: [
      {
        icon: Sparkles,
        title: 'Initial Release',
        description:
          'Core pun game with Google sign-in, session management, and dark mode.',
      },
    ],
  },
];

export function ChangelogModal({ onClose }: ChangelogModalProps) {
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
        <h3 className="text-2xl font-serif italic mb-6 dark:text-zinc-100">What's New</h3>

        <div className="overflow-y-auto pr-2 space-y-8">
          {CHANGELOG.map((release) => (
            <div key={release.version}>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="text-lg font-bold text-orange-600 dark:text-violet-400">
                  v{release.version}
                </span>
                <span className="text-xs text-gray-400 dark:text-zinc-500">{release.date}</span>
              </div>
              <div className="space-y-3">
                {release.highlights.map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="mt-0.5 shrink-0 w-7 h-7 rounded-lg bg-orange-100 dark:bg-violet-900/50 flex items-center justify-center">
                      <item.icon className="w-3.5 h-3.5 text-orange-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
