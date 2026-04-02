# Theme Centralization Plan

## Overview

Centralize all hardcoded Tailwind color utilities across 20+ components into a single `@theme` block in `index.css`. This enables one-place color changes and consistent dark mode support.

## Current State

- **276 instances** of `dark:` color utilities scattered across components
- Light mode uses `orange-500` as primary accent
- Dark mode shifts accent to `violet-600`/`violet-400`
- No custom theme defined - all colors use Tailwind defaults
- No custom scrollbar styling

## Proposed Theme Architecture

### `@theme` Block in `app/src/index.css`

Define semantic CSS custom properties that switch values based on `.dark` class:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* === Base surfaces === */
  --color-background: #F5F5F0;
  --color-foreground: #1A1A1A;
  --color-surface: #ffffff;
  --color-surface-muted: #f9fafb;

  /* === Borders === */
  --color-border: #f3f4f6;
  --color-border-strong: #e5e7eb;
  --color-border-dashed: #e5e7eb;

  /* === Text hierarchy === */
  --color-text: #111827;
  --color-text-muted: #9ca3af;
  --color-text-secondary: #6b7280;
  --color-text-faint: #d1d5db;

  /* === Primary accent (orange light / violet dark) === */
  --color-accent: #f97316;
  --color-accent-hover: #ea580c;
  --color-accent-subtle: #fff7ed;
  --color-accent-muted: #ffedd5;
  --color-accent-foreground: #c2410c;
  --color-accent-border: #fed7aa;
  --color-accent-ring: #f97316;

  /* === Status colors === */
  --color-success: #16a34a;
  --color-success-subtle: #f0fdf4;
  --color-warning: #ca8a04;
  --color-warning-subtle: #fefce8;
  --color-danger: #ef4444;
  --color-danger-subtle: #fef2f2;
  --color-info: #2563eb;
  --color-info-subtle: #eff6ff;

  /* === Scrollbar === */
  --scrollbar-track: #f3f4f6;
  --scrollbar-thumb: #d1d5db;
  --scrollbar-thumb-hover: #9ca3af;
}

