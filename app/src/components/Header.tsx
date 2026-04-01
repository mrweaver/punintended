import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  ChevronDown,
  FileText,
  Info,
  LogOut,
  Moon,
  Sun,
  Trophy,
  Swords,
  User,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useNotifications } from "../hooks/useNotifications";
import { Button } from "./ui/Button";
import { Logo } from "./ui/Logo";

function HeaderMenuItem({
  icon: Icon,
  label,
  meta,
  sublabel,
  onClick,
  danger = false,
}: {
  icon: typeof Bell;
  label: string;
  meta?: string;
  sublabel?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
        danger
          ? "text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
          : "text-gray-700 hover:bg-gray-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
          danger
            ? "bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300"
            : "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          {meta && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600 dark:bg-violet-900/40 dark:text-violet-300">
              {meta}
            </span>
          )}
        </span>
        {sublabel && (
          <span className="mt-0.5 block truncate text-xs text-gray-400 dark:text-zinc-500">
            {sublabel}
          </span>
        )}
      </span>
    </button>
  );
}

interface HeaderProps {
  onOpenProfile: () => void;
  onOpenAbout: () => void;
  onOpenChangelog: () => void;
  onOpenLeaderboard: () => void;
  onOpenGauntlet: () => void;
  onNotificationClick: (link: string | null) => void;
  onLogoClick?: () => void;
}

export function Header({
  onOpenProfile,
  onOpenAbout,
  onOpenChangelog,
  onOpenLeaderboard,
  onOpenGauntlet,
  onNotificationClick,
  onLogoClick,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const { notifications, unreadCount, markRead } = useNotifications();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const latestNotification = notifications[0] ?? null;

  useEffect(() => {
    if (!showAccountMenu && !showNotifications) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        notificationsRef.current?.contains(target) ||
        accountMenuRef.current?.contains(target)
      ) {
        return;
      }

      setShowNotifications(false);
      setShowAccountMenu(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowNotifications(false);
        setShowAccountMenu(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showAccountMenu, showNotifications]);

  const closeNotifications = () => setShowNotifications(false);
  const closeAccountMenu = () => setShowAccountMenu(false);
  const closeOverlays = () => {
    closeNotifications();
    closeAccountMenu();
  };

  const handleHeaderAction = (action?: () => void) => () => {
    closeOverlays();
    action?.();
  };

  const handleNotificationsToggle = () => {
    setShowAccountMenu(false);
    setShowNotifications((open) => !open);
  };

  const handleOpenNotifications = () => {
    setShowAccountMenu(false);
    setShowNotifications(true);
  };

  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-800 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
      <button
        onClick={onLogoClick}
        className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-75 disabled:pointer-events-none sm:gap-3"
        disabled={!onLogoClick}
        aria-label="Go to lobby"
      >
        <div className="p-1.5 sm:p-2 bg-orange-500 dark:bg-violet-600 rounded-lg sm:rounded-xl">
          <Logo className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
        <span className="hidden text-base font-serif italic font-bold min-[380px]:inline sm:text-xl">
          PunIntended
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3">
        <button
          onClick={handleHeaderAction(onOpenLeaderboard)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400 transition-colors"
          aria-label="Leaderboards"
        >
          <Trophy className="w-5 h-5" />
        </button>
        <button
          onClick={handleHeaderAction(onOpenGauntlet)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400 transition-colors"
          aria-label="The Gauntlet"
        >
          <Swords className="w-5 h-5" />
        </button>
        <button
          onClick={handleHeaderAction(toggleTheme)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400 transition-colors"
          aria-label="Toggle Dark Mode"
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>

        <div ref={notificationsRef} className="relative">
          <Button
            variant="ghost"
            onClick={handleNotificationsToggle}
            className="relative hidden p-2 sm:flex"
            aria-label="Notifications"
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
                className="fixed left-4 right-4 top-20 z-[60] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
              >
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-zinc-100">
                      Notifications
                    </h3>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                      Recent activity and session links.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {unreadCount} New
                    </span>
                    <button
                      type="button"
                      onClick={closeNotifications}
                      className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      aria-label="Close notifications"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
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
                          closeNotifications();
                        }}
                        className={`p-4 border-b border-gray-50 dark:border-zinc-800 hover:bg-orange-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${!notif.read ? "bg-orange-50/50 dark:bg-violet-900/20" : ""}`}
                      >
                        <p
                          className={`text-sm ${!notif.read ? "font-medium text-gray-900 dark:text-zinc-100" : "text-gray-600 dark:text-zinc-400"}`}
                        >
                          {notif.message}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                          {new Date(notif.createdAt).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div ref={accountMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setShowNotifications(false);
              setShowAccountMenu((open) => !open);
            }}
            className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
            aria-label="Open account menu"
            aria-expanded={showAccountMenu}
            aria-haspopup="menu"
          >
            <span className="relative shrink-0">
              <img
                src={user.photoURL || ""}
                className="h-9 w-9 rounded-full border border-gray-200 dark:border-zinc-700"
                alt="Profile"
              />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-red-500 dark:border-zinc-950"></span>
              )}
            </span>
            <span className="hidden text-left lg:block">
              <span className="block text-sm font-medium dark:text-zinc-200">
                {user.displayName}
              </span>
              <span className="block text-xs text-gray-400 dark:text-zinc-500">
                Menu
              </span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-gray-400 dark:text-zinc-500 sm:block" />
          </button>

          <AnimatePresence>
            {showAccountMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-gray-100 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="rounded-[1.25rem] bg-gray-50 px-4 py-3 dark:bg-zinc-950">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.photoURL || ""}
                      className="h-11 w-11 rounded-full border border-gray-200 dark:border-zinc-700"
                      alt="Profile"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-zinc-100">
                        {user.displayName}
                      </p>
                      <p className="truncate text-xs text-gray-400 dark:text-zinc-500">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  <HeaderMenuItem
                    icon={Bell}
                    label="Notifications"
                    meta={unreadCount > 0 ? `${unreadCount} new` : undefined}
                    sublabel={
                      latestNotification
                        ? latestNotification.message
                        : "No recent activity"
                    }
                    onClick={handleOpenNotifications}
                  />
                  <HeaderMenuItem
                    icon={User}
                    label="User Profile"
                    sublabel="Stats, streaks, and display name"
                    onClick={handleHeaderAction(onOpenProfile)}
                  />
                  <HeaderMenuItem
                    icon={Info}
                    label="How to Play / About"
                    sublabel="Rules, credits, and game details"
                    onClick={handleHeaderAction(onOpenAbout)}
                  />
                  <HeaderMenuItem
                    icon={FileText}
                    label="Version & Changelog"
                    sublabel={`Currently on v${__APP_VERSION__}`}
                    onClick={handleHeaderAction(onOpenChangelog)}
                  />
                  <HeaderMenuItem
                    icon={LogOut}
                    label="Log Out"
                    sublabel="End this session on this device"
                    onClick={handleHeaderAction(logout)}
                    danger
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
