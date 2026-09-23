import { EWMATracker } from './ewma';

/**
 * Z-Score Anomaly Detection
 *
 * Computes how many standard deviations a window's features are from
 * the EWMA baseline. High z-score = likely lapse.
 *
 * Uses a composite z-score across multiple features for robustness.
 */

export interface ZScoreResult {
  compositeScore: number;
  featureScores: Record<string, number>;
  isAnomaly: boolean;
}

export class ZScoreDetector {
  private ewma: EWMATracker;
  private threshold: number;
  private consecutiveAnomalies = 0;

  // Features and their weights in the composite score
  private featureWeights: Record<string, number> = {
    velocity: 0.3,
    idlePercent: 0.35,
    clickRate: 0.2,
    velocityVariance: 0.15,
  };

  constructor(ewma: EWMATracker, threshold: number = 2.0) {
    this.ewma = ewma;
    this.threshold = threshold;
  }

  /**
   * Compute z-score for a single feature.
   */
  private featureZScore(featureName: string, value: number): number {
    const mean = this.ewma.getMean(featureName);
    const stdDev = this.ewma.getStdDev(featureName);

    if (stdDev === 0) return 0;
    return Math.abs(value - mean) / stdDev;
  }

  /**
   * Compute composite anomaly score for a feature vector.
   * Returns the weighted average of individual z-scores.
   */
  score(features: {
    velocity: number;
    idlePercent: number;
    clickRate: number;
    velocityVariance: number;
  }): ZScoreResult {
    const featureScores: Record<string, number> = {};

    featureScores.velocity = this.featureZScore('velocity', features.velocity);
    featureScores.idlePercent = this.featureZScore(
      'idlePercent',
      features.idlePercent
    );
    featureScores.clickRate = this.featureZScore(
      'clickRate',
      features.clickRate
    );
    featureScores.velocityVariance = this.featureZScore(
      'velocityVariance',
      features.velocityVariance
    );

    // Weighted composite score
    let totalWeight = 0;
    let weightedSum = 0;
    for (const [feature, score] of Object.entries(featureScores)) {
      const weight = this.featureWeights[feature] || 0;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const isAnomaly = compositeScore >= this.threshold;

    // Track consecutive anomalies
    if (isAnomaly) {
      this.consecutiveAnomalies++;
    } else {
      this.consecutiveAnomalies = 0;
    }

    return {
      compositeScore,
      featureScores,
      isAnomaly,
    };
  }

  /**
   * Get number of consecutive anomalous windows.
   */
  getConsecutiveAnomalies(): number {
    return this.consecutiveAnomalies;
  }

  /**
   * Check if sustained lapse is detected (2+ consecutive anomalies).
   */
  isSustainedLapse(): boolean {
    return this.consecutiveAnomalies >= 2;
  }

  /**
   * Reset consecutive counter.
   */
  resetConsecutive(): void {
    this.consecutiveAnomalies = 0;
  }
}
