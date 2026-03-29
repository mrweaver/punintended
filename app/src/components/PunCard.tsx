import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageCircle,
  ChevronDown,
  Pencil,
  Trash2,
  Send,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/Button";
import { Logo } from "./ui/Logo";
import type { Pun, PunComment, PunReaction } from "../api/client";

interface PunCardProps {
  pun: Pun;
  index: number;
  comments: PunComment[];
  submitting: boolean;
  onReact: (punId: string, reaction: PunReaction | null) => void;
  onViewed: (punId: string) => void;
  onEdit: (punId: string, text: string) => void;
  onDelete: (punId: string) => void;
  onComment: (punId: string, text: string) => void;
}

const REACTIONS: Array<{ key: PunReaction; emoji: string }> = [
  { key: "groan", emoji: "🙄" },
  { key: "laugh", emoji: "😄" },
  { key: "clever", emoji: "🧠" },
  { key: "fire", emoji: "🔥" },
  { key: "wild", emoji: "🤯" },
];

export function PunCard({
  pun,
  index,
  comments,
  submitting,
  onReact,
  onViewed,
  onEdit,
  onDelete,
  onComment,
}: PunCardProps) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const isAuthor = pun.authorId === user?.uid;

  const handleSubmitComment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onComment(pun.id, commentText.trim());
    setCommentText("");
    onViewed(pun.id);
  };

  const handleReaction = (reaction: PunReaction) => {
    const nextReaction = pun.myReaction === reaction ? null : reaction;
    onReact(pun.id, nextReaction);
    onViewed(pun.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onClick={() => onViewed(pun.id)}
      className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-gray-900 dark:text-zinc-100 truncate max-w-[120px] sm:max-w-none">
          {pun.authorName}
        </span>
        <span className="text-xs text-gray-400 dark:text-zinc-500 whitespace-nowrap">
          •{" "}
          {new Date(pun.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {!pun.viewed && (
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-violet-900/50 dark:text-violet-200">
            New
          </span>
        )}
        {isAuthor && !isEditing && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setEditText(pun.text);
              }}
              className="p-1.5 text-gray-400 hover:text-orange-500 dark:hover:text-violet-500 hover:bg-orange-50 dark:hover:bg-violet-900/30 rounded-lg transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(pun.id);
              }}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Pun text */}
      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full p-3 sm:p-4 text-lg font-serif italic bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 rounded-xl border border-gray-200 dark:border-zinc-800 focus:ring-2 focus:ring-orange-500 dark:focus:ring-violet-500 min-h-[80px] resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(false);
              }}
              className="px-3 py-1.5 text-sm"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(pun.id, editText);
                setIsEditing(false);
              }}
              className="px-3 py-1.5 text-sm"
              loading={submitting}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowReactionPicker(!showReactionPicker);
            onViewed(pun.id);
          }}
          className="text-left w-full"
        >
          <p className="text-xl sm:text-2xl font-serif italic text-gray-800 dark:text-zinc-200 select-none">
            "{pun.text}"
          </p>
        </button>
      )}

      {/* AI feedback */}
      {pun.aiScore !== undefined && pun.aiScore !== null && !isEditing && (
        <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-violet-900/20 rounded-xl">
          <Logo
            className="w-4 h-4 text-orange-500 dark:text-violet-400 shrink-0 mt-0.5"
            accent
          />
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-bold text-orange-700 dark:text-violet-300">
                AI Score: {pun.aiScore}/10
              </span>
              {pun.responseTimeMs != null && (
                <span
                  className={`text-xs font-mono ${
                    pun.responseTimeMs <= 30_000
                      ? "text-green-600 dark:text-green-400"
                      : pun.responseTimeMs <= 120_000
                        ? "text-orange-500 dark:text-orange-400"
                        : "text-gray-400 dark:text-zinc-500"
                  }`}
                >
                  ⚡{" "}
                  {pun.responseTimeMs < 60_000
                    ? `${Math.round(pun.responseTimeMs / 1000)}s`
                    : `${Math.floor(pun.responseTimeMs / 60_000)}m ${Math.round((pun.responseTimeMs % 60_000) / 1000)}s`}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-orange-600 dark:text-violet-400/80 italic">
              {pun.aiFeedback}
            </p>
          </div>
        </div>
      )}

      {pun.aiFeedback === "Re-evaluating..." && !isEditing && (
        <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-violet-900/20 rounded-xl">
          <Logo
            className="w-4 h-4 text-orange-500 dark:text-violet-400 shrink-0 mt-0.5 animate-spin"
            accent
          />
          <p className="text-xs sm:text-sm text-orange-600 dark:text-violet-400/80 italic">
            Re-evaluating...
          </p>
        </div>
      )}

      {/* Inline reaction picker */}
      <AnimatePresence>
        {showReactionPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, height: 0 }}
            animate={{ opacity: 1, scale: 1, height: "auto" }}
            exit={{ opacity: 0, scale: 0.85, height: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1 bg-gray-50 dark:bg-zinc-800 rounded-full w-fit px-2 py-1.5 border border-gray-100 dark:border-zinc-700 shadow-sm">
              {REACTIONS.map((item) => {
                const active = pun.myReaction === item.key;
                return (
                  <motion.button
                    key={item.key}
                    whileTap={{ scale: 1.3 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReaction(item.key);
                      setShowReactionPicker(false);
                    }}
                    className={`w-10 h-10 rounded-full transition-all flex items-center justify-center ${
                      active
                        ? "bg-orange-100 dark:bg-violet-900/40 scale-110"
                        : "hover:bg-white dark:hover:bg-zinc-700"
                    }`}
                  >
                    <span className="text-xl leading-none">{item.emoji}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card footer */}
      <div className="flex items-center gap-2">
        {pun.myReaction && !showReactionPicker && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowReactionPicker(true);
            }}
            className="text-lg leading-none opacity-70 hover:opacity-100 hover:scale-110 transition-all"
            title="Change reaction"
          >
            {REACTIONS.find((r) => r.key === pun.myReaction)?.emoji}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
            onViewed(pun.id);
          }}
          className={`flex items-center gap-1.5 text-sm transition-colors ${
            isExpanded
              ? "text-orange-500 dark:text-violet-500"
              : "text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
          }`}
        >
          <MessageCircle className={`w-4 h-4 ${isExpanded ? "fill-current" : ""}`} />
          {comments.length > 0 && (
            <span className="font-medium text-xs">{comments.length}</span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Comments Section */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-gray-100 dark:border-zinc-800 pt-3"
          >
            <div className="space-y-3 mb-3">
              {comments.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500 italic text-center py-2">
                  No comments yet. Be the first!
                </p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <img
                      src={comment.userPhoto || ""}
                      alt={comment.userName}
                      className="w-6 h-6 rounded-full border border-gray-200 dark:border-zinc-700"
                    />
                    <div className="flex-1 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl rounded-tl-sm px-4 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-gray-900 dark:text-zinc-200">
                          {comment.userName}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                          {new Date(comment.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-zinc-300">
                        {comment.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleSubmitComment} className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 bg-transparent border-b border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 px-2 py-2 text-sm focus:outline-none focus:border-orange-500 dark:focus:border-violet-500 transition-colors"
              />
              <Button
                variant="ghost"
                type="submit"
                className="p-2 rounded-full min-w-[36px] h-[36px] flex items-center justify-center text-orange-500 dark:text-violet-500 hover:bg-orange-50 dark:hover:bg-violet-900/20"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
