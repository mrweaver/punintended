import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Trophy,
  MessageCircle,
  Share2,
} from "lucide-react";
import {
  gauntletApi,
  type GauntletComparison,
  type GauntletComment,
  type GauntletMessage,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useLongPress } from "../hooks/useLongPress";
import {
  ReactionPicker,
  ReactionSummary,
  type MessageReaction,
} from "./ReactionPicker";
import { ShareModal } from "./modals/ShareModal";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface GauntletComparisonProps {
  gauntletId: string;
  onBack: () => void;
}

function Avatar({
  src,
  name,
  size = "sm",
}: {
  src: string;
  name: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "w-6 h-6" : "w-8 h-8";
  return src ? (
    <img
      src={src}
      alt={name}
      className={`${dim} rounded-full object-cover shrink-0`}
    />
  ) : (
    <div
      className={`${dim} rounded-full bg-orange-200 dark:bg-violet-800 flex items-center justify-center text-xs font-bold shrink-0`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function CommentThread({
  comments,
  gauntletId,
  runId,
  roundIndex,
  onCommentAdded,
}: {
  comments: GauntletComment[];
  gauntletId: string;
  runId: string;
  roundIndex: number;
  onCommentAdded: (c: GauntletComment) => void;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  const threadComments = comments.filter(
    (c) => c.runId === runId && c.roundIndex === roundIndex,
  );

  async function handleSubmit() {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const comment = await gauntletApi.addComment(
        gauntletId,
        runId,
        roundIndex,
        text,
      );
      onCommentAdded(comment);
      setDraft("");
    } catch {
      // silently ignore
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500 hover:text-orange-500 dark:hover:text-violet-400 transition-colors"
      >
        <MessageSquare className="w-3 h-3" />
        {threadComments.length > 0
          ? `${threadComments.length} comment${threadComments.length !== 1 ? "s" : ""}`
          : "Add comment"}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {threadComments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar src={c.authorPhoto} name={c.authorName} />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {c.authorName}
                </span>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 break-words">
                  {c.text}
                </p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Say something..."
              maxLength={280}
              className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:focus:ring-violet-500"
            />
            <button
              onClick={handleSubmit}
              disabled={!draft.trim() || submitting}
              className="p-1.5 rounded-lg text-orange-500 dark:text-violet-400 hover:bg-orange-50 dark:hover:bg-violet-900/30 disabled:opacity-40 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function GauntletComparison({
  gauntletId,
  onBack,
}: GauntletComparisonProps) {
  const { user } = useAuth();
  const [data, setData] = useState<GauntletComparison | null>(null);
  const [comments, setComments] = useState<GauntletComment[]>([]);
  const [messages, setMessages] = useState<GauntletMessage[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      gauntletApi.comparison(gauntletId),
      gauntletApi.getComments(gauntletId),
      gauntletApi.getMessages(gauntletId),
    ])
      .then(([comp, cmts, msgs]) => {
        setData(comp);
        setComments(cmts);
        setMessages(msgs);
      })
      .catch((err) => setError(err.message ?? "Failed to load comparison"))
      .finally(() => setLoading(false));

    const onFocus = () => {
      gauntletApi
        .getMessages(gauntletId)
        .then(setMessages)
        .catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [gauntletId]);

  if (loading) {
    return (
      <Card className="text-center py-16 text-gray-400 dark:text-zinc-500">
        Loading comparison...
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="text-center py-16 space-y-4">
        <p className="text-red-500">{error ?? "Not found"}</p>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </Card>
    );
  }

  if (data.runs.length === 0) {
    return (
      <Card className="text-center py-16 space-y-4">
        <p className="text-gray-400 dark:text-zinc-500">
          No completed runs yet — share the link so others can take the
          challenge!
        </p>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-orange-500 dark:text-violet-400">
              Comparison
            </p>
            <h2 className="text-2xl font-serif italic dark:text-zinc-100">
              The Gauntlet
            </h2>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowShareModal(true)}
        >
          <Share2 className="w-4 h-4" />
          Share Challenge
        </Button>
      </div>

      {/* Score summary */}
      <Card className="flex flex-wrap gap-4">
        {data.runs.map((run, i) => {
          const isWinner = i === 0 && data.runs.length > 1;
          return (
            <div
              key={run.id}
              className={`flex items-center gap-2 min-w-0 rounded-xl px-3 py-2 transition-colors ${
                isWinner
                  ? "bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-300 dark:ring-amber-600"
                  : ""
              }`}
            >
              {i > 0 && (
                <span className="text-zinc-300 dark:text-zinc-600 hidden sm:block">
                  vs
                </span>
              )}
              <Avatar src={run.playerPhoto} name={run.playerName} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate dark:text-zinc-200">
                    {run.playerId === user?.uid ? "You" : run.playerName}
                  </p>
                  {isWinner && (
                    <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                </div>
                <p className="text-lg font-mono font-bold text-orange-600 dark:text-violet-400">
                  {(run.totalScore ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Round-by-round */}
      {data.rounds.map((prompt, roundIdx) => (
        <motion.div
          key={roundIdx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: roundIdx * 0.07 }}
          className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden"
        >
          {/* Round header */}
          <div className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-0.5">
              Round {roundIdx + 1}
            </p>
            <p className="text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {prompt.topic}
              </span>
              <span className="text-gray-400 dark:text-zinc-500"> + </span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {prompt.focus}
              </span>
            </p>
          </div>

          {/* Participants for this round */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.runs.map((run, runIdx) => {
              const round = run.rounds[roundIdx];
              const skipped = !round?.pun_text;
              const aiScore = round?.ai_score ?? 0;
              const roundScore = round?.round_score ?? 0;
              const isMe = run.playerId === user?.uid;
              const isRoundWinner = data.runs.length > 1 && runIdx === 0;

              return (
                <div
                  key={run.id}
                  className={`px-5 py-4 space-y-2 ${
                    isRoundWinner ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar src={run.playerPhoto} name={run.playerName} />
                      <span className="text-sm font-medium truncate dark:text-zinc-300">
                        {isMe ? "You" : run.playerName}
                      </span>
                    </div>
                    <span className="text-sm font-mono font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
                      {roundScore.toLocaleString()} pts
                    </span>
                  </div>

                  {skipped ? (
                    <p className="font-serif italic text-gray-400 dark:text-zinc-600 text-sm pl-8">
                      — skipped —
                    </p>
                  ) : (
                    <p className="font-serif italic text-zinc-800 dark:text-zinc-200 text-sm border-l-2 border-orange-300 dark:border-violet-500 pl-3">
                      "{round.pun_text}"
                    </p>
                  )}

                  {round?.ai_feedback && (
                    <p className="text-xs text-gray-500 dark:text-zinc-500 italic pl-8">
                      AI ({aiScore}/10): {round.ai_feedback}
                    </p>
                  )}

                  <div className="pl-8">
                    <CommentThread
                      comments={comments}
                      gauntletId={gauntletId}
                      runId={run.id}
                      roundIndex={roundIdx}
                      onCommentAdded={(c) =>
                        setComments((prev) => [...prev, c])
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}

      {/* Chat section */}
      <GauntletChat
        gauntletId={gauntletId}
        messages={messages}
        onMessageSent={(msg) => setMessages((prev) => [...prev, msg])}
        onMessagesChanged={setMessages}
      />

      {showShareModal && (
        <ShareModal
          title="Share This Gauntlet"
          description="Send this link so someone else can replay these exact prompts and join the comparison later."
          shareUrl={`${window.location.origin}?gauntlet=${gauntletId}`}
          shareMessage="Take on this PunIntended gauntlet and compare your score with mine."
          onClose={() => setShowShareModal(false)}
        />
      )}
    </motion.div>
  );
}

function GauntletChatBubble({
  msg,
  isMe,
  onReact,
}: {
  msg: GauntletMessage;
  isMe: boolean;
  onReact: (messageId: string, reaction: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const longPressHandlers = useLongPress({
    onLongPress: useCallback(() => setPickerOpen(true), []),
  });

  return (
    <div className={`flex items-start gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
      <Avatar src={msg.userPhoto} name={msg.userName} />
      <div
        className={`max-w-[75%] relative ${isMe ? "items-end" : "items-start"} flex flex-col`}
      >
        <div
          {...longPressHandlers}
          className={`rounded-2xl px-3 py-2 select-none ${
            isMe
              ? "bg-orange-100 dark:bg-violet-900/40 text-orange-900 dark:text-violet-100"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
          }`}
        >
          {!isMe && (
            <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 mb-0.5">
              {msg.userName}
            </p>
          )}
          <p className="text-sm break-words">{msg.text}</p>
        </div>
        <ReactionSummary reactions={msg.reactions ?? {}} />
        <AnimatePresence>
          {pickerOpen && (
            <ReactionPicker
              currentReaction={msg.myReaction ?? null}
              onSelect={(reaction: MessageReaction | null) => {
                onReact(msg.id, reaction);
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function GauntletChat({
  gauntletId,
  messages,
  onMessageSent,
  onMessagesChanged,
}: {
  gauntletId: string;
  messages: GauntletMessage[];
  onMessageSent: (msg: GauntletMessage) => void;
  onMessagesChanged: (
    updater: (prev: GauntletMessage[]) => GauntletMessage[],
  ) => void;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const msg = await gauntletApi.sendMessage(gauntletId, text);
      onMessageSent(msg);
      setDraft("");
    } catch {
      // silently ignore
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReact(messageId: string, reaction: string | null) {
    onMessagesChanged((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const oldReaction = msg.myReaction;
        const reactions = { ...(msg.reactions ?? {}) };
        if (oldReaction) {
          reactions[oldReaction] = Math.max(
            0,
            (reactions[oldReaction] ?? 0) - 1,
          );
          if (reactions[oldReaction] === 0) delete reactions[oldReaction];
        }
        if (reaction) {
          reactions[reaction] = (reactions[reaction] ?? 0) + 1;
        }
        return { ...msg, reactions, myReaction: reaction };
      }),
    );
    await gauntletApi.reactToMessage(messageId, reaction);
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-orange-500 dark:text-violet-400" />
        <p className="font-mono text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">
          Chat
        </p>
      </div>

      <div className="max-h-64 overflow-y-auto px-5 py-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-600 italic text-center py-4">
            No messages yet — start the conversation!
          </p>
        ) : (
          messages.map((msg) => (
            <GauntletChatBubble
              key={msg.id}
              msg={msg}
              isMe={msg.userId === user?.uid}
              onReact={handleReact}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Say something..."
          maxLength={500}
          className="flex-1 text-sm px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:focus:ring-violet-500"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || submitting}
          className="p-2 rounded-xl text-orange-500 dark:text-violet-400 hover:bg-orange-50 dark:hover:bg-violet-900/30 disabled:opacity-40 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
