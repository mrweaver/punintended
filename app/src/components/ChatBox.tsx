import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useLongPress } from '../hooks/useLongPress';
import { ReactionPicker, ReactionSummary, type MessageReaction } from './ReactionPicker';
import type { ChatMessage } from '../api/client';

interface ChatBoxProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onReactToMessage?: (messageId: string, reaction: string | null) => void;
  onClose?: () => void;
  isMobileModal?: boolean;
}

function ChatBubble({
  msg,
  isMe,
  onReact,
}: {
  msg: ChatMessage;
  isMe: boolean;
  onReact?: (messageId: string, reaction: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const longPressHandlers = useLongPress({
    onLongPress: useCallback(() => setPickerOpen(true), []),
  });

  return (
    <div className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
      <img
        src={msg.userPhoto || ''}
        alt={msg.userName}
        className="w-8 h-8 rounded-full border border-gray-200 dark:border-zinc-700 shrink-0"
      />
      <div className={`max-w-[75%] relative ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          {...longPressHandlers}
          className={`rounded-2xl px-4 py-2 select-none ${
            isMe
              ? 'bg-orange-500 dark:bg-violet-600 text-white rounded-tr-sm'
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-zinc-200 rounded-tl-sm'
          }`}
        >
          {!isMe && (
            <p className="text-[10px] font-bold opacity-50 mb-1">{msg.userName}</p>
          )}
          <p className="text-sm">{msg.text}</p>
        </div>
        <ReactionSummary reactions={msg.reactions ?? {}} />
        <AnimatePresence>
          {pickerOpen && (
            <ReactionPicker
              currentReaction={msg.myReaction ?? null}
              onSelect={(reaction: MessageReaction | null) => {
                onReact?.(msg.id, reaction);
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

export function ChatBox({ messages, onSendMessage, onReactToMessage, onClose, isMobileModal }: ChatBoxProps) {
  const { user } = useAuth();
  const [chatText, setChatText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendMessage(chatText.trim());
    setChatText('');
  };

  return (
    <div className={isMobileModal ? 'flex flex-col h-full' : 'lg:col-span-1 flex flex-col h-full'}>
      {isMobileModal ? (
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-gray-300 dark:bg-zinc-600" />
          <h2 className="text-lg font-serif italic dark:text-zinc-100">Group Chat</h2>
          <button onClick={onClose} className="p-2 text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white">✕</button>
        </div>
      ) : (
        <h2 className="text-2xl sm:text-3xl font-serif italic flex items-center gap-3 dark:text-zinc-100 mb-4 sm:mb-6">
          <MessageSquare className="text-orange-500 dark:text-violet-500" />
          Group Chat
        </h2>
      )}
      <Card className={`flex flex-col border-2 border-gray-100 dark:border-zinc-800 p-0 overflow-hidden bg-white dark:bg-zinc-900 ${
        isMobileModal ? 'flex-1 rounded-none' : 'h-[400px] sm:h-[min(520px,calc(100vh-350px))] sticky top-24'
      }`}>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-zinc-500 text-sm italic mt-4">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                isMe={msg.userId === user?.uid}
                onReact={onReactToMessage}
              />
            ))
          )}
          <div ref={chatEndRef} />
        </div>
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-gray-100 dark:border-zinc-800 flex gap-2"
        >
          <input
            type="text"
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-transparent border-b border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-zinc-100 px-2 py-2 text-sm focus:outline-none focus:border-orange-500 dark:focus:border-violet-500 transition-colors"
          />
          <Button
            variant="ghost"
            type="submit"
            className="p-2 rounded-full min-w-[40px] h-[40px] flex items-center justify-center text-orange-500 dark:text-violet-500 hover:bg-orange-50 dark:hover:bg-violet-900/20"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
