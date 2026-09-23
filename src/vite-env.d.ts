/// <reference types="vite/client" />

interface Window {
  trance?: {
    onTrackingUpdate: (callback: (data: any) => void) => void;
    startBreak: (durationMinutes: number) => void;
    onBreakStarted: (callback: (durationMinutes: number) => void) => void;
    endBreak: () => void;
    onBreakEnded: (callback: () => void) => void;
    setTaskLabel: (label: string) => void;
    onTaskLabeled: (callback: (label: string) => void) => void;
    openDashboard: (tab?: string) => void;
    onDashboardTab: (callback: (tab: string) => void) => void;
    endSession: () => void;
    onSessionEnded: (callback: () => void) => void;
    deleteSession: (id: string) => void;
    getSessionHistory: () => Promise<any[]>;
    getCurrentSession: () => Promise<any | null>;
    getTrackingData: () => Promise<any>;
    getSessionsForTrends: () => Promise<any[]>;
    moveWidget: (deltaX: number, deltaY: number) => void;
    setFocusMode: (on: boolean) => void;
    setWidgetExpanded: (on: boolean) => void;
    quitApp: () => void;
  };
}
