import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  Brain,
  Calendar,
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
          ? "text-danger hover:bg-danger-subtle"
          : "text-text hover:bg-surface-muted"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
          danger
            ? "bg-danger-subtle text-danger"
            : "bg-surface-muted text-text-secondary"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          {meta && (
            <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-foreground">
              {meta}
            </span>
          )}
        </span>
        {sublabel && (
          <span className="mt-0.5 block truncate text-xs text-text-muted">
            {sublabel}
          </span>
        )}
      </span>
    </button>
  );
}

interface HeaderProps {
  onOpenProfile: () => void;
  onOpenSubmissions: () => void;
  onOpenAbout: () => void;
  onOpenChangelog: () => void;
  onOpenLeaderboard: () => void;
  onOpenBackwords: () => void;
  onOpenGauntlet: () => void;
  onNotificationClick: (link: string | null) => void;
  onLogoClick?: () => void;
}

export function Header({
  onOpenProfile,
  onOpenSubmissions,
  onOpenAbout,
  onOpenChangelog,
  onOpenLeaderboard,
  onOpenBackwords,
  onOpenGauntlet,
  onNotificationClick,
  onLogoClick,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const { notifications, unreadCount, markAllRead } = useNotifications();
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
    setShowNotifications((open) => {
      if (!open) markAllRead();
      return !open;
    });
  };

  const handleOpenNotifications = () => {
    setShowAccountMenu(false);
    setShowNotifications(true);
    markAllRead();
  };

  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-border px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
      <button
        onClick={onLogoClick}
        className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-75 disabled:pointer-events-none sm:gap-3"
        disabled={!onLogoClick}
        aria-label="Go to lobby"
      >
        <div className="p-1.5 sm:p-2 bg-accent rounded-lg sm:rounded-xl">
          <Logo className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
        <span className="hidden text-base font-serif italic font-bold min-[380px]:inline sm:text-xl">
          PunIntended
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3">
        <button
          onClick={handleHeaderAction(onOpenLeaderboard)}
          className="p-2 rounded-full hover:bg-surface-muted text-text-secondary transition-colors"
          aria-label="Leaderboards"
        >
          <Trophy className="w-5 h-5" />
        </button>
        <button
          onClick={handleHeaderAction(onOpenBackwords)}
          className="p-2 rounded-full hover:bg-surface-muted text-text-secondary transition-colors"
          aria-label="Backwords"
        >
          <Brain className="w-5 h-5" />
        </button>
        <button
          onClick={handleHeaderAction(onOpenGauntlet)}
          className="p-2 rounded-full hover:bg-surface-muted text-text-secondary transition-colors"
          aria-label="The Gauntlet"
        >
          <Swords className="w-5 h-5" />
        </button>
        <button
          onClick={handleHeaderAction(toggleTheme)}
          className="p-2 rounded-full hover:bg-surface-muted text-text-secondary transition-colors"
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
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: [1.5, 0], opacity: [1, 0] }}
                  transition={{ duration: 0.3 }}
                  className="absolute top-1 right-1 w-2.5 h-2.5 bg-danger rounded-full border-2 border-background"
                />
              )}
            </AnimatePresence>
          </Button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="fixed left-4 right-4 top-20 z-[60] overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
              >
                <div className="flex items-center justify-between border-b border-border bg-surface-muted p-4">
                  <div>
                    <h3 className="font-bold text-text">Notifications</h3>
                    <p className="text-xs text-text-muted">
                      Recent activity and session links.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AnimatePresence>
                      {unreadCount > 0 && (
                        <motion.span
                          initial={{ scale: 1, opacity: 1 }}
                          exit={{
                            scale: [1.2, 0],
                            opacity: [1, 0],
                            filter: ["blur(0px)", "blur(4px)"],
                          }}
                          transition={{ duration: 0.35, ease: "easeOut" }}
                          className="rounded-full bg-border px-2 py-1 text-xs font-medium text-text-secondary"
                        >
                          {unreadCount} New
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <button
                      type="button"
                      onClick={closeNotifications}
                      className="rounded-full p-1 text-text-muted transition-colors hover:bg-border hover:text-text"
                      aria-label="Close notifications"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-text-muted text-sm">
                      No notifications yet.
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <motion.div
                        key={notif.id}
                        animate={{
                          backgroundColor: notif.read
                            ? "rgba(0,0,0,0)"
                            : "var(--color-accent-subtle)",
                        }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        onClick={() => {
                          onNotificationClick(notif.link);
                          closeNotifications();
                        }}
                        className="p-4 border-b border-border hover:bg-accent-subtle cursor-pointer transition-colors"
                      >
                        <p
                          className={`text-sm transition-all duration-500 ${!notif.read ? "font-medium text-text" : "text-text-secondary"}`}
                        >
                          {notif.message}
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          {new Date(notif.createdAt).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </motion.div>
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
            className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-surface-muted"
            aria-label="Open account menu"
            aria-expanded={showAccountMenu}
            aria-haspopup="menu"
          >
            <span className="relative shrink-0">
              <img
                src={user.photoURL || ""}
                className="h-9 w-9 rounded-full border border-border-strong"
                alt="Profile"
              />
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: [1.5, 0], opacity: [1, 0] }}
                    transition={{ duration: 0.3 }}
                    className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background bg-danger"
                  />
                )}
              </AnimatePresence>
            </span>
            <span className="hidden text-left lg:block">
              <span className="block text-sm font-medium text-text">
                {user.displayName}
              </span>
              <span className="block text-xs text-text-muted">Menu</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-text-muted sm:block" />
          </button>

          <AnimatePresence>
            {showAccountMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-border bg-surface p-2 shadow-2xl"
              >
                <div className="rounded-[1.25rem] bg-surface-muted px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.photoURL || ""}
                      className="h-11 w-11 rounded-full border border-border-strong"
                      alt="Profile"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">
                        {user.displayName}
                      </p>
                      <p className="truncate text-xs text-text-muted">
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
                    icon={Calendar}
                    label="My Submissions"
                    sublabel="Daily puns, scores, and comments"
                    onClick={handleHeaderAction(onOpenSubmissions)}
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
