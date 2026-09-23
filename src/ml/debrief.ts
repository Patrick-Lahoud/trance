import { SessionData, WindowData, DebriefInsight } from '../types';

/**
 * DebriefGenerator
 *
 * Walks the full session timeline and generates a rule-based-but-personalized
 * natural language summary. No LLM required — templated logic over real computed stats.
 */
export class DebriefGenerator {
  /**
   * Generate a full debrief from session data.
   */
  generate(session: SessionData): DebriefInsight[] {
    const insights: DebriefInsight[] = [];
    const windows = session.windows;
    const nonBreak = windows.filter((w) => !w.isBreak);

    if (nonBreak.length === 0) {
      insights.push({
        text: 'Session was too short for meaningful analysis. Try working for at least 5 minutes to get your first debrief.',
        type: 'stat',
      });
      return insights;
    }

    // Core stats
    const focusPct = session.focusPercentage;
    const driftCount = session.driftCount;
    const avgStreak = session.avgFocusStreak;

    // Focus percentage insight
    if (focusPct >= 80) {
      insights.push({
        text: `Strong session — ${focusPct}% focused. You maintained consistent attention throughout.`,
        type: 'stat',
      });
    } else if (focusPct >= 60) {
      insights.push({
        text: `Decent session — ${focusPct}% focused. There's room to extend your focus windows.`,
        type: 'stat',
      });
    } else {
      insights.push({
        text: `Challenging session — ${focusPct}% focused. This data is useful — it tells us where to improve.`,
        type: 'stat',
      });
    }

    // Average focus streak
    insights.push({
      text: `Your average focus streak was ${avgStreak} windows (~${Math.round(avgStreak * 10 / 60 * 10) / 10} min). ${
        avgStreak >= 6
          ? 'That\'s solid sustained attention.'
          : avgStreak >= 3
          ? 'Building — try extending by one more window next time.'
          : 'Short bursts — focus on reaching 3+ consecutive windows.'
      }`,
      type: 'pattern',
    });

    // Lapse patterns
    if (driftCount > 0) {
      const lapseWindows = nonBreak.filter(
        (w) => w.state !== 'focused'
      );

      // Find when lapses happen relative to task switches
      const taskSwitches = windows.filter((w) => w.taskLabel);
      if (taskSwitches.length > 0) {
        const lapseAfterSwitch = this.analyzeLapseAfterEvent(
          nonBreak,
          taskSwitches,
          'taskLabel'
        );
        if (lapseAfterSwitch > 0.5) {
          insights.push({
            text: `You lapse most within 5 minutes of switching tasks (${Math.round(lapseAfterSwitch * 100)}% of lapses happen here). Consider a brief pause to settle before diving in.`,
            type: 'pattern',
          });
        }
      }

      // Find when lapses happen after breaks
      const breaks = windows.filter((w) => w.isBreak);
      if (breaks.length > 0) {
        const lapseAfterBreak = this.analyzeLapseAfterEvent(
          nonBreak,
          breaks,
          'breakEnd'
        );
        if (lapseAfterBreak > 0.4) {
          insights.push({
            text: `You tend to lapse after returning from breaks (${Math.round(lapseAfterBreak * 100)}%). Try easing back in with a smaller task first.`,
            type: 'pattern',
          });
        }
      }
    }

    // Per-task insights
    const taskSegments = this.getTaskSegments(windows);
    if (taskSegments.length > 1) {
      const taskFocus = taskSegments.map((seg) => ({
        label: seg.label,
        focusPct: this.segmentFocusPct(seg.windows),
      }));

      taskFocus.sort((a, b) => b.focusPct - a.focusPct);

      if (taskFocus.length >= 2) {
        const best = taskFocus[0];
        const worst = taskFocus[taskFocus.length - 1];
        insights.push({
          text: `You focus best on "${best.label}" (${best.focusPct}%) vs "${worst.label}" (${worst.focusPct}%). Consider tackling harder work during your peak-focus tasks.`,
          type: 'pattern',
        });
      }
    }

    // Concrete suggestion
    const suggestion = this.generateSuggestion(session, nonBreak);
    insights.push({
      text: suggestion,
      type: 'suggestion',
    });

    return insights;
  }

  /**
   * Analyze how often lapses happen after an event (task switch or break).
   */
  private analyzeLapseAfterEvent(
    windows: WindowData[],
    events: WindowData[],
    eventType: 'taskLabel' | 'breakEnd'
  ): number {
    let lapseAfterEvent = 0;
    let totalEvents = 0;

    for (const event of events) {
      totalEvents++;
      // Look at the 3 windows after the event
      const eventIdx = windows.findIndex(
        (w) => w.timestamp >= event.timestamp
      );
      if (eventIdx === -1) continue;

      const nextWindows = windows.slice(eventIdx, eventIdx + 3);
      const hasLapse = nextWindows.some((w) => w.state !== 'focused');
      if (hasLapse) lapseAfterEvent++;
    }

    return totalEvents > 0 ? lapseAfterEvent / totalEvents : 0;
  }

  /**
   * Get segments of consecutive windows with the same task label.
   */
  private getTaskSegments(
    windows: WindowData[]
  ): { label: string; windows: WindowData[] }[] {
    const segments: { label: string; windows: WindowData[] }[] = [];
    let currentLabel = 'No Task';
    let currentWindows: WindowData[] = [];

    for (const w of windows) {
      if (w.taskLabel && w.taskLabel !== currentLabel) {
        if (currentWindows.length > 0) {
          segments.push({ label: currentLabel, windows: currentWindows });
        }
        currentLabel = w.taskLabel;
        currentWindows = [];
      }
      currentWindows.push(w);
    }

    if (currentWindows.length > 0) {
      segments.push({ label: currentLabel, windows: currentWindows });
    }

    return segments;
  }

  /**
   * Calculate focus percentage for a segment.
   */
  private segmentFocusPct(windows: WindowData[]): number {
    const nonBreak = windows.filter((w) => !w.isBreak);
    if (nonBreak.length === 0) return 100;
    const focused = nonBreak.filter((w) => w.state === 'focused').length;
    return Math.round((focused / nonBreak.length) * 100);
  }

  /**
   * Generate a single concrete suggestion for the next session.
   */
  private generateSuggestion(
    session: SessionData,
    nonBreakWindows: WindowData[]
  ): string {
    const focusPct = session.focusPercentage;
    const avgStreak = session.avgFocusStreak;

    if (focusPct < 50) {
      return 'Try a 5-minute focused sprint on one task — no switching. Build the muscle one short burst at a time.';
    }

    if (avgStreak < 3) {
      return 'Your focus comes in short bursts. Next session, pick one task and commit to 10 minutes without switching.';
    }

    if (session.driftCount > 5) {
      return 'You had many lapse episodes. Try starting with your most engaging task — momentum builds focus.';
    }

    if (focusPct >= 80) {
      return 'Excellent focus today. Push for longer streaks — try extending your current focus window by just one more minute.';
    }

    return 'Keep tracking. Each session builds a clearer picture of your attention patterns.';
  }
}
