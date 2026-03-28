import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LogOut, Bell, Sun, Moon, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../hooks/useNotifications';
import { Button } from './ui/Button';
import { Logo } from './ui/Logo';
import type { Session } from '../api/client';

interface HeaderProps {
  onOpenProfile: () => void;
  onOpenAbout: () => void;
  onNotificationClick: (link: string | null) => void;
}

export function Header({ onOpenProfile, onOpenAbout, onNotificationClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const { notifications, unreadCount, markRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);

  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-800 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="p-1.5 sm:p-2 bg-orange-500 dark:bg-violet-600 rounded-lg sm:rounded-xl">
          <Logo className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
        <span className="text-lg sm:text-xl font-serif italic font-bold">PunIntended</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenAbout}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400 transition-colors"
          aria-label="About & How to Play"
        >
          <Info className="w-5 h-5" />
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400 transition-colors"
          aria-label="Toggle Dark Mode"
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Notifications Dropdown */}
        <div className="relative">
          <Button
            variant="ghost"
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-950"></span>
            )}
          </Button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-2 w-80 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-gray-100 dark:border-zinc-800 overflow-hidden z-50"
              >
                <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50 dark:bg-zinc-950">
                  <h3 className="font-bold text-gray-900 dark:text-zinc-100">Notifications</h3>
                  <span className="text-xs font-medium bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 px-2 py-1 rounded-full">
                    {unreadCount} New
                  </span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 dark:text-zinc-500 text-sm">
                      No notifications yet.
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => {
                          markRead(notif.id);
                          onNotificationClick(notif.link);
                          setShowNotifications(false);
                        }}
                        className={`p-4 border-b border-gray-50 dark:border-zinc-800 hover:bg-orange-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${!notif.read ? 'bg-orange-50/50 dark:bg-violet-900/20' : ''}`}
                      >
                        <p
                          className={`text-sm ${!notif.read ? 'font-medium text-gray-900 dark:text-zinc-100' : 'text-gray-600 dark:text-zinc-400'}`}
                        >
                          {notif.message}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                          {new Date(notif.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 p-2 rounded-full transition-colors"
          onClick={onOpenProfile}
        >
          <img
            src={user.photoURL || ''}
            className="w-8 h-8 rounded-full border border-gray-200 dark:border-zinc-700"
            alt="Profile"
          />
          <span className="hidden sm:inline font-medium dark:text-zinc-200">
            {user.displayName}
          </span>
        </div>
        <Button variant="ghost" onClick={logout} className="p-2">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
