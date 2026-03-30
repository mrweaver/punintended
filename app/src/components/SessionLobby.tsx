import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Users, Trash2, Swords, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import type { Session } from '../api/client';

interface SessionLobbyProps {
  sessions: Session[];
  loading: boolean;
  onCreateSession: (name: string) => Promise<void>;
  onJoinSession: (session: Session) => void;
  onJoinById: (id: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => void;
  onStartGauntlet: () => void;
}

export function SessionLobby({
  sessions,
  loading,
  onCreateSession,
  onJoinSession,
  onJoinById,
  onDeleteSession,
  onStartGauntlet,
}: SessionLobbyProps) {
  const { user } = useAuth();
  const [newSessionName, setNewSessionName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joiningById, setJoiningById] = useState(false);
  const [joinByIdError, setJoinByIdError] = useState('');

  const handleCreate = async () => {
    if (!newSessionName.trim()) return;
    await onCreateSession(newSessionName.trim());
    setNewSessionName('');
  };

  const handleJoinById = async () => {
    const code = inviteCode.trim();
    if (!code) return;
    setJoiningById(true);
    setJoinByIdError('');
    try {
      await onJoinById(code);
      setInviteCode('');
    } catch {
      setJoinByIdError('Group not found. Check the code and try again.');
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
      {/* Primary row: Join (left) + Create (right) — equal weight */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Join a Group */}
        <Card className="flex flex-col gap-4">
          <h2 className="text-2xl sm:text-3xl font-serif italic dark:text-zinc-100">
            Join a Group
          </h2>

          {/* Inline invite code entry */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter invite code..."
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value);
                setJoinByIdError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinById()}
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
          {joinByIdError && (
            <p className="text-xs text-red-500 dark:text-red-400 -mt-2">{joinByIdError}</p>
          )}

          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-zinc-600">
            <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
            or browse open groups
            <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-800" />
          </div>

          {/* Scrollable session list */}
          <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[40vh] pr-1">
            {sessions.length === 0 ? (
              <p className="text-gray-500 dark:text-zinc-500 italic text-sm">
                No active groups. Create one to get started!
              </p>
            ) : (
              sessions.map((session) => (
                <motion.div
                  key={session.id}
                  className="bg-gray-50 dark:bg-zinc-900 p-3 rounded-xl border border-gray-100 dark:border-zinc-800 flex items-center justify-between cursor-pointer hover:border-orange-200 dark:hover:border-violet-500 hover:shadow-sm transition-all"
                  onClick={() => onJoinSession(session)}
                >
                  <div>
                    <h3 className="font-bold text-base dark:text-zinc-100">{session.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400">
                      <Users className="w-3.5 h-3.5" />
                      {session.players.length} players
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
        </Card>

        {/* Start a New Game */}
        <Card className="flex flex-col justify-center">
          <h2 className="text-2xl sm:text-3xl font-serif italic mb-4 sm:mb-6 dark:text-zinc-100">
            Start a New Game
          </h2>
          <div className="space-y-3 sm:space-y-4">
            <input
              type="text"
              placeholder="Group Name (e.g., Friday Fun)"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="w-full px-4 py-3 sm:px-6 sm:py-4 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:focus:ring-violet-500 transition-all"
            />
            <Button
              onClick={handleCreate}
              className="w-full"
              disabled={!newSessionName.trim()}
              loading={loading}
            >
              <Plus className="w-5 h-5" />
              Create Group
            </Button>
          </div>
        </Card>
      </div>

      {/* Secondary: Gauntlet strip */}
      <Card className="border border-amber-100 dark:border-violet-800/30 bg-amber-50/50 dark:bg-violet-950/20">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="shrink-0 p-2 rounded-xl bg-orange-100 dark:bg-violet-900/30">
            <Swords className="w-5 h-5 text-orange-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-500 dark:text-violet-400 mb-0.5">
              Solo Mode
            </p>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              <span className="font-semibold text-gray-700 dark:text-zinc-300">The Gauntlet</span>
              {' — '}5 rounds. 60 seconds each. AI-judged. Share your score and challenge your mates.
            </p>
          </div>
          <Button onClick={onStartGauntlet} variant="outline" size="sm" className="w-full sm:w-auto shrink-0">
            Play The Gauntlet
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
