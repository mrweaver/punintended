import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Users,
  Trash2,
  LogIn,
  Send,
  Eye,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  formatRevealTime,
  useChallengeReveal,
} from "../hooks/useChallengeReveal";
import { formatFuzzyTime } from "../utils/time";
import { useGlobalLeaderboard } from "../hooks/useGlobalLeaderboard";
import { usePuns } from "../hooks/usePuns";
import {
  dailyApi,
  type DailyChallenge,
  type Group,
  type Pun,
} from "../api/client";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { PunCard } from "./PunCard";

interface SessionLobbyProps {
  sessions: Group[];
  loading: boolean;
  onCreateSession: (name: string) => Promise<void>;
  onJoinSession: (session: Group) => void;
  onJoinById: (id: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => void;
  onOpenSubmissions: () => void;
}

export function SessionLobby({
  sessions,
  loading,
  onCreateSession,
  onJoinSession,
  onJoinById,
  onDeleteSession,
  onOpenSubmissions,
}: SessionLobbyProps) {
  const { user } = useAuth();
  const { daily } = useGlobalLeaderboard();

  // ── Group / invite state ──
  const [newSessionName, setNewSessionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joiningById, setJoiningById] = useState(false);
  const [joinByIdError, setJoinByIdError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // ── Daily challenge + reveal state ──
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const todayId = useMemo(() => new Date().toLocaleDateString("en-CA"), []);

  useEffect(() => {
    dailyApi.getChallenge(todayId).then(setChallenge).catch(console.error);
  }, [todayId]);

  const { revealedAt, isRevealed, elapsedMs, revealChallenge } =
    useChallengeReveal(challenge);

  // ── Pun submission from the lobby (global, no group) ──
  const {
    puns: lobbyPuns,
    submitting,
    submitPun,
  } = usePuns(isRevealed ? todayId : "", user?.uid);

  // Isolate myPuns to map over them
  const myPuns = lobbyPuns.filter((p) => p.authorId === user?.uid);
  const myPunCount = myPuns.length;
  const attemptsLeft = Math.max(0, 3 - myPunCount);
  const bestPun =
    myPuns.length > 0
      ? myPuns.reduce((best, p) =>
          (p.aiScore ?? 0) > (best.aiScore ?? 0) ? p : best,
        )
      : null;
  const [punText, setPunText] = useState("");

  const handleSubmitPun = async () => {
    if (!punText.trim() || attemptsLeft === 0 || !revealedAt) return;
    const responseTimeMs = Date.now() - revealedAt;
    await submitPun(punText.trim(), responseTimeMs);
    setPunText("");
  };

  // ── Leaderboard helpers ──
  const livePlayers = useMemo(
    () => sessions.reduce((sum, s) => sum + s.players.length, 0),
    [sessions],
  );

  const todayLeader = daily?.puns[0] ?? null;
  const isBestAlsoLeader =
    bestPun != null && todayLeader != null && bestPun.id === todayLeader.id;
  const othersCount = myPunCount - (bestPun ? 1 : 0);

  // ── Group handlers ──
  const handleCreate = async () => {
    if (!newSessionName.trim()) return;
    await onCreateSession(newSessionName.trim());
    setNewSessionName("");
    setShowCreateModal(false);
  };

  const handleJoinById = async () => {
    const code = inviteCode.trim();
    if (!code) return;
    setJoiningById(true);
    setJoinByIdError("");
    try {
      await onJoinById(code);
      setInviteCode("");
      setShowJoinModal(false);
    } catch {
      setJoinByIdError("Group not found. Check the code and try again.");
    } finally {
      setJoiningById(false);
    }
  };

  return (
    <motion.div
      key="landing"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-6"
    >
      {/* ── Section 1: Today's Challenge Hero ── */}
      <Card className="relative overflow-hidden">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 mb-2">
            <p className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.24em] text-accent">
              Today&apos;s Challenge
            </p>
            <span className="hidden sm:inline text-accent opacity-50">
              &middot;
            </span>
            <p className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.24em] text-text-muted">
              {new Date().toLocaleDateString("en-AU", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {!challenge ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-8 text-center"
              >
                <p className="text-lg text-text-muted font-serif italic">
                  Loading today&apos;s challenge&hellip;
                </p>
              </motion.div>
            ) : !isRevealed ? (
              <motion.div
                key="pre-reveal"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-6 sm:py-10 flex flex-col items-center text-center gap-4"
              >
                <h1 className="text-3xl sm:text-5xl font-serif italic text-text">
                  Ready to play?
                </h1>
                <p className="text-sm sm:text-base text-text-secondary max-w-md leading-relaxed">
                  Your timer starts the moment you reveal the challenge. Take a
                  breath, then hit the button when you&apos;re ready.
                </p>
                <Button
                  onClick={revealChallenge}
                  className="mt-2 px-8 py-4 text-lg"
                >
                  <Eye className="w-5 h-5" />
                  Begin Today&apos;s Challenge
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="post-reveal"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {revealedAt && (
                  <div className="flex items-center gap-3 text-sm text-text-muted">
                    <span>
                      Revealed:{" "}
                      <span className="font-medium text-text">
                        {formatRevealTime(revealedAt)}
                      </span>
                    </span>
                    <span
                      className="h-3 w-[1px] bg-border"
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">
                      Elapsed:{" "}
                      <span className="font-medium text-text">
                        {formatFuzzyTime(elapsedMs)}
                      </span>
                    </span>
                  </div>
                )}

                {/* Topic + Focus cards */}
                <div className="grid grid-cols-2 gap-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="bg-surface-inverse text-white p-4 rounded-2xl"
                  >
                    <p className="text-accent font-mono text-[10px] uppercase tracking-widest mb-1">
                      Topic
                    </p>
                    <h2 className="text-xl sm:text-2xl font-serif italic">
                      {challenge.topic}
                    </h2>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                    className="bg-accent text-white p-4 rounded-2xl"
                  >
                    <p className="text-white/60 font-mono text-[10px] uppercase tracking-widest mb-1">
                      Focus
                    </p>
                    <h2 className="text-xl sm:text-2xl font-serif italic">
                      {challenge.focus}
                    </h2>
                  </motion.div>
                </div>

                <div className="space-y-6">
                  {/* Collapsible submission form */}
                  <AnimatePresence mode="wait">
                    {attemptsLeft > 0 ? (
                      <motion.div
                        key="pun-form"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-2xl border-2 border-accent-border bg-surface p-4 sm:p-5 space-y-3 overflow-hidden"
                      >
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
                          className="w-full p-4 text-lg font-serif italic bg-surface-muted text-text rounded-xl border-none focus:ring-2 focus:ring-accent-ring min-h-[80px] sm:min-h-[100px] resize-none"
                        />
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <p className="text-xs text-text-secondary">
                            {attemptsLeft} attempt
                            {attemptsLeft !== 1 ? "s" : ""} remaining &middot;
                            Ctrl+Enter to submit
                          </p>
                          <Button
                            onClick={handleSubmitPun}
                            disabled={!punText.trim() || submitting}
                            loading={submitting}
                          >
                            <Send className="w-4 h-4" />
                            Submit Pun
                          </Button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="no-attempts-message"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-2xl border-2 border-accent-border bg-surface p-4 sm:p-5 space-y-3 overflow-hidden"
                      >
                        <p className="text-text-secondary text-center">
                          You've used all your attempts for today.
                          <br />
                          Check back tomorrow!
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Best Submission + Leading Pun (merge when same) */}
                  {(bestPun || todayLeader) && (
                    <div
                      className={`grid gap-4 pt-4 border-t border-border ${
                        isBestAlsoLeader || (!bestPun || !todayLeader)
                          ? "grid-cols-1"
                          : "grid-cols-1 md:grid-cols-2"
                      }`}
                    >
                      {isBestAlsoLeader ? (
                        <div>
                          <h3 className="text-lg font-serif italic text-text mb-3">
                            Your Best &mdash; Leading Today
                          </h3>
                          <PunCard
                            pun={bestPun}
                            index={0}
                            comments={[]}
                            submitting={submitting}
                            hideAuthor={true}
                            disableComments={true}
                            onReact={() => {}}
                            onViewed={() => {}}
                            onEdit={() => {}}
                            onDelete={() => {}}
                            onComment={() => {}}
                          />
                        </div>
                      ) : (
                        <>
                          {bestPun && (
                            <div>
                              <h3 className="text-lg font-serif italic text-text mb-3">
                                Your Best Submission
                              </h3>
                              <PunCard
                                pun={bestPun}
                                index={0}
                                comments={[]}
                                submitting={submitting}
                                hideAuthor={true}
                                disableComments={true}
                                onReact={() => {}}
                                onViewed={() => {}}
                                onEdit={() => {}}
                                onDelete={() => {}}
                                onComment={() => {}}
                              />
                            </div>
                          )}
                          {todayLeader && (
                            <div>
                              <h3 className="text-lg font-serif italic text-text mb-3">
                                Leading Pun Today
                              </h3>
                              <PunCard
                                pun={
                                  {
                                    ...todayLeader,
                                    authorId: -1,
                                    aiFeedback: undefined,
                                    responseTimeMs: undefined,
                                    myReaction: null,
                                    updatedAt: todayLeader.createdAt,
                                  } as unknown as Pun
                                }
                                index={0}
                                comments={[]}
                                submitting={false}
                                disableComments={true}
                                onReact={() => {}}
                                onViewed={() => {}}
                                onEdit={() => {}}
                                onDelete={() => {}}
                                onComment={() => {}}
                              />
                            </div>
                          )}
                        </>
                      )}
                      {othersCount > 0 && (
                        <p className="text-xs text-text-secondary">
                          {othersCount} more submission
                          {othersCount !== 1 ? "s" : ""} &mdash;{" "}
                          <button
                            type="button"
                            onClick={onOpenSubmissions}
                            className="font-medium text-accent hover:underline"
                          >
                            view all in My Submissions
                          </button>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      {/* ── Section 2: Active Groups ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
              Active Groups
            </p>
            <span className="text-xs text-text-muted">
              {sessions.length} group{sessions.length !== 1 ? "s" : ""}{" "}
              &middot; {livePlayers} player{livePlayers !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="px-3 py-1.5 text-sm"
              onClick={() => {
                setInviteCode("");
                setJoinByIdError("");
                setShowJoinModal(true);
              }}
            >
              <LogIn className="w-3.5 h-3.5" />
              Join Code
            </Button>
            <Button
              className="px-3 py-1.5 text-sm"
              onClick={() => {
                setNewSessionName("");
                setShowCreateModal(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Create
            </Button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="text-text-secondary italic text-sm py-4">
            No active groups yet. Create one or join with an invite code.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessions.map((session) => (
              <motion.div
                key={session.id}
                className="bg-surface p-3 rounded-xl border border-border flex items-center justify-between cursor-pointer hover:border-accent-border hover:shadow-sm transition-all"
                onClick={() => onJoinSession(session)}
              >
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-text truncate">
                    {session.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Users className="w-3.5 h-3.5" />
                    {session.players.length} player
                    {session.players.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {session.ownerId === user?.uid && (
                    <Button
                      variant="ghost"
                      className="px-2 py-1.5 text-danger hover:bg-danger-subtle hover:text-danger"
                      onClick={(e) => {
                        e?.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="px-3 py-1.5 text-sm"
                    onClick={(e) => {
                      e?.stopPropagation();
                      onJoinSession(session);
                    }}
                  >
                    Open Group
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Group Modal ── */}
      <AnimatePresence>
        {showCreateModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-group-title"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowCreateModal(false)}
                className="absolute top-4 right-4 text-text-muted hover:text-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
              <h3
                id="create-group-title"
                className="text-xl font-serif italic text-text mb-4"
              >
                Create a Group
              </h3>
              <input
                type="text"
                placeholder="Group name (e.g., Friday Fun)"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent-ring transition-all mb-4"
              />
              <Button
                onClick={handleCreate}
                disabled={!newSessionName.trim()}
                loading={loading}
                className="w-full"
              >
                <Plus className="w-4 h-4" />
                Create Group
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Join via Code Modal ── */}
      <AnimatePresence>
        {showJoinModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
            onClick={() => setShowJoinModal(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="join-group-title"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowJoinModal(false)}
                className="absolute top-4 right-4 text-text-muted hover:text-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
              <h3
                id="join-group-title"
                className="text-xl font-serif italic text-text mb-4"
              >
                Join via Invite Code
              </h3>
              <input
                type="text"
                placeholder="Paste invite code..."
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value);
                  setJoinByIdError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleJoinById()}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent-ring transition-all mb-2"
              />
              {joinByIdError && (
                <p className="text-xs text-danger mb-2">{joinByIdError}</p>
              )}
              <Button
                onClick={handleJoinById}
                disabled={!inviteCode.trim()}
                loading={joiningById}
                className="w-full mt-2"
              >
                <LogIn className="w-4 h-4" />
                Join Group
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
