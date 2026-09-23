/**
 * EWMA (Exponentially Weighted Moving Average) Baseline
 *
 * Builds a rolling baseline of "what focused YOU looks like" per feature.
 * The alpha parameter controls how quickly the baseline adapts:
 * - Higher alpha = faster adaptation (more responsive to changes)
 * - Lower alpha = slower adaptation (more stable baseline)
 */

export interface EWMABaseline {
  mean: number;
  variance: number;
  count: number;
}

export class EWMATracker {
  private baselines: Map<string, EWMABaseline> = new Map();
  private alpha: number;
  private initialized = false;

  constructor(alpha: number = 0.3) {
    this.alpha = alpha;
  }

  /**
   * Update the baseline with a new observation for a given feature.
   * Returns the updated baseline.
   */
  update(featureName: string, value: number): EWMABaseline {
    const existing = this.baselines.get(featureName);

    if (!existing) {
      // First observation — initialize
      const baseline: EWMABaseline = {
        mean: value,
        variance: 0,
        count: 1,
      };
      this.baselines.set(featureName, baseline);
      return baseline;
    }

    // EWMA update
    const diff = value - existing.mean;
    const newMean = existing.mean + this.alpha * diff;
    const newVariance =
      (1 - this.alpha) * (existing.variance + this.alpha * diff * diff);

    existing.mean = newMean;
    existing.variance = newVariance;
    existing.count++;

    return existing;
  }

  /**
   * Get the current baseline for a feature.
   */
  getBaseline(featureName: string): EWMABaseline | undefined {
    return this.baselines.get(featureName);
  }

  /**
   * Get the standard deviation for a feature.
   */
  getStdDev(featureName: string): number {
    const baseline = this.baselines.get(featureName);
    if (!baseline || baseline.count < 2) return 1; // Default to 1 to avoid div by zero
    return Math.sqrt(baseline.variance);
  }

  /**
   * Get the mean for a feature.
   */
  getMean(featureName: string): number {
    const baseline = this.baselines.get(featureName);
    return baseline ? baseline.mean : 0;
  }

  /**
   * Check if we have enough data for reliable baselines.
   */
  isReady(): boolean {
    return this.baselines.size >= 3 && this.getCount() >= 10;
  }

  /**
   * Get the observation count for the first feature (they should all be similar).
   */
  getCount(): number {
    const first = this.baselines.values().next();
    return first.value ? first.value.count : 0;
  }

  /**
   * Reset all baselines.
   */
  reset(): void {
    this.baselines.clear();
    this.initialized = false;
  }

  /**
   * Serialize for persistence.
   */
  serialize(): object {
    const obj: Record<string, EWMABaseline> = {};
    this.baselines.forEach((v, k) => {
      obj[k] = { ...v };
    });
    return obj;
  }

  /**
   * Restore from serialized data.
   */
  restore(data: Record<string, EWMABaseline>): void {
    this.baselines.clear();
    Object.entries(data).forEach(([k, v]) => {
      this.baselines.set(k, { ...v });
    });
  }
}
