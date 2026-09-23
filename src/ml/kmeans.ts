/**
 * K-Means Clustering for Focus State Classification
 *
 * Clusters behavior windows into 4 states:
 * - Focused: normal cursor movement, low idle, moderate clicks
 * - Restless: high cursor movement, low idle, high clicks (fidgety)
 * - Idle: low cursor movement, high idle, low clicks
 * - Erratic: high variance in cursor movement (jumping around)
 *
 * Unsupervised — no training data needed. Re-fits periodically.
 */

export interface Point {
  features: number[]; // [velocity, idlePercent, clickRate, velocityVariance]
  label?: string;
}

export interface Cluster {
  centroid: number[];
  points: number[]; // indices into the original points array
  label: string;
}

const STATE_LABELS = ['focused', 'restless', 'idle', 'erratic'];

export class KMeansClustering {
  private k: number;
  private maxIterations: number;
  private centroids: number[][] = [];
  private assignments: number[] = [];
  private fitted = false;

  constructor(k: number = 4, maxIterations: number = 50) {
    this.k = k;
    this.maxIterations = maxIterations;
  }

  /**
   * Initialize centroids using k-means++ strategy.
   */
  private initializeCentroids(points: number[][]): void {
    this.centroids = [];

    // Pick first centroid randomly
    const firstIdx = Math.floor(Math.random() * points.length);
    this.centroids.push([...points[firstIdx]]);

    // Pick remaining centroids proportional to distance
    for (let c = 1; c < this.k; c++) {
      const distances = points.map((p) => {
        let minDist = Infinity;
        for (const centroid of this.centroids) {
          const dist = this.euclideanDistance(p, centroid);
          minDist = Math.min(minDist, dist);
        }
        return minDist * minDist;
      });

      const totalDist = distances.reduce((a, b) => a + b, 0);
      let rand = Math.random() * totalDist;

      for (let i = 0; i < distances.length; i++) {
        rand -= distances[i];
        if (rand <= 0) {
          this.centroids.push([...points[i]]);
          break;
        }
      }
    }
  }

  /**
   * Euclidean distance between two points.
   */
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Assign each point to the nearest centroid.
   */
  private assignPoints(points: number[][]): boolean {
    const newAssignments: number[] = [];
    let changed = false;

    for (const point of points) {
      let minDist = Infinity;
      let bestCluster = 0;

      for (let c = 0; c < this.k; c++) {
        const dist = this.euclideanDistance(point, this.centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }

      newAssignments.push(bestCluster);
      if (
        this.assignments.length === 0 ||
        this.assignments[newAssignments.length - 1] !== bestCluster
      ) {
        changed = true;
      }
    }

    this.assignments = newAssignments;
    return changed;
  }

  /**
   * Update centroids to be the mean of assigned points.
   */
  private updateCentroids(points: number[][]): void {
    const sums: number[][] = Array.from({ length: this.k }, () =>
      new Array(points[0].length).fill(0)
    );
    const counts = new Array(this.k).fill(0);

    for (let i = 0; i < points.length; i++) {
      const cluster = this.assignments[i];
      counts[cluster]++;
      for (let d = 0; d < points[i].length; d++) {
        sums[cluster][d] += points[i][d];
      }
    }

    for (let c = 0; c < this.k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < this.centroids[c].length; d++) {
          this.centroids[c][d] = sums[c][d] / counts[c];
        }
      }
    }
  }

  /**
   * Fit k-means to the data points.
   */
  fit(points: number[][]): void {
    if (points.length < this.k) return;

    this.initializeCentroids(points);

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const changed = this.assignPoints(points);
      if (!changed) break;
      this.updateCentroids(points);
    }

    this.fitted = true;
  }

  /**
   * Predict the cluster for a new point.
   */
  predict(point: number[]): string {
    if (!this.fitted || this.centroids.length === 0) return 'focused';

    let minDist = Infinity;
    let bestCluster = 0;

    for (let c = 0; c < this.k; c++) {
      const dist = this.euclideanDistance(point, this.centroids[c]);
      if (dist < minDist) {
        minDist = dist;
        bestCluster = c;
      }
    }

    // Sort centroids by idlePercent to assign meaningful labels
    // Centroid with highest idle% = idle, lowest = focused, etc.
    const sortedIndices = [...Array(this.k).keys()].sort(
      (a, b) => this.centroids[b][1] - this.centroids[a][1]
    );

    const labelMap: Record<number, string> = {};
    sortedIndices.forEach((idx, rank) => {
      labelMap[idx] = STATE_LABELS[rank] || 'focused';
    });

    return labelMap[bestCluster] || 'focused';
  }

  /**
   * Get the k value.
   */
  getK(): number {
    return this.k;
  }

  /**
   * Get cluster assignments for all fitted points.
   */
  getAssignments(): number[] {
    return [...this.assignments];
  }

  /**
   * Get centroids.
   */
  getCentroids(): number[][] {
    return this.centroids.map((c) => [...c]);
  }

  /**
   * Check if model has been fitted.
   */
  isFitted(): boolean {
    return this.fitted;
  }

  /**
   * Reset the model.
   */
  reset(): void {
    this.centroids = [];
    this.assignments = [];
    this.fitted = false;
  }
}
