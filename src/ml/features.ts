import { EWMATracker } from './ewma';
import { ZScoreDetector } from './zscore';
import { KMeansClustering } from './kmeans';
import { WindowData } from '../types';

export interface FeatureVector {
  velocity: number;
  idlePercent: number;
  clickRate: number;
  velocityVariance: number;
  timestamp: number;
}

export interface TrackingSample {
  cursorX: number;
  cursorY: number;
  idleSeconds: number;
  timestamp: number;
  velocity: number;
  clickCount: number;
}

/**
 * FeatureExtractor
 *
 * Collects raw tracking samples, computes windowed feature vectors,
 * feeds them through the ML pipeline (EWMA → Z-score → K-means),
 * and produces classified WindowData objects.
 */
export class FeatureExtractor {
  private samples: TrackingSample[] = [];
  private windowDurationMs: number;
  private ewma: EWMATracker;
  private zscore: ZScoreDetector;
  private kmeans: KMeansClustering;

  private calibrationWindows = 0;
  private maxCalibrationWindows = 3; // ~3 min at 10s windows
  private isCalibrated = false;

  private windowStartTime = 0;
  private currentVelocitySum = 0;
  private currentVelocitySqSum = 0;
  private currentIdleSum = 0;
  private currentClickSum = 0;
  private currentSampleCount = 0;

  // Accumulated feature vectors for k-means fitting
  private allFeatureVectors: number[][] = [];

  constructor(windowDurationSeconds: number = 2) {
    this.windowDurationMs = windowDurationSeconds * 1000;
    this.ewma = new EWMATracker(0.3);
    this.zscore = new ZScoreDetector(this.ewma, 1.5); // Lower threshold for more sensitivity
    this.kmeans = new KMeansClustering(4, 50);
  }

  /**
   * Add a raw tracking sample. Returns a FeatureVector if a window is complete.
   */
  addSample(sample: TrackingSample): FeatureVector | null {
    const now = sample.timestamp;

    // Start new window if needed
    if (this.windowStartTime === 0) {
      this.windowStartTime = now;
    }

    // Accumulate samples
    this.currentVelocitySum += sample.velocity;
    this.currentVelocitySqSum += sample.velocity * sample.velocity;
    this.currentIdleSum += Math.min(sample.idleSeconds / (this.windowDurationMs / 1000), 1);
    this.currentClickSum += sample.clickCount;
    this.currentSampleCount++;

    // Check if window is complete
    if (now - this.windowStartTime >= this.windowDurationMs) {
      const windowData = this.computeWindow();
      this.resetWindow();
      return windowData;
    }

    return null;
  }

  /**
   * Compute the feature vector for the current window.
   */
  private computeWindow(): FeatureVector {
    const count = this.currentSampleCount || 1;
    const velocity = this.currentVelocitySum / count;
    const velocityVariance =
      this.currentVelocitySqSum / count - velocity * velocity;
    const idlePercent = this.currentIdleSum / count;
    const clickRate = (this.currentClickSum / count) * (1000 / 500); // Scale to per-second

    return {
      velocity,
      idlePercent: Math.min(idlePercent, 1),
      clickRate,
      velocityVariance: Math.max(velocityVariance, 0),
      timestamp: this.windowStartTime,
    };
  }

  /**
   * Process a feature vector through the ML pipeline and return classified data.
   */
  processWindow(vector: FeatureVector, isBreak: boolean): WindowData {
    if (isBreak) {
      return {
        timestamp: vector.timestamp,
        velocity: vector.velocity,
        idlePercent: vector.idlePercent,
        clickRate: vector.clickRate,
        state: 'focused', // Breaks don't count against focus
        zScore: 0,
        isBreak: true,
      };
    }

    // Accumulate feature vectors for k-means
    this.allFeatureVectors.push([
      vector.velocity,
      vector.idlePercent,
      vector.clickRate,
      vector.velocityVariance,
    ]);

    // Calibration phase — just feed EWMA
    if (!this.isCalibrated) {
      this.ewma.update('velocity', vector.velocity);
      this.ewma.update('idlePercent', vector.idlePercent);
      this.ewma.update('clickRate', vector.clickRate);
      this.ewma.update('velocityVariance', vector.velocityVariance);
      this.calibrationWindows++;

      if (this.calibrationWindows >= this.maxCalibrationWindows) {
        this.isCalibrated = true;
        // Fit k-means with calibration data
        if (this.allFeatureVectors.length >= this.kmeans.getK()) {
          this.kmeans.fit(this.allFeatureVectors);
        }
      }

      return {
        timestamp: vector.timestamp,
        velocity: vector.velocity,
        idlePercent: vector.idlePercent,
        clickRate: vector.clickRate,
        state: 'focused', // Assume focused during calibration
        zScore: 0,
        isBreak: false,
      };
    }

    // Update EWMA baseline
    this.ewma.update('velocity', vector.velocity);
    this.ewma.update('idlePercent', vector.idlePercent);
    this.ewma.update('clickRate', vector.clickRate);
    this.ewma.update('velocityVariance', vector.velocityVariance);

    // Compute z-score
    const zResult = this.zscore.score({
      velocity: vector.velocity,
      idlePercent: vector.idlePercent,
      clickRate: vector.clickRate,
      velocityVariance: vector.velocityVariance,
    });

    // Classify with k-means (re-fit periodically)
    if (this.allFeatureVectors.length % 10 === 0 && this.allFeatureVectors.length >= 8) {
      this.kmeans.fit(this.allFeatureVectors);
    }

    const state = this.kmeans.predict([
      vector.velocity,
      vector.idlePercent,
      vector.clickRate,
      vector.velocityVariance,
    ]);

    this.calibrationWindows++;

    return {
      timestamp: vector.timestamp,
      velocity: vector.velocity,
      idlePercent: vector.idlePercent,
      clickRate: vector.clickRate,
      state: state as 'focused' | 'restless' | 'idle' | 'erratic',
      zScore: zResult.compositeScore,
      isBreak: false,
    };
  }

  /**
   * Check if the detector is in sustained lapse.
   */
  isSustainedLapse(): boolean {
    return this.zscore.isSustainedLapse();
  }

  /**
   * Get the number of consecutive anomalies.
   */
  getConsecutiveAnomalies(): number {
    return this.zscore.getConsecutiveAnomalies();
  }

  /**
   * Check if calibration is complete.
   */
  isCalibrationComplete(): boolean {
    return this.isCalibrated;
  }

  /**
   * Get the EWMA baseline (for display/debugging).
   */
  getBaseline() {
    return {
      velocity: this.ewma.getMean('velocity'),
      idlePercent: this.ewma.getMean('idlePercent'),
      clickRate: this.ewma.getMean('clickRate'),
      velocityVariance: this.ewma.getMean('velocityVariance'),
    };
  }

  /**
   * Reset the window accumulator.
   */
  private resetWindow(): void {
    this.windowStartTime = 0;
    this.currentVelocitySum = 0;
    this.currentVelocitySqSum = 0;
    this.currentIdleSum = 0;
    this.currentClickSum = 0;
    this.currentSampleCount = 0;
  }

  /**
   * Full reset (new session).
   */
  reset(): void {
    this.resetWindow();
    this.ewma.reset();
    this.kmeans.reset();
    this.allFeatureVectors = [];
    this.calibrationWindows = 0;
    this.isCalibrated = false;
  }
}
