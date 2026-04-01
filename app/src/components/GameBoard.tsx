import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trophy,
  QrCode,
  Send,
  Calendar,
  ArrowLeft,
  MessageSquare,
  Pencil,
  Check,
  X,
  UserMinus,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePuns } from "../hooks/usePuns";
import { useChallengeHistory } from "../hooks/useChallengeHistory";
import { useMessages } from "../hooks/useMessages";
import { useComments } from "../hooks/useComments";
import { useScoreSound } from "../hooks/useScoreSound";
import { useTypingStatus } from "../hooks/useTypingStatus";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { PunCard } from "./PunCard";
import { ChallengeHistoryPanel } from "./ChallengeHistoryPanel";
import { ChatBox } from "./ChatBox";
import { PlayerLeaderboard } from "./PlayerLeaderboard";
import { WeeklyLeaderboard } from "./WeeklyLeaderboard";
import { ShareModal } from "./modals/ShareModal";
import { DeleteConfirmModal } from "./modals/DeleteConfirmModal";
import type { Group, DailyChallenge } from "../api/client";
import { dailyApi } from "../api/client";

interface GameBoardProps {
  session: Group;
  loading: boolean;

  onLeave: () => void;
  onDelete: (groupId: string) => Promise<void>;
  onRename: (groupId: string, name: string) => Promise<void>;
  onKick: (uid: number) => Promise<void>;
}

