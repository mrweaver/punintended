import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, QrCode, RefreshCw, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePuns } from '../hooks/usePuns';
import { useMessages } from '../hooks/useMessages';
import { useComments } from '../hooks/useComments';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { PunCard } from './PunCard';
import { ChatBox } from './ChatBox';
import { ShareModal } from './modals/ShareModal';
import { DeleteConfirmModal } from './modals/DeleteConfirmModal';
import type { Session } from '../api/client';

interface GameBoardProps {
  session: Session;
  loading: boolean;
  onLeave: () => void;
  onDelete: (sessionId: string) => Promise<void>;
  onRefreshChallenge: () => Promise<void>;
}

export function GameBoard({
  session,
  loading,
  onLeave,
  onDelete,
  onRefreshChallenge,
}: GameBoardProps) {
  const { user } = useAuth();
  const todayId = useMemo(() => new Date().toISOString().split('T')[0], []);
  const {
    groupedPuns,
    sortMode,
    setSortMode,
    submitting,
    submitPun,
    editPun,
    deletePun,
    reactPun,
    markPunViewed,
  } = usePuns(
    session.id,
    todayId,
    user?.uid
  );
  const { messages, sendMessage } = useMessages(session.id);
  const { addComment, getCommentsForPun } = useComments(session.id);
  const [punText, setPunText] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [expandedAuthors, setExpandedAuthors] = useState<Record<number, boolean>>({});

  const handleSubmitPun = async () => {
    if (!punText.trim()) return;
    try {
      await submitPun(punText.trim());
      setPunText('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit pun';
      alert(message);
    }
  };

  const isOwner = session.ownerId === user?.uid;

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
        <h2 className="text-2xl font-serif italic text-gray-500 dark:text-zinc-400">
          Today's Challenge
        </h2>
        {isOwner && (
          <Button
            variant="outline"
            onClick={onRefreshChallenge}
            className="text-xs px-3 py-2"
            loading={loading}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Cards
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div
          whileHover={{ rotate: -1 }}
          className="bg-zinc-900 dark:bg-zinc-800 text-white p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] relative overflow-hidden group border border-transparent dark:border-zinc-700"
        >
          <div className="absolute top-2 right-4 sm:top-4 text-white/20 font-serif italic text-4xl sm:text-6xl">
            01
          </div>
          <p className="text-orange-500 dark:text-violet-400 font-mono text-[10px] sm:text-xs uppercase tracking-widest mb-1 sm:mb-2">
            Topic
          </p>
          <h2 className="text-3xl sm:text-5xl font-serif italic">
            {session.challenge?.topic ||
              (isOwner ? 'Generating...' : 'Waiting for Host...')}
          </h2>
        </motion.div>
        <motion.div
          whileHover={{ rotate: 1 }}
          className="bg-orange-500 dark:bg-violet-600 text-white p-6 sm:p-8 rounded-2xl sm:rounded-[2rem] relative overflow-hidden group border border-transparent dark:border-violet-500"
        >
          <div className="absolute top-2 right-4 sm:top-4 text-white/20 font-serif italic text-4xl sm:text-6xl">
            02
          </div>
          <p className="text-white/60 font-mono text-[10px] sm:text-xs uppercase tracking-widest mb-1 sm:mb-2">
            Focus
          </p>
          <h2 className="text-3xl sm:text-5xl font-serif italic">
            {session.challenge?.focus ||
              (isOwner ? 'Generating...' : 'Waiting for Host...')}
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
            className="w-full p-4 sm:p-6 text-lg sm:text-xl font-serif italic bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 rounded-xl sm:rounded-2xl border-none focus:ring-2 focus:ring-orange-500 dark:focus:ring-violet-500 min-h-[100px] sm:min-h-[120px] resize-none"
          />
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <p className="text-sm text-gray-500 dark:text-zinc-400 italic">
              Tip: Combine {session.challenge?.topic} and {session.challenge?.focus} for maximum
              points!
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
            <h2 className="text-2xl sm:text-3xl font-serif italic flex items-center gap-3 dark:text-zinc-100">
              <Trophy className="text-orange-500 dark:text-violet-500" />
              Grouped Pun Board
            </h2>
            <div className="flex flex-wrap gap-2">
              {(['unviewed', 'top', 'new'] as const).map((mode) => (
                <Button
                  key={mode}
                  variant={sortMode === mode ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setSortMode(mode)}
                >
                  {mode === 'unviewed' ? 'Unviewed' : mode === 'top' ? 'Top' : 'New'}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 flex-1">
            {groupedPuns.length === 0 ? (
              <div className="text-center py-8 sm:py-12 bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-dashed border-gray-300 dark:border-zinc-800">
                <p className="text-gray-400 dark:text-zinc-500 italic">
                  No puns submitted yet. Be the first to break the ice!
                </p>
              </div>
            ) : (
              groupedPuns.map((group, groupIndex) => {
                const isExpanded = expandedAuthors[group.authorId] ?? group.unviewedCount > 0;
                const bestScore = Math.max(...group.puns.map((p) => p.aiScore || 0));
                const totalReacts = group.puns.reduce((sum, p) => sum + p.reactionTotal, 0);
                return (
                  <div
                    key={group.authorId}
                    className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl border border-gray-100 dark:border-zinc-800 overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedAuthors((prev) => ({
                          ...prev,
                          [group.authorId]: !isExpanded,
                        }))
                      }
                      className="w-full px-4 py-4 sm:px-6 sm:py-5 flex items-center justify-between gap-4 text-left bg-gray-50/50 dark:bg-zinc-800/30 transition-colors hover:bg-gray-100/50 dark:hover:bg-zinc-800/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={group.authorPhoto || ''}
                          alt={group.authorName}
                          className="w-10 h-10 rounded-full border border-gray-200 dark:border-zinc-700"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-zinc-100 truncate">
                            {group.authorName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-zinc-400">
                            {group.puns.length} puns
                            {group.unviewedCount > 0 && (
                              <span className="text-amber-600 dark:text-violet-400 font-semibold"> · {group.unviewedCount} new</span>
                            )}
                            {bestScore > 0 && <span> · Best: {bestScore}/10</span>}
                            {totalReacts > 0 && <span> · {totalReacts} reacts</span>}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-zinc-400">
                        {isExpanded ? 'Hide' : 'Show'}
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 sm:px-6 sm:pb-6 pt-2 grid grid-cols-1 gap-4 sm:gap-6">
                            {group.puns.map((pun, punIndex) => (
                              <PunCard
                                key={pun.id}
                                pun={pun}
                                index={groupIndex + punIndex * 0.1}
                                comments={getCommentsForPun(pun.id)}
                                submitting={submitting}
                                onReact={reactPun}
                                onViewed={markPunViewed}
                                onEdit={editPun}
                                onDelete={deletePun}
                                onComment={addComment}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <ChatBox messages={messages} onSendMessage={sendMessage} />
      </div>

      {/* Modals */}
      {showShareModal && (
        <ShareModal session={session} onClose={() => setShowShareModal(false)} />
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
