import { useRef, useCallback } from "react";

interface UseLongPressOptions {
  delay?: number;
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void;
}

export function useLongPress({ delay = 500, onLongPress }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      triggeredRef.current = false;
      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        onLongPress(e);
      }, delay);
    },
    [delay, onLongPress],
  );

  const onTouchMove = useCallback(() => {
    clear();
  }, [clear]);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      clear();
      if (triggeredRef.current) {
        e.preventDefault();
      }
    },
    [clear],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      triggeredRef.current = false;
      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        onLongPress(e);
      }, delay);
    },
    [delay, onLongPress],
  );

  const onMouseUp = useCallback(() => {
    clear();
  }, [clear]);

  const onMouseLeave = useCallback(() => {
    clear();
  }, [clear]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseUp,
    onMouseLeave,
  };
}