export function GameBoard({
  session,
  loading,

  onLeave,
  onDelete,
  onRename,
  onKick,
}: GameBoardProps) {
  const { user } = useAuth();
  const todayId = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);

  // Fetch global daily challenge
  useEffect(() => {
    dailyApi.getChallenge(todayId).then(setChallenge).catch(console.error);
  }, [todayId]);

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
  } = usePuns(todayId, user?.uid, session.id);
  const historyState = useChallengeHistory(session.id);
  const { messages, sendMessage, reactToMessage } = useMessages(session.id);
  const { addComment, reactToComment, getCommentsForPun, loadCommentsForPun } = useComments();
  const { unlock: unlockAudio, playScore } = useScoreSound();
  const { typingPlayers, reportTyping, onTextChange } = useTypingStatus(
    session.id,
  );
  const myPunCount = puns.filter((p) => p.authorId === user?.uid).length;
  const attemptsLeft = Math.max(0, 3 - myPunCount);
  const hasSubmittedToday = myPunCount > 0;
  const prevPunsRef = useRef<typeof puns>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [punText, setPunText] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(session.name);
  const [playerToKick, setPlayerToKick] = useState<number | null>(null);
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

  const unreadChatCount = chatOpen
    ? 0
    : Math.max(0, messages.length - lastReadCountRef.current);

  // Play a sound when the current user's pun gets AI-scored
  useEffect(() => {
    for (const current of puns.filter((p) => p.authorId === user?.uid)) {
      const prev = prevPunsRef.current.find((p) => p.id === current.id);
      if (current.aiScore !== null && prev?.aiScore == null) {
        playScore(current.aiScore);
        break;
      }
    }
    prevPunsRef.current = puns;
  }, [puns, user?.uid, playScore]);

  const handleSubmitPun = useCallback(async () => {
    if (!punText.trim() || attemptsLeft === 0) return;
    unlockAudio();
    try {
      await submitPun(punText.trim());
      reportTyping("submitted");
      setPunText("");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit pun";
      alert(message);
    }
  }, [punText, attemptsLeft, unlockAudio, submitPun, reportTyping]);

  const handleRename = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== session.name) {
      await onRename(session.id, trimmed);
    } else {
      setNameInput(session.name);
    }
    setEditingName(false);
  }, [nameInput, session.name, session.id, onRename]);

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
          <div className="flex items-center gap-3">
            {isOwner && editingName ? (
              <>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") {
                      setNameInput(session.name);
                      setEditingName(false);
                    }
                  }}
                  className="text-2xl sm:text-4xl font-serif italic font-bold dark:text-zinc-100 bg-transparent border-b-2 border-orange-500 dark:border-violet-500 outline-none w-48 sm:w-72"
                />
                <button
                  onClick={handleRename}
                  className="text-green-500 hover:text-green-600"
                >
                  <Check className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    setNameInput(session.name);
                    setEditingName(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </>
            ) : (
              <>
                <h1 className="text-2xl sm:text-4xl font-serif italic font-bold dark:text-zinc-100">
                  {session.name}
                </h1>
                {isOwner && (
                  <button
                    onClick={() => {
                      setNameInput(session.name);
                      setEditingName(true);
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
                    title="Rename group"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
            {isOwner && !editingName && (
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
              <div key={p.uid} className="relative group">
                <img
                  src={p.photoURL}
                  className="w-10 h-10 rounded-full border-2 border-white dark:border-zinc-950"
                  title={p.name}
                  alt={p.name}
                />
                {isOwner && p.uid !== user?.uid && (
                  <button
                    onClick={() => setPlayerToKick(p.uid)}
                    title={`Kick ${p.name}`}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center hidden group-hover:flex"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
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
          {challenge?.challengeId && (
            <p className="text-xs font-mono text-gray-400 dark:text-zinc-500 mt-0.5">
              {new Date(challenge.challengeId + "T00:00:00").toLocaleDateString(
                undefined,
                {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                },
              )}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        <motion.div
          key={`topic-${challenge?.challengeId}`}
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
            {challenge?.topic || "Generating..."}
          </h2>
        </motion.div>
        <motion.div
          key={`focus-${challenge?.challengeId}`}
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
            {challenge?.focus || "Generating..."}
          </h2>
        </motion.div>
      </div>

      {/* Submission Form */}
      <Card className="border-2 border-orange-100 dark:border-violet-900/50">
        <div className="flex flex-col gap-4">
          <textarea
            placeholder={
              attemptsLeft === 0
                ? "No submissions remaining today."
                : "Type your pun here..."
            }
            value={punText}
            disabled={attemptsLeft === 0}
            onChange={(e) => {
              setPunText(e.target.value);
              onTextChange(e.target.value.trim().length > 0);
            }}
            onBlur={() => reportTyping("idle")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                handleSubmitPun();
              }
            }}
            className="w-full p-4 sm:p-6 text-lg sm:text-xl font-serif italic bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 rounded-xl sm:rounded-2xl border-none focus:ring-2 focus:ring-orange-500 dark:focus:ring-violet-500 min-h-[100px] sm:min-h-[120px] resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-gray-500 dark:text-zinc-400 italic">
                Tip: Combine {challenge?.topic} and{" "}
                {challenge?.focus} for maximum points!
              </p>
              <p
                className={`text-xs font-mono ${attemptsLeft === 0 ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-zinc-500"}`}
              >
                {attemptsLeft === 0
                  ? "No submissions remaining today — come back tomorrow!"
                  : `${attemptsLeft} submission${attemptsLeft !== 1 ? "s" : ""} remaining today`}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={handleSubmitPun}
              disabled={!punText.trim() || submitting || attemptsLeft === 0}
              loading={submitting}
              className="w-full sm:w-auto"
            >
              <Send className="w-5 h-5" />
              Submit Pun
            </Button>
          </div>
        </div>
      </Card>

      {/* Live Leaderboard */}
      {hasSubmittedToday && puns.length > 0 && (
        <div className="flex flex-col gap-3">
          <PlayerLeaderboard puns={puns} players={session.players} />
          <WeeklyLeaderboard groupId={session.id} puns={puns} />
        </div>
      )}

      {/* Puns Feed and Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <div className="lg:col-span-2 flex flex-col">
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
                className="grid grid-cols-1 gap-4 sm:gap-6"
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
                  <>
                    {puns.map((pun, i) => (
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
                        onCommentReact={(commentId, reaction) => reactToComment(commentId, pun.id, reaction)}
                        onLoadComments={loadCommentsForPun}
                      />
                    ))}
                    <AnimatePresence>
                      {typingPlayers
                        .filter((p) => p.uid !== user?.uid)
                        .map((player) => (
                          <motion.div
                            key={`typing-${player.uid}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-dashed border-orange-200 dark:border-violet-800/50 opacity-70"
                          >
                            <div className="flex items-center gap-2">
                              <img
                                src={player.photoURL}
                                className="w-6 h-6 rounded-full"
                                alt={player.name}
                              />
                              <span className="text-sm text-gray-500 dark:text-zinc-400 italic">
                                {player.status === "typing"
                                  ? `${player.name.split(" ")[0]} is cooking up a pun...`
                                  : `${player.name.split(" ")[0]} has submitted ✓`}
                              </span>
                              {player.status === "typing" && (
                                <span className="flex gap-0.5 ml-1">
                                  {[0, 1, 2].map((i) => (
                                    <span
                                      key={i}
                                      className="w-1 h-1 rounded-full bg-orange-400 dark:bg-violet-400 animate-bounce"
                                      style={{ animationDelay: `${i * 0.15}s` }}
                                    />
                                  ))}
                                </span>
                              )}
                            </div>
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden lg:block lg:col-span-1">
          <ChatBox
            messages={messages}
            onSendMessage={sendMessage}
            onReactToMessage={reactToMessage}
          />
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
                onReactToMessage={reactToMessage}
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
          title="Invite Friends"
          description={
            <>
              Scan the QR code or share the link below to invite players to{" "}
              <strong className="dark:text-zinc-200">{session.name}</strong>.
            </>
          }
          shareUrl={`${window.location.origin}?group=${session.id}`}
          shareMessage={`Join my PunIntended group, ${session.name}.`}
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

      {playerToKick !== null && (
        <DeleteConfirmModal
          message={`Remove ${session.players.find((p) => p.uid === playerToKick)?.name ?? "this player"} from the group?`}
          confirmLabel="Kick"
          onConfirm={async () => {
            await onKick(playerToKick);
            setPlayerToKick(null);
          }}
          onCancel={() => setPlayerToKick(null)}
        />
      )}
    </motion.div>
  );
}
