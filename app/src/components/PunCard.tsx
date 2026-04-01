import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, ChevronDown, Pencil, Trash2, Send } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/Button";
import { GroanBadge } from "./ui/GroanBadge";
import { Logo } from "./ui/Logo";
import { useLongPress } from "../hooks/useLongPress";
import {
  ReactionPicker,
  ReactionSummary,
  type MessageReaction,
} from "./ReactionPicker";
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
  onCommentReact?: (commentId: string, reaction: string | null) => void;
  onLoadComments?: (punId: string) => void;
}

function CommentBubble({
  comment,
  onReact,
}: {
  comment: PunComment;
  onReact?: (commentId: string, reaction: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const longPressHandlers = useLongPress({
    onLongPress: useCallback(() => setPickerOpen(true), []),
  });

  return (
    <div className="flex gap-3">
      <img
        src={comment.userPhoto || ""}
        alt={comment.userName}
        className="w-6 h-6 rounded-full border border-gray-200 dark:border-zinc-700 shrink-0"
      />
      <div className="flex-1 min-w-0 relative">
        <div
          {...longPressHandlers}
          className="bg-gray-50 dark:bg-zinc-800/50 rounded-2xl rounded-tl-sm px-4 py-2 select-none"
        >
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
        <ReactionSummary reactions={comment.reactions ?? {}} />
        <AnimatePresence>
          {pickerOpen && (
            <ReactionPicker
              currentReaction={comment.myReaction ?? null}
              onSelect={(reaction: MessageReaction | null) => {
                onReact?.(comment.id, reaction);
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
  onCommentReact,
  onLoadComments,
}: PunCardProps) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [commentText, setCommentText] = useState("");

  const isAuthor = pun.authorId === user?.uid;

  const handleSubmitComment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onComment(pun.id, commentText.trim());
    setCommentText("");
    onViewed(pun.id);
  };

  const handleGroan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAuthor) return; // Prevent authors from groaning at their own puns
    onReact(pun.id, pun.myReaction ? null : "groan");
    onViewed(pun.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onViewportEnter={() => {
        if (!pun.viewed) {
          onViewed(pun.id);
        }
      }}
      viewport={{ once: true, amount: 0.3 }}
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
        <p className="text-xl sm:text-2xl font-serif italic text-gray-800 dark:text-zinc-200">
          "{pun.text}"
        </p>
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

      {/* Card footer */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <motion.button
            whileTap={isAuthor ? undefined : { scale: 0.9 }}
            onClick={handleGroan}
            disabled={isAuthor}
            aria-label={
              isAuthor
                ? "You can't groan at your own pun"
                : pun.myReaction
                  ? "Remove groan reaction"
                  : "Groan at this pun"
            }
            title={
              isAuthor
                ? "You can't groan at your own pun!"
                : "The highest compliment for a good pun!"
            }
            className={`group flex items-center text-sm transition-all disabled:cursor-default ${
              pun.myReaction
                ? "text-orange-600 dark:text-violet-400 opacity-100"
                : `disabled:opacity-50 ${
                    pun.groanCount > 0
                      ? "text-gray-600 dark:text-zinc-400 opacity-100"
                      : "text-gray-400 dark:text-zinc-500 opacity-80"
                  } ${!isAuthor && "hover:text-gray-800 dark:hover:text-zinc-200"}`
            }`}
          >
            <span
              className={`text-base transition-all duration-200 ${
                pun.myReaction || pun.groanCount > 0
                  ? ""
                  : `grayscale ${!isAuthor ? "group-hover:grayscale-0" : ""}`
              }`}
            >
              🙄
            </span>
          </motion.button>

          {pun.groanCount > 0 && (
            <motion.div
              key={pun.groanCount}
              initial={{ scale: 0.5, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 12 }}
            >
              <GroanBadge
                count={pun.groanCount}
                groaners={pun.groaners}
                showIcon={false}
                triggerClassName={`inline-flex items-center rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 dark:focus-visible:ring-violet-500 ${
                  pun.myReaction
                    ? "font-medium text-orange-600 dark:text-violet-400"
                    : "font-medium text-gray-600 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              />
            </motion.div>
          )}
        </div>
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isExpanded) onLoadComments?.(pun.id);
            setIsExpanded(!isExpanded);
            onViewed(pun.id);
          }}
          className={`flex items-center gap-1.5 text-sm transition-colors ${
            isExpanded
              ? "text-orange-500 dark:text-violet-500"
              : "text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
          }`}
        >
          <MessageCircle
            className={`w-4 h-4 ${isExpanded ? "fill-current" : ""}`}
          />
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
                  <CommentBubble
                    key={comment.id}
                    comment={comment}
                    onReact={onCommentReact}
                  />
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
