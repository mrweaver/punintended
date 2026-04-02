import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Users,
  Trash2,
  Swords,
  LogIn,
  Trophy,
  ChevronDown,
  ChevronUp,
  Send,
  Eye,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  formatElapsedTime,
  formatRevealTime,
  useChallengeReveal,
} from "../hooks/useChallengeReveal";
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

function truncateCopy(text: string, maxLength = 88) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function CommunityPreviewTile({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-muted p-4 sm:p-5 space-y-2 min-h-[168px]">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
        {eyebrow}
      </p>
      <p className="font-serif italic text-lg text-text leading-snug">
        {title}
      </p>
      <p className="text-sm text-text-secondary leading-relaxed">{detail}</p>
    </div>
  );
}

interface SessionLobbyProps {
  sessions: Group[];
  loading: boolean;
  onCreateSession: (name: string) => Promise<void>;
  onJoinSession: (session: Group) => void;
  onJoinById: (id: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => void;
  onStartGauntlet: () => void;
  onOpenLeaderboard: () => void;
  onOpenSubmissions: () => void;
}

export function SessionLobby({
  sessions,
  loading,
  onCreateSession,
  onJoinSession,
  onJoinById,
  onDeleteSession,
  onStartGauntlet,
  onOpenLeaderboard,
  onOpenSubmissions,
}: SessionLobbyProps) {
  const { user } = useAuth();
  const {
    daily,
    allTime,
    gauntlet,
    loading: leaderboardLoading,
  } = useGlobalLeaderboard();

  // ── Group / invite state ──
  const [newSessionName, setNewSessionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joiningById, setJoiningById] = useState(false);
  const [joinByIdError, setJoinByIdError] = useState("");
  const [showInviteCode, setShowInviteCode] = useState(false);

  // ── Daily challenge + reveal state ──
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const todayId = useMemo(() => new Date().toLocaleDateString("en-CA"), []);

  useEffect(() => {
    dailyApi.getChallenge(todayId).then(setChallenge).catch(console.error);
  }, [todayId]);

  const { revealedAt, isRevealed, elapsedMs, revealChallenge } =
    useChallengeReveal(challenge?.challengeId);

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

  const gauntletLeader = gauntlet[0];
  const todayLeader = daily?.puns[0] ?? null;
  const hallOfFameLeader = allTime[0] ?? null;

  // ── Group handlers ──
  const handleCreate = async () => {
    if (!newSessionName.trim()) return;
    await onCreateSession(newSessionName.trim());
    setNewSessionName("");
  };

  const handleJoinById = async () => {
    const code = inviteCode.trim();
    if (!code) return;
    setJoiningById(true);
    setJoinByIdError("");
    try {
      await onJoinById(code);
      setInviteCode("");
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
                        {formatElapsedTime(elapsedMs)}
                      </span>
                    </span>
                  </div>
                )}

                {/* Topic + Focus cards */}
                <div className="grid grid-cols-2 gap-4 sm:gap-6">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    whileHover={{ rotate: -1 }}
                    className="bg-surface-inverse text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] relative overflow-hidden"
                  >
                    <p className="text-accent font-mono text-[10px] sm:text-xs uppercase tracking-widest mb-1 sm:mb-2">
                      Topic
                    </p>
                    <h2 className="text-2xl sm:text-4xl font-serif italic">
                      {challenge.topic}
                    </h2>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                    whileHover={{ rotate: 1 }}
                    className="bg-accent text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] relative overflow-hidden"
                  >
                    <p className="text-white/60 font-mono text-[10px] sm:text-xs uppercase tracking-widest mb-1 sm:mb-2">
                      Focus
                    </p>
                    <h2 className="text-2xl sm:text-4xl font-serif italic">
                      {challenge.focus}
                    </h2>
                  </motion.div>
                </div>

                <div className="space-y-6">
                  {/* Collapsible submission form */}
                  <AnimatePresence>
                    {attemptsLeft > 0 && (
                      <motion.div
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
                    )}{" "}
                    :{" "}
                    {
                      <motion.div
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
                    }
                  </AnimatePresence>

                  {/* Render submitted puns using PunCard */}
                  {myPuns.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-4 pt-4 border-t border-border"
                    >
                      <h3 className="text-xl sm:text-2xl font-serif italic text-text">
                        Your Submissions Today
                      </h3>
                      <div className="grid gap-4">
                        <AnimatePresence initial={false}>
                          {myPuns.map((pun, index) => (
                            <motion.div
                              key={pun.id || index}
                              initial={{
                                opacity: 0,
                                height: 0,
                                scale: 0.95,
                                marginTop: -12,
                              }}
                              animate={{
                                opacity: 1,
                                height: "auto",
                                scale: 1,
                                marginTop: 0,
                              }}
                              exit={{
                                opacity: 0,
                                height: 0,
                                scale: 0.95,
                                marginTop: -12,
                              }}
                              transition={{ duration: 0.25, ease: "easeOut" }}
                              className="origin-top overflow-hidden rounded-2xl"
                            >
                              <PunCard
                                pun={pun}
                                index={index}
                                comments={[]}
                                submitting={submitting}
                                hideAuthor={true}
                                disableComments={true}
                                onReact={(punId, reaction) => {}}
                                onViewed={() => {}}
                                onEdit={(punId, text) => {}}
                                onDelete={(punId) => {}}
                                onComment={() => {}}
                              />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}

                  {/* Today's leader preview using PunCard */}
                  {todayLeader && (
                    <div className="space-y-4 pt-4 border-t border-border">
                      <h3 className="text-xl sm:text-2xl font-serif italic text-text">
                        Leading Pun Today
                      </h3>
                      <PunCard
                        // Use double assertion to force the UI mapping
                        pun={
                          {
                            ...todayLeader,
                            authorId: -1, // Or "", whatever satisfies the visual render
                            aiFeedback: undefined,
                            responseTimeMs: undefined,
                            myReaction: null,
                            updatedAt: todayLeader.createdAt,
                          } as unknown as Pun
                        }
                        index={0}
                        comments={[]}
                        submitting={false}
                        disableComments={true} // Keeps the lobby clean of comments
                        onReact={(punId, reaction) => {
                          /* Global react handler */
                        }}
                        onViewed={() => {}}
                        onEdit={() => {}}
                        onDelete={() => {}}
                        onComment={() => {}}
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>

      {/* ── Section 2: Quick Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
        <Card className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Group name (e.g., Friday Fun)"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="flex-1 px-4 py-3 rounded-xl border border-border-strong bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent-ring transition-all"
            />
            <Button
              onClick={handleCreate}
              disabled={!newSessionName.trim()}
              loading={loading}
            >
              <Plus className="w-4 h-4" />
              Create Group
            </Button>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowInviteCode((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors"
            >
              {showInviteCode ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              Have an invite code?
            </button>

            <AnimatePresence>
              {showInviteCode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-2 overflow-hidden"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Paste invite code..."
                      value={inviteCode}
                      onChange={(e) => {
                        setInviteCode(e.target.value);
                        setJoinByIdError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleJoinById()}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-border-strong bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent-ring transition-all"
                    />
                    <Button
                      onClick={handleJoinById}
                      disabled={!inviteCode.trim()}
                      loading={joiningById}
                      className="shrink-0"
                    >
                      <LogIn className="w-4 h-4" />
                      Join
                    </Button>
                  </div>
                  {joinByIdError && (
                    <p className="text-xs text-danger">{joinByIdError}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>

        <div className="flex flex-row lg:flex-col gap-3">
          <Button
            onClick={onOpenSubmissions}
            variant="outline"
            className="flex-1 lg:flex-none"
          >
            My Submissions
          </Button>
          <Button
            onClick={onStartGauntlet}
            variant="outline"
            className="flex-1 lg:flex-none"
          >
            <Swords className="w-4 h-4" />
            Solo Gauntlet
          </Button>
          <Button
            onClick={onOpenLeaderboard}
            variant="outline"
            className="flex-1 lg:flex-none"
          >
            <Trophy className="w-4 h-4" />
            Leaderboards
          </Button>
        </div>
      </div>

      {/* ── Section 3: Community Pulse ── */}
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
            Community Pulse
          </p>
          <h2 className="text-2xl sm:text-3xl font-serif italic text-text">
            What&apos;s landing right now
          </h2>
        </div>

        {leaderboardLoading ? (
          <div className="rounded-2xl border border-dashed border-border-dashed px-4 py-8 text-center text-sm text-text-secondary">
            Loading the latest leaderboard pulse&hellip;
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CommunityPreviewTile
              eyebrow="Today"
              title={
                !isRevealed
                  ? "Today's board stays sealed."
                  : todayLeader
                    ? `"${truncateCopy(todayLeader.text)}"`
                    : "No scored puns yet."
              }
              detail={
                !isRevealed
                  ? "Reveal today's challenge before you peek at the live board. Hall of fame and gauntlet updates stay visible without spoiling the current brief."
                  : todayLeader
                    ? `${todayLeader.authorName} is leading the day at ${todayLeader.aiScore}/10.${todayLeader.challengeTopic ? ` Topic: ${todayLeader.challengeTopic}${todayLeader.challengeFocus ? ` · ${todayLeader.challengeFocus}` : ""}` : ""}`
                    : "The daily board will fill in as soon as the first strong pun lands."
              }
            />
            <CommunityPreviewTile
              eyebrow="Hall Of Fame"
              title={
                hallOfFameLeader
                  ? `"${truncateCopy(hallOfFameLeader.text, 72)}"`
                  : "No all-time leader yet."
              }
              detail={
                hallOfFameLeader
                  ? `${hallOfFameLeader.authorName} is sitting on ${hallOfFameLeader.groanCount} groans.${hallOfFameLeader.challengeTopic ? ` Topic: ${hallOfFameLeader.challengeTopic}` : ""}`
                  : "Once the greats start piling up, the hall of fame will surface here."
              }
            />
            <CommunityPreviewTile
              eyebrow="Gauntlet"
              title={
                gauntletLeader?.myScore
                  ? `${gauntletLeader.myScore.toLocaleString()} points`
                  : "No gauntlet score posted yet."
              }
              detail={
                gauntletLeader?.myScore
                  ? `${gauntletLeader.participants.length} player${gauntletLeader.participants.length === 1 ? "" : "s"} on ${new Date(
                      gauntletLeader.createdAt,
                    ).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}.`
                  : "The first completed gauntlet will set the benchmark here."
              }
            />
          </div>
        )}
      </div>

      {/* ── Section 4: Active Groups ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
            Active Groups
          </p>
          <span className="text-xs text-text-muted">
            {sessions.length} group{sessions.length !== 1 ? "s" : ""} &middot;{" "}
            {livePlayers} player{livePlayers !== 1 ? "s" : ""}
          </span>
        </div>

        {sessions.length === 0 ? (
          <p className="text-text-secondary italic text-sm py-4">
            No active groups right now. Create one above to get started.
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
    </motion.div>
  );
}
