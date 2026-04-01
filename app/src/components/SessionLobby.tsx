import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Plus,
  Users,
  Trash2,
  Swords,
  LogIn,
  Trophy,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useGlobalLeaderboard } from "../hooks/useGlobalLeaderboard";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import type { Group } from "../api/client";

function truncateCopy(text: string, maxLength = 88) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function DashboardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 px-4 py-3 min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
        {value}
      </p>
    </div>
  );
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
    <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/60 p-4 sm:p-5 space-y-2 min-h-[168px]">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-orange-500 dark:text-violet-400">
        {eyebrow}
      </p>
      <p className="font-serif italic text-lg text-zinc-900 dark:text-zinc-100 leading-snug">
        {title}
      </p>
      <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
        {detail}
      </p>
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
}: SessionLobbyProps) {
  const { user } = useAuth();
  const {
    daily,
    allTime,
    gauntlet,
    loading: leaderboardLoading,
  } = useGlobalLeaderboard();
  const [newSessionName, setNewSessionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joiningById, setJoiningById] = useState(false);
  const [joinByIdError, setJoinByIdError] = useState("");

  const livePlayers = useMemo(
    () => sessions.reduce((sum, session) => sum + session.players.length, 0),
    [sessions],
  );

  const gauntletLeader = gauntlet[0];
  const todayLeader = daily?.puns[0] ?? null;
  const hallOfFameLeader = allTime[0] ?? null;

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
      className="space-y-8"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-orange-500 dark:text-violet-400">
            Play Hub
          </p>
          <h1 className="text-3xl sm:text-5xl font-serif italic text-zinc-900 dark:text-zinc-100">
            Choose how you want to play.
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-zinc-400 leading-relaxed">
            Start a multiplayer group for the daily challenge, jump into an open
            room, or run a solo gauntlet you can share later for score-chasing
            rematches.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:min-w-[360px]">
          <DashboardStat label="Open groups" value={`${sessions.length}`} />
          <DashboardStat label="Players live" value={`${livePlayers}`} />
          <DashboardStat
            label="Top gauntlet"
            value={
              gauntletLeader?.myScore
                ? `${gauntletLeader.myScore.toLocaleString()} pts`
                : "Waiting"
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6 items-start">
        <Card className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 p-3 rounded-2xl bg-orange-100 dark:bg-violet-900/30">
              <Users className="w-6 h-6 text-orange-600 dark:text-violet-400" />
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-orange-500 dark:text-violet-400">
                Multiplayer
              </p>
              <h2 className="text-2xl sm:text-3xl font-serif italic dark:text-zinc-100">
                Create or join a group
              </h2>
              <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
                Spin up a room for today&apos;s challenge, invite friends, or
                drop into any open group that is already riffing.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
              Start a room
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Group Name (e.g., Friday Fun)"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="flex-1 px-4 py-3 sm:px-6 sm:py-4 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:focus:ring-violet-500 transition-all"
              />
              <Button
                onClick={handleCreate}
                className="sm:min-w-[180px]"
                disabled={!newSessionName.trim()}
                loading={loading}
              >
                <Plus className="w-5 h-5" />
                Create Group
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-4">
            <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/60 p-4 space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                Join by invite link or code
              </p>
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
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 dark:focus:ring-violet-500 transition-all"
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
              {joinByIdError ? (
                <p className="text-xs text-red-500 dark:text-red-400">
                  {joinByIdError}
                </p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-zinc-500 leading-relaxed">
                  Invite links still land here. Paste the code if someone sends
                  it directly.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                  Open groups
                </p>
                <span className="text-xs text-gray-400 dark:text-zinc-500">
                  {sessions.length} live
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[36vh] pr-1">
                {sessions.length === 0 ? (
                  <p className="text-gray-500 dark:text-zinc-500 italic text-sm">
                    No active groups right now. Start one and set the tone.
                  </p>
                ) : (
                  sessions.map((session) => (
                    <motion.div
                      key={session.id}
                      className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-gray-100 dark:border-zinc-800 flex items-center justify-between cursor-pointer hover:border-orange-200 dark:hover:border-violet-500 hover:shadow-sm transition-all"
                      onClick={() => onJoinSession(session)}
                    >
                      <div className="min-w-0">
                        <h3 className="font-bold text-base dark:text-zinc-100 truncate">
                          {session.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400">
                          <Users className="w-3.5 h-3.5" />
                          {session.players.length} players
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {session.ownerId === user?.uid && (
                          <Button
                            variant="ghost"
                            className="px-2 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
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
                          Join
                        </Button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex h-full flex-col gap-6 border border-amber-100 dark:border-violet-800/30 bg-amber-50/60 dark:bg-violet-950/20">
          <div className="flex items-start gap-4">
            <div className="shrink-0 p-3 rounded-2xl bg-orange-100 dark:bg-violet-900/30">
              <Swords className="w-6 h-6 text-orange-600 dark:text-violet-400" />
            </div>
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-orange-500 dark:text-violet-400">
                Solo Mode
              </p>
              <h2 className="text-2xl sm:text-3xl font-serif italic dark:text-zinc-100">
                The Gauntlet
              </h2>
              <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
                Five timed rounds. AI-judged scoring. Perfect for solo runs,
                remote dares, and sharing a finished challenge for others to
                replay later.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-amber-200/70 dark:border-violet-800/40 bg-white/70 dark:bg-zinc-950/40 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                Rounds
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                5 x 60s
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200/70 dark:border-violet-800/40 bg-white/70 dark:bg-zinc-950/40 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                Judging
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                AI scored
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200/70 dark:border-violet-800/40 bg-white/70 dark:bg-zinc-950/40 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gray-400 dark:text-zinc-500">
                Afterward
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Share & compare
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-amber-200 dark:border-violet-800/40 bg-white/70 dark:bg-zinc-950/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-orange-600 dark:text-violet-400">
              <Sparkles className="w-4 h-4" />
              <p className="font-medium text-sm">
                Best when the group is not in the same room
              </p>
            </div>
            <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
              Finish a run, send the link, and let everyone take on the exact
              same prompts on their own time before comparing receipts.
            </p>
          </div>

          <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              onClick={onStartGauntlet}
              variant="outline"
              className="w-full sm:flex-1"
            >
              <Swords className="w-4 h-4" />
              Play The Gauntlet
            </Button>
            <p className="text-xs text-gray-500 dark:text-zinc-500 sm:flex-1">
              Completed runs now have a dedicated share flow for retroactive
              challenges.
            </p>
          </div>
        </Card>
      </div>

      <Card className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-orange-500 dark:text-violet-400">
              Community Pulse
            </p>
            <h2 className="text-2xl sm:text-3xl font-serif italic dark:text-zinc-100">
              Keep the wider room in view
            </h2>
            <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
              A quick read on what is landing today, what has lasting groan
              power, and the gauntlet score currently setting the pace.
            </p>
          </div>
          <Button
            onClick={onOpenLeaderboard}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            <Trophy className="w-4 h-4" />
            Open Leaderboards
          </Button>
        </div>

        {leaderboardLoading ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 px-4 py-8 text-center text-sm text-gray-500 dark:text-zinc-500">
            Loading the latest leaderboard pulse...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CommunityPreviewTile
              eyebrow="Today"
              title={
                todayLeader
                  ? `"${truncateCopy(todayLeader.text)}"`
                  : "No scored puns yet."
              }
              detail={
                todayLeader
                  ? `${todayLeader.authorName} is leading the day at ${todayLeader.aiScore}/10.`
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
                  ? `${hallOfFameLeader.authorName} is sitting on ${hallOfFameLeader.groanCount} groans.`
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
      </Card>
    </motion.div>
  );
}
