import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, LogIn, X } from "lucide-react";
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

type LoginNotice = {
  tone: "success" | "error";
  message: string;
};

function popLoginNoticeFromUrl(): LoginNotice | null {
  const url = new URL(window.location.href);
  const status = url.searchParams.get("login");

  if (status !== "success" && status !== "failed") {
    return null;
  }

  url.searchParams.delete("login");
  window.history.replaceState(
    {},
    document.title,
    `${url.pathname}${url.search}${url.hash}` || "/",
  );

  return status === "success"
    ? {
        tone: "success",
        message: "Signed in successfully.",
      }
    : {
        tone: "error",
        message: "Google sign-in failed. Please try again.",
      };
}

function LoginNoticeBanner({
  notice,
  onClose,
}: {
  notice: LoginNotice | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="fixed left-1/2 top-4 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
        >
          <div
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur ${
              notice.tone === "success"
                ? "border-green-200 bg-green-50/95 text-green-700 dark:border-green-900/50 dark:bg-green-950/90 dark:text-green-300"
                : "border-red-200 bg-red-50/95 text-red-700 dark:border-red-900/50 dark:bg-red-950/90 dark:text-red-300"
            }`}
          >
            {notice.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <p className="flex-1 text-sm font-medium">{notice.message}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100"
              aria-label="Dismiss login message"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
    renameCurrentSession,
    kickPlayer,
  } = useSession();

  const [showProfile, setShowProfile] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [gauntletMode, setGauntletMode] = useState(false);
  const [sharedGauntletId, setSharedGauntletId] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [loginNotice, setLoginNotice] = useState<LoginNotice | null>(null);

  useEffect(() => {
    if (!isReady) return;
    setLoginNotice(popLoginNoticeFromUrl());
  }, [isReady]);

  useEffect(() => {
    if (!loginNotice) return;
    const timeoutId = window.setTimeout(() => setLoginNotice(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [loginNotice]);

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

  const closeOverlayScreens = () => {
    setGauntletMode(false);
    setSharedGauntletId(null);
    setShowLeaderboard(false);
  };

  const handleOpenLeaderboard = () => {
    setGauntletMode(false);
    setSharedGauntletId(null);
    setShowLeaderboard(true);
  };

  const handleOpenGauntlet = () => {
    setShowLeaderboard(false);
    setGauntletMode(true);
  };

  const handleLogoClick = () => {
    closeOverlayScreens();
    leaveSession();
  };

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
        <LoginNoticeBanner
          notice={loginNotice}
          onClose={() => setLoginNotice(null)}
        />
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
        <LoginNoticeBanner
          notice={loginNotice}
          onClose={() => setLoginNotice(null)}
        />
        <Header
          onOpenProfile={() => setShowProfile(true)}
          onOpenAbout={() => setShowAbout(true)}
          onOpenLeaderboard={handleOpenLeaderboard}
          onOpenGauntlet={handleOpenGauntlet}
          onLogoClick={
            gauntletMode || showLeaderboard || !!currentSession
              ? handleLogoClick
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
                onStartGauntlet={handleOpenGauntlet}
              />
            ) : (
              <GameBoard
                session={currentSession}
                loading={loading}
                onLeave={leaveSession}
                onDelete={deleteExistingSession}
                onRename={renameCurrentSession}
                onKick={(uid) => kickPlayer(currentSession.id, uid)}
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
