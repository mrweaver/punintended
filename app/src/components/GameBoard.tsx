import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trophy,
  QrCode,
  Send,
  Calendar,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePuns } from "../hooks/usePuns";
import { useChallengeHistory } from "../hooks/useChallengeHistory";
import { useMessages } from "../hooks/useMessages";
import { useComments } from "../hooks/useComments";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { PunCard } from "./PunCard";
import { ChallengeHistoryPanel } from "./ChallengeHistoryPanel";
import { ChatBox } from "./ChatBox";
import { ShareModal } from "./modals/ShareModal";
import { DeleteConfirmModal } from "./modals/DeleteConfirmModal";
import type { Session } from "../api/client";

interface GameBoardProps {
  session: Session;
  loading: boolean;

  onLeave: () => void;
  onDelete: (sessionId: string) => Promise<void>;
}

export function GameBoard({
  session,
  loading,

  onLeave,
  onDelete,
}: GameBoardProps) {
  const { user } = useAuth();
  const todayId = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const {
    puns,
    unviewedCount,
    sortMode,
    setSortMode,
    submitting,
    submitPun,
    editPun,
    deletePun,
    reactPun,
    markPunViewed,
  } = usePuns(session.id, todayId, user?.uid);
  const historyState = useChallengeHistory(session.id, session.challengeId);
  const { messages, sendMessage } = useMessages(session.id);
  const { addComment, getCommentsForPun } = useComments(session.id);
  const hasSubmittedToday = puns.some((p) => p.authorId === user?.uid);
  const challengeViewedAtRef = useRef<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (session.challenge && !challengeViewedAtRef.current) {
      challengeViewedAtRef.current = Date.now();
    }
  }, [session.challenge]);

  const [punText, setPunText] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const lastReadCountRef = useRef<number>(0);
  const chatInitializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!chatInitializedRef.current && messages.length > 0) {
      chatInitializedRef.current = true;
      lastReadCountRef.current = messages.length;
    }
  }, [messages.length]);

  useEffect(() => {
    if (chatOpen) lastReadCountRef.current = messages.length;
  }, [chatOpen, messages.length]);

  const unreadChatCount = chatOpen ? 0 : Math.max(0, messages.length - lastReadCountRef.current);

  const handleSubmitPun = async () => {
    if (!punText.trim()) return;
    const responseTimeMs = challengeViewedAtRef.current
      ? Date.now() - challengeViewedAtRef.current
      : null;
    try {
      await submitPun(punText.trim(), responseTimeMs);
      setPunText("");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit pun";
      alert(message);
    }
  };

  const isOwner = session.ownerId === user?.uid;

  const SORT_LABELS: Record<typeof sortMode, string> = {
    unviewed: "Unread",
    top: "Top",
    new: "New",
  };

  return (
    <motion.div
      key="game"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-8"
    >
      {/* Game Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <Button variant="ghost" onClick={onLeave} className="mb-2 -ml-4">
            ← Back to Lobby
          </Button>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl sm:text-4xl font-serif italic font-bold dark:text-zinc-100">
              {session.name}
            </h1>
            {isOwner && (
              <Button
                variant="ghost"
                onClick={() => setSessionToDelete(session.id)}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm"
              >
                Delete
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {session.players.map((p) => (
              <img
                key={p.uid}
                src={p.photoURL}
                className="w-10 h-10 rounded-full border-2 border-white dark:border-zinc-950"
                title={p.name}
                alt={p.name}
              />
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => setShowShareModal(true)}
            className="text-xs px-3 py-2"
          >
            <QrCode className="w-4 h-4" />
            Invite
          </Button>
        </div>
      </div>

      {/* Daily Challenge Cards */}
      <div className="flex justify-between items-end mb-4">
        <div>
          <h2 className="text-2xl font-serif italic text-gray-500 dark:text-zinc-400">
            Today's Challenge
          </h2>
          {session.challengeId && (
            <p className="text-xs font-mono text-gray-400 dark:text-zinc-500 mt-0.5">
              {new Date(session.challengeId + "T00:00:00").toLocaleDateString(
                undefined,
                { weekday: "long", year: "numeric", month: "long", day: "numeric" },
              )}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        <motion.div
          key={`topic-${session.challengeId}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          whileHover={{ rotate: -1 }}
          className="bg-zinc-900 dark:bg-zinc-800 text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] relative overflow-hidden group border border-transparent dark:border-zinc-700"
        >
          <p className="text-orange-500 dark:text-violet-400 font-mono text-[10px] sm:text-xs uppercase tracking-widest mb-1 sm:mb-2">
            Topic
          </p>
          <h2 className="text-2xl sm:text-4xl font-serif italic">
            {session.challenge?.topic ||
              (isOwner ? "Generating..." : "Waiting for Host...")}
          </h2>
        </motion.div>
        <motion.div
          key={`focus-${session.challengeId}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          whileHover={{ rotate: 1 }}
          className="bg-orange-500 dark:bg-violet-600 text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] relative overflow-hidden group border border-transparent dark:border-violet-500"
        >
          <p className="text-white/60 font-mono text-[10px] sm:text-xs uppercase tracking-widest mb-1 sm:mb-2">
            Focus
          </p>
          <h2 className="text-2xl sm:text-4xl font-serif italic">
            {session.challenge?.focus ||
              (isOwner ? "Generating..." : "Waiting for Host...")}
          </h2>
        </motion.div>
      </div>

      {/* Submission Form */}
      <Card className="border-2 border-orange-100 dark:border-violet-900/50">
        <div className="flex flex-col gap-4">
          <textarea
            placeholder="Type your pun here..."
            value={punText}
            onChange={(e) => setPunText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                handleSubmitPun();
              }
            }}
            className="w-full p-4 sm:p-6 text-lg sm:text-xl font-serif italic bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 rounded-xl sm:rounded-2xl border-none focus:ring-2 focus:ring-orange-500 dark:focus:ring-violet-500 min-h-[100px] sm:min-h-[120px] resize-none"
          />
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <p className="text-sm text-gray-500 dark:text-zinc-400 italic">
              Tip: Combine {session.challenge?.topic} and{" "}
              {session.challenge?.focus} for maximum points!{" "}
              <span className="text-xs opacity-60">Ctrl+Enter to submit.</span>
            </p>
            <Button
              variant="secondary"
              onClick={handleSubmitPun}
              disabled={!punText.trim() || submitting}
              loading={submitting}
              className="w-full sm:w-auto"
            >
              <Send className="w-5 h-5" />
              Submit Pun
            </Button>
          </div>
        </div>
      </Card>

      {/* Puns Feed and Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <div className="lg:col-span-2 flex flex-col h-full">
          {/* Board header + controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
            <h2 className="text-2xl sm:text-3xl font-serif italic flex items-center gap-3 dark:text-zinc-100">
              <Trophy className="text-orange-500 dark:text-violet-500" />
              {showHistory ? "Challenge History" : "Pun Board"}
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              {!showHistory && hasSubmittedToday && (
                <>
                  {(["unviewed", "top", "new"] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={sortMode === mode ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setSortMode(mode)}
                    >
                      {SORT_LABELS[mode]}
                      {mode === "unviewed" && unviewedCount > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-orange-500 dark:bg-violet-500 text-white">
                          {unviewedCount > 9 ? "9+" : unviewedCount}
                        </span>
                      )}
                    </Button>
                  ))}
                  <div className="w-px h-5 bg-gray-200 dark:bg-zinc-700" />
                </>
              )}
              <Button
                variant={showHistory ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? (
                  <>
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Today
                  </>
                ) : (
                  <>
                    <Calendar className="w-3.5 h-3.5" />
                    History
                    {historyState.history.length > 0 && (
                      <span className="ml-1 text-xs text-gray-400 dark:text-zinc-500">
                        ({historyState.history.length})
                      </span>
                    )}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Content area */}
          <AnimatePresence mode="wait">
            {showHistory ? (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
              >
                <ChallengeHistoryPanel
                  historyState={historyState}
                  getCommentsForPun={getCommentsForPun}
                  submitting={submitting}
                  onReact={reactPun}
                  onEdit={editPun}
                  onDelete={deletePun}
                  onComment={addComment}
                />
              </motion.div>
            ) : (
              <motion.div
                key="today"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
                className="grid grid-cols-1 gap-4 sm:gap-6 flex-1"
              >
                {!hasSubmittedToday ? (
                  <div className="text-center py-8 sm:py-12 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-dashed border-orange-200 dark:border-violet-800">
                    <p className="text-gray-500 dark:text-zinc-400 italic">
                      Submit your pun above to reveal your group's submissions.
                    </p>
                  </div>
                ) : puns.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-dashed border-gray-300 dark:border-zinc-800">
                    <p className="text-gray-400 dark:text-zinc-500 italic">
                      No puns submitted yet. Be the first to break the ice!
                    </p>
                  </div>
                ) : (
                  puns.map((pun, i) => (
                    <PunCard
                      key={pun.id}
                      pun={pun}
                      index={i}
                      comments={getCommentsForPun(pun.id)}
                      submitting={submitting}
                      onReact={reactPun}
                      onViewed={markPunViewed}
                      onEdit={editPun}
                      onDelete={deletePun}
                      onComment={addComment}
                    />
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden lg:block lg:col-span-1">
          <ChatBox messages={messages} onSendMessage={sendMessage} />
        </div>
      </div>

      {/* Mobile chat FAB */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <button
          onClick={() => setChatOpen(true)}
          className="relative w-14 h-14 rounded-full bg-orange-500 dark:bg-violet-600 text-white shadow-lg flex items-center justify-center"
          aria-label="Open Group Chat"
        >
          <MessageSquare className="w-6 h-6" />
          {unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-zinc-950">
              {unreadChatCount > 9 ? "9+" : unreadChatCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile chat bottom drawer */}
      <AnimatePresence>
        {chatOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              onClick={() => setChatOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 lg:hidden rounded-t-3xl overflow-hidden"
              style={{ height: "75vh" }}
            >
              <ChatBox
                messages={messages}
                onSendMessage={sendMessage}
                onClose={() => setChatOpen(false)}
                isMobileModal
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modals */}
      {showShareModal && (
        <ShareModal
          session={session}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {sessionToDelete && (
        <DeleteConfirmModal
          onConfirm={async () => {
            await onDelete(sessionToDelete);
            setSessionToDelete(null);
          }}
          onCancel={() => setSessionToDelete(null)}
        />
      )}
    </motion.div>
  );
}
