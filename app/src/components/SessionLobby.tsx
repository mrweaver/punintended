import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Users, Trash2, Swords } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import type { Session } from '../api/client';

interface SessionLobbyProps {
  sessions: Session[];
  loading: boolean;
  onCreateSession: (name: string) => Promise<void>;
  onJoinSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onStartGauntlet: () => void;
}

export function SessionLobby({
  sessions,
  loading,
  onCreateSession,
  onJoinSession,
  onDeleteSession,
  onStartGauntlet,
}: SessionLobbyProps) {
  const { user } = useAuth();
  const [newSessionName, setNewSessionName] = useState('');

  const handleCreate = async () => {
    if (!newSessionName.trim()) return;
    await onCreateSession(newSessionName.trim());
    setNewSessionName('');
  };

  return (
    <motion.div
      key="landing"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="grid grid-cols-1 md:grid-cols-2 gap-8"
    >
      {/* Gauntlet CTA */}
      <Card className="col-span-1 md:col-span-2 border-2 border-amber-200 dark:border-violet-700/50 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-violet-950/50 dark:to-zinc-900">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-shrink-0 p-3 rounded-2xl bg-orange-100 dark:bg-violet-900/30">
            <Swords className="w-8 h-8 text-orange-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-mono text-xs uppercase tracking-widest text-orange-500 dark:text-violet-400 mb-1">
              Solo Mode
            </p>
            <h2 className="text-2xl sm:text-3xl font-serif italic mb-1 dark:text-zinc-100">
              The Gauntlet
            </h2>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              5 rounds. 60 seconds each. AI-judged. Share your score and challenge your mates.
            </p>
          </div>
          <Button onClick={onStartGauntlet} variant="outline" className="w-full sm:w-auto shrink-0">
            Play The Gauntlet
          </Button>
        </div>
      </Card>
      {/* Create Session */}
      <Card className="flex flex-col justify-center">
        <h2 className="text-2xl sm:text-3xl font-serif italic mb-4 sm:mb-6 dark:text-zinc-100">
          Start a New Game
        </h2>
        <div className="space-y-3 sm:space-y-4">
          <input
            type="text"
            placeholder="Session Name (e.g., Friday Fun)"
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
            Create Session
          </Button>
        </div>
      </Card>

      {/* Join Session */}
      <div className="space-y-4 sm:space-y-6">
        <h2 className="text-2xl sm:text-3xl font-serif italic dark:text-zinc-100">
          Join a Session
        </h2>
        <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[60vh] pr-2">
          {sessions.length === 0 ? (
            <p className="text-gray-500 dark:text-zinc-500 italic">
              No active sessions. Create one to get started!
            </p>
          ) : (
            sessions.map((session) => (
              <motion.div
                key={session.id}
                className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm flex items-center justify-between cursor-pointer hover:border-orange-200 dark:hover:border-violet-500 hover:shadow-md transition-all"
                onClick={() => onJoinSession(session)}
              >
                <div>
                  <h3 className="font-bold text-lg dark:text-zinc-100">{session.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400">
                    <Users className="w-4 h-4" />
                    {session.players.length} players
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {session.ownerId === user?.uid && (
                    <Button
                      variant="ghost"
                      className="px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                      onClick={(e) => {
                        e?.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="px-4 py-2 text-sm"
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
    </motion.div>
  );
}
