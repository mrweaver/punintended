import { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useAuth } from './contexts/AuthContext';
import { useSession } from './hooks/useSession';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { SessionLobby } from './components/SessionLobby';
import { GameBoard } from './components/GameBoard';
import { ProfileModal } from './components/modals/ProfileModal';
import { AboutModal } from './components/modals/AboutModal';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { ChangelogModal } from './components/modals/ChangelogModal';
import { Button } from './components/ui/Button';
import { Logo } from './components/ui/Logo';

export default function App() {
  const { user, isReady, login } = useAuth();
  const {
    sessions,
    currentSession,
    loading,
    staleChallengeDetected,
    createNewSession,
    joinExistingSession,
    leaveSession,
    deleteExistingSession,
  } = useSession();

  const [showProfile, setShowProfile] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">Loading...</div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] dark:bg-zinc-950 flex flex-col items-center justify-center p-6 transition-colors">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="mb-6 sm:mb-8 inline-block p-3 sm:p-4 bg-orange-100 dark:bg-violet-900/30 rounded-2xl sm:rounded-3xl">
            <Logo className="w-10 h-10 sm:w-12 sm:h-12 text-orange-600 dark:text-violet-400" accent />
          </div>
          <h1 className="text-4xl sm:text-6xl font-serif italic mb-4 text-zinc-900 dark:text-zinc-100">
            PunIntended
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-zinc-400 mb-8 sm:mb-12">
            The social game where wit meets wordplay. Compete with friends for the ultimate pun
            glory.
          </p>
          <Button onClick={login} className="w-full py-4 text-lg">
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F5F5F0] dark:bg-zinc-950 text-[#1A1A1A] dark:text-zinc-100 font-sans transition-colors">
        <Header
          onOpenProfile={() => setShowProfile(true)}
          onOpenAbout={() => setShowAbout(true)}
          onNotificationClick={(link) => {
            if (link) {
              const targetSession = sessions.find((s) => s.id === link);
              if (targetSession) joinExistingSession(targetSession);
            }
          }}
        />

        <main className="max-w-6xl mx-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            {!currentSession ? (
              <SessionLobby
                sessions={sessions}
                loading={loading}
                onCreateSession={createNewSession}
                onJoinSession={joinExistingSession}
                onDeleteSession={(id) => setSessionToDelete(id)}
              />
            ) : (
              <GameBoard
                session={currentSession}
                loading={loading}
                staleChallengeDetected={staleChallengeDetected}
                onLeave={leaveSession}
                onDelete={deleteExistingSession}
              />
            )}
          </AnimatePresence>
        </main>

        <footer className="p-12 text-center text-gray-400 dark:text-zinc-600 text-sm">
          <p>&copy; 2026 PunIntended &bull; Built with AI for the pun of it.</p>
          <button
            onClick={() => setShowChangelog(true)}
            className="mt-2 text-xs opacity-50 hover:opacity-100 hover:text-orange-500 dark:hover:text-violet-400 transition-all cursor-pointer"
          >
            v1.3.0
          </button>
        </footer>

        {/* Global Modals */}
        {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
        {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
        {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
        {sessionToDelete && (
          <DeleteConfirmModal
            onConfirm={async () => {
              await deleteExistingSession(sessionToDelete);
              setSessionToDelete(null);
            }}
            onCancel={() => setSessionToDelete(null)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
