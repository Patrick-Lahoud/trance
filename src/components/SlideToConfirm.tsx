import { useEffect, useRef, useState } from 'react';
import styles from './SlideToConfirm.module.css';

interface Props {
  onConfirm: () => void;
  label: string;
  accent?: string;
  width?: number;
}

/**
 * A forgiving slide-to-confirm control. The thumb follows the pointer without
 * lag, snaps into the completion zone near the end, then completes after a
 * short 100ms settle. Releasing early always springs back to the start.
 */
export function SlideToConfirm({ onConfirm, label, accent = '#FF6B6B', width = 200 }: Props) {
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [held, setHeld] = useState(false);
  const [fired, setFired] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const draggingRef = useRef(false);
  const grabOffsetRef = useRef(0);
  const holdTimerRef = useRef<number | null>(null);
  const confirmTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (confirmTimerRef.current !== null) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  };

  const reset = () => {
    clearTimers();
    draggingRef.current = false;
    progressRef.current = 0;
    setProgress(0);
    setHeld(false);
    setDragging(false);
  };

  const confirm = () => {
    if (confirmTimerRef.current !== null) return;
    draggingRef.current = false;
    setDragging(false);
    setHeld(true);
    setFired(true);
    navigator.vibrate?.(30);
    confirmTimerRef.current = window.setTimeout(() => {
      confirmTimerRef.current = null;
      setFired(false);
      setHeld(false);
      progressRef.current = 0;
      setProgress(0);
      onConfirm();
    }, 180);
  };

  const beginHold = () => {
    if (holdTimerRef.current !== null || confirmTimerRef.current !== null) return;
    setProgress(1);
    progressRef.current = 1;
    setHeld(true);
    navigator.vibrate?.(12);
    // The thumb may be released immediately after reaching the end; the
    // short settle still completes instead of cancelling on pointerup.
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      confirm();
    }, 100);
  };

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (fired) return;
    clearTimers();
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;
    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    grabOffsetRef.current = e.clientX - thumbRect.left;
    // Keep the point grabbed by the user under the pointer throughout the drag.
    // This avoids the old feeling where the thumb lagged or stopped short.
    if (progressRef.current >= 1) progressRef.current = 0;
    const startProgress = Math.max(0, Math.min(1, (thumbRect.left - trackRect.left) / Math.max(1, trackRect.width - thumbRect.width)));
    progressRef.current = startProgress;
    setProgress(startProgress);
    draggingRef.current = true;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is unavailable in some preview/test environments.
    }
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !trackRef.current || holdTimerRef.current !== null || confirmTimerRef.current !== null) return;
    const trackRect = trackRef.current.getBoundingClientRect();
    const thumbWidth = thumbRef.current?.getBoundingClientRect().width ?? 36;
    const maxTravel = Math.max(1, trackRect.width - thumbWidth);
    const thumbLeft = e.clientX - trackRect.left - grabOffsetRef.current;
    const next = Math.max(0, Math.min(1, thumbLeft / maxTravel));

    if (next >= 0.9) {
      beginHold();
      return;
    }

    progressRef.current = next;
    setProgress(next);
    setHeld(false);
  };

  const end = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (e && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
    draggingRef.current = false;
    setDragging(false);
    // Reaching the completion zone owns the interaction now; don't let a fast
    // pointerup cancel the 100ms settle timer.
    if (holdTimerRef.current !== null || confirmTimerRef.current !== null) return;
    if (progressRef.current < 0.9) reset();
  };

  useEffect(() => () => {
    draggingRef.current = false;
    clearTimers();
  }, []);

  const thumbLeft = `calc(${progress * 100}% - ${progress * 34}px)`;

  return (
    <div
      className={styles.track}
      ref={trackRef}
      style={{ width }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={`${styles.fill} ${held ? styles.fillHeld : ''}`}
        style={{ width: `${progress * 100}%`, background: accent }}
      />
      <div
        ref={thumbRef}
        className={`${styles.thumb} ${dragging ? styles.thumbDragging : ''} ${held ? styles.thumbHeld : ''} ${fired ? styles.thumbFired : ''}`}
        style={{
          left: thumbLeft,
          background: accent,
          boxShadow: fired ? `0 0 20px ${accent}` : undefined,
        }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onMouseDown={(e) => e.stopPropagation()}
      >
        ▶
      </div>
      <span className={styles.label} style={{ opacity: 1 - progress * 0.6 }}>
        {label}
      </span>
    </div>
  );
}