/* Dark mode overrides */
.dark {
  --color-background: #09090b;
  --color-foreground: #f4f4f5;
  --color-surface: #18181b;
  --color-surface-muted: #27272a;
  --color-border: #27272a;
  --color-border-strong: #3f3f46;
  --color-border-dashed: #3f3f46;
  --color-text: #f4f4f5;
  --color-text-muted: #a1a1aa;
  --color-text-secondary: #71717a;
  --color-text-faint: #3f3f46;
  --color-accent: #7c3aed;
  --color-accent-hover: #8b5cf6;
  --color-accent-subtle: rgba(139, 92, 246, 0.15);
  --color-accent-muted: rgba(139, 92, 246, 0.25);
  --color-accent-foreground: #c4b5fd;
  --color-accent-border: #6d28d9;
  --color-accent-ring: #8b5cf6;
  --color-success: #4ade80;
  --color-success-subtle: rgba(34, 197, 94, 0.15);
  --color-warning: #facc15;
  --color-warning-subtle: rgba(234, 179, 8, 0.15);
  --color-danger: #f87171;
  --color-danger-subtle: rgba(239, 68, 68, 0.15);
  --color-info: #60a5fa;
  --color-info-subtle: rgba(59, 130, 246, 0.15);
  --scrollbar-track: #27272a;
  --scrollbar-thumb: #52525b;
  --scrollbar-thumb-hover: #71717a;
}
```

### Custom Scrollbar Styles

```css
/* Webkit scrollbars (Chrome, Safari, Edge) */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}
::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
```

## Component Migration Map

Each component will replace hardcoded color utilities with semantic theme classes.

### Mapping Reference

| Old Pattern                                          | New Class                            |
| ---------------------------------------------------- | ------------------------------------ |
| `bg-[#F5F5F0] dark:bg-zinc-950`                      | `bg-background`                      |
| `text-[#1A1A1A] dark:text-zinc-100`                  | `text-foreground`                    |
| `bg-white dark:bg-zinc-900`                          | `bg-surface`                         |
| `bg-gray-50 dark:bg-zinc-800/50`                     | `bg-surface-muted`                   |
| `border-gray-100 dark:border-zinc-800`               | `border-border`                      |
| `border-gray-200 dark:border-zinc-700`               | `border-border-strong`               |
| `border-dashed border-gray-200 dark:border-zinc-700` | `border-dashed border-border-dashed` |
| `text-gray-900 dark:text-zinc-100`                   | `text-text`                          |
| `text-gray-400 dark:text-zinc-500`                   | `text-text-muted`                    |
| `text-gray-500 dark:text-zinc-400`                   | `text-text-secondary`                |
| `text-gray-600 dark:text-zinc-400`                   | `text-text-secondary`                |
| `bg-orange-500 dark:bg-violet-600`                   | `bg-accent`                          |
| `text-orange-500 dark:text-violet-400`               | `text-accent`                        |
| `bg-orange-50 dark:bg-violet-900/30`                 | `bg-accent-subtle`                   |
| `bg-orange-100 dark:bg-violet-900/40`                | `bg-accent-muted`                    |
| `text-orange-600 dark:text-violet-300`               | `text-accent-foreground`             |
| `border-orange-100 dark:border-violet-900/50`        | `border-accent-border`               |
| `focus:ring-orange-500 dark:focus:ring-violet-500`   | `focus:ring-accent-ring`             |
| `hover:bg-orange-50 dark:hover:bg-violet-900/20`     | `hover:bg-accent-subtle`             |
| `text-green-600 dark:text-green-400`                 | `text-success`                       |
| `bg-green-50 dark:bg-green-900/20`                   | `bg-success-subtle`                  |
| `text-yellow-600 dark:text-yellow-400`               | `text-warning`                       |
| `bg-yellow-50 dark:bg-yellow-900/20`                 | `bg-warning-subtle`                  |
| `text-red-500 dark:text-red-400`                     | `text-danger`                        |
| `bg-red-50 dark:bg-red-900/20`                       | `bg-danger-subtle`                   |
| `text-blue-600 dark:text-blue-400`                   | `text-info`                          |
| `bg-blue-50 dark:bg-blue-900/20`                     | `bg-info-subtle`                     |

### Files to Update (20 components)

1. **`app/src/App.tsx`** - Root background, login page, footer
2. **`app/src/components/Header.tsx`** - Header bar, menus, notifications, avatar borders
3. **`app/src/components/PunCard.tsx`** - Card surfaces, text, groan button, comments
4. **`app/src/components/SessionLobby.tsx`** - Lobby cards, forms, session list
5. **`app/src/components/GameBoard.tsx`** - Challenge cards, pun board, submit form
6. **`app/src/components/ChatBox.tsx`** - Chat bubbles, message list, input
7. **`app/src/components/GauntletMode.tsx`** - Round cards, progress indicators
8. **`app/src/components/GauntletComparison.tsx`** - Comparison cards, chat
9. **`app/src/components/GauntletHistory.tsx`** - History list items
10. **`app/src/components/GauntletReceipt.tsx`** - Receipt card, score display
11. **`app/src/components/GlobalLeaderboard.tsx`** - Leaderboard entries, tabs
12. **`app/src/components/WeeklyLeaderboard.tsx`** - Weekly table, headers
13. **`app/src/components/PlayerLeaderboard.tsx`** - Player entry cards
14. **`app/src/components/ChallengeHistoryPanel.tsx`** - Date dividers, pun list
15. **`app/src/components/ReactionPicker.tsx`** - Picker popup, reaction pills
16. **`app/src/components/ui/Button.tsx`** - Button variant definitions
17. **`app/src/components/ui/Card.tsx`** - Card base styles
18. **`app/src/components/ui/Logo.tsx`** - SVG accent color
19. **`app/src/components/ui/GroanBadge.tsx`** - Badge popover
20. **`app/src/components/modals/*.tsx`** - All 5 modal components

## Execution Order

1. Update `index.css` with `@theme` block and scrollbar styles
2. Update UI primitives first (`Button.tsx`, `Card.tsx`, `Logo.tsx`)
3. Update core components (`App.tsx`, `Header.tsx`, `PunCard.tsx`)
4. Update feature components (GameBoard, ChatBox, Gauntlet suite, Leaderboards)
5. Update modals
6. Build and verify

## Risks & Considerations

- **Opacity variants**: Some colors use opacity modifiers like `dark:bg-violet-900/30`. These map to `bg-accent-subtle` which already encodes the opacity in the CSS variable value.
- **Hardcoded hex values**: A few places use arbitrary values like `bg-[#F5F5F0]`. These become `bg-background`.
- **Gradient/complex backgrounds**: The challenge cards in GameBoard use `bg-zinc-900 dark:bg-zinc-800` which maps to a new `--color-surface-inverse` token if needed, or we can keep them as-is if they're intentional design choices.
- **Avatar rings**: Some avatar rings use `ring-white dark:ring-zinc-900` - these should map to the background color for seamless blending.
