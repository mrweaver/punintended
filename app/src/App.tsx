import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { LogIn } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useAuth } from "./contexts/AuthContext";
import { useSession } from "./hooks/useSession";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { SessionLobby } from "./components/SessionLobby";
import { GameBoard } from "./components/GameBoard";
import { GauntletMode } from "./components/GauntletMode";
import { GlobalLeaderboard } from "./components/GlobalLeaderboard";
import { ProfileModal } from "./components/modals/ProfileModal";
import { AboutModal } from "./components/modals/AboutModal";
import { DeleteConfirmModal } from "./components/modals/DeleteConfirmModal";
import { ChangelogModal } from "./components/modals/ChangelogModal";
import { Button } from "./components/ui/Button";
import { Logo } from "./components/ui/Logo";

export default function App() {
  const { user, isReady, login } = useAuth();
  const {
    sessions,
    currentSession,
    loading,
    createNewSession,
    joinExistingSession,
    joinSessionById,
    leaveSession,
    deleteExistingSession,
  } = useSession();

  const [showProfile, setShowProfile] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [gauntletMode, setGauntletMode] = useState(false);
  const [sharedGauntletId, setSharedGauntletId] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Auto-enter gauntlet from a shared ?gauntlet= URL (mirrors ?session= handling)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const gauntletId = params.get("gauntlet");
    if (gauntletId) {
      setSharedGauntletId(gauntletId);
      setGauntletMode(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [user]);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
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
            <Logo
              className="w-10 h-10 sm:w-12 sm:h-12 text-orange-600 dark:text-violet-400"
              accent
            />
          </div>
          <h1 className="text-4xl sm:text-6xl font-serif italic mb-4 text-zinc-900 dark:text-zinc-100">
            PunIntended
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-zinc-400 mb-8 sm:mb-12">
            The social game where wit meets wordplay. Compete with friends for
            the ultimate pun glory.
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
          onOpenLeaderboard={() => setShowLeaderboard(true)}
          onLogoClick={
            gauntletMode || showLeaderboard || !!currentSession
              ? () => {
                  setGauntletMode(false);
                  setSharedGauntletId(null);
                  setShowLeaderboard(false);
                  leaveSession();
                }
              : undefined
          }
          onNotificationClick={(link) => {
            if (link) {
              const targetSession = sessions.find((s) => s.id === link);
              if (targetSession) joinExistingSession(targetSession);
            }
          }}
        />

        <main className="max-w-6xl mx-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            {gauntletMode ? (
              <GauntletMode
                key="gauntlet"
                initialGauntletId={sharedGauntletId ?? undefined}
                onExit={() => {
                  setGauntletMode(false);
                  setSharedGauntletId(null);
                }}
              />
            ) : showLeaderboard ? (
              <GlobalLeaderboard
                key="leaderboard"
                onClose={() => setShowLeaderboard(false)}
              />
            ) : !currentSession ? (
              <SessionLobby
                sessions={sessions}
                loading={loading}
                onCreateSession={createNewSession}
                onJoinSession={joinExistingSession}
                onJoinById={joinSessionById}
                onDeleteSession={(id) => setSessionToDelete(id)}
                onStartGauntlet={() => setGauntletMode(true)}
              />
            ) : (
              <GameBoard
                session={currentSession}
                loading={loading}
                onLeave={leaveSession}
                onDelete={deleteExistingSession}
              />
            )}
          </AnimatePresence>
        </main>

        <footer className="p-12 text-center text-gray-400 dark:text-zinc-600 text-sm">
          <p>
            &copy; 2026 Cotlone Studios &bull; Built with AI for the pun of it.
          </p>
          <button
            onClick={() => setShowChangelog(true)}
            className="mt-2 text-xs opacity-50 hover:opacity-100 hover:text-orange-500 dark:hover:text-violet-400 transition-all cursor-pointer"
          >
            v{__APP_VERSION__}
          </button>
        </footer>

        {/* Global Modals */}
        {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
        {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
        {showChangelog && (
          <ChangelogModal onClose={() => setShowChangelog(false)} />
        )}
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
