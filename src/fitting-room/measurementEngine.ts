*** Begin Patch
*** Update File: src/fitting-room/measurementEngine.ts
@@
 export function finaliseMeasurements(
   buf: FrameBuffer,
   userHeightCm: number
 ): { measurements: MeasurementsCm; quality: MeasurementQuality; suggestedSize: string | null } {
   const evalResult = evaluateBufferQuality(buf);
@@
   return {
     measurements,
     quality: {
       grade: evalResult.grade,
       confidence: evalResult.confidence,
       stabilityScore: evalResult.stabilityScore,
       framesAnalyzed: evalResult.framesAnalyzed,
     },
     suggestedSize,
   };
 }
+
+/**
+ * Build provenance information for measurements computed from the buffer.
+ * Produces per-key statistics (framesAnalyzed, framesUsed, min, max, mean, median, variance, outlierCount)
+ */
+export function buildProvenance(buf: FrameBuffer) {
+  const statsFor = (arr: number[] | undefined) => {
+    if (!arr || arr.length === 0) return null;
+    const n = arr.length;
+    const mean = arr.reduce((a, b) => a + b, 0) / n;
+    const sorted = [...arr].sort((a, b) => a - b);
+    const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
+    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
+    const min = sorted[0];
+    const max = sorted[n - 1];
+    const outlierThreshold = mean + 2.5 * Math.sqrt(variance);
+    const outlierCount = arr.filter((v) => v > outlierThreshold || v < mean - 2.5 * Math.sqrt(variance)).length;
+    return { framesAnalyzed: n, framesUsed: n, min, max, mean: Math.round(mean * 10) / 10, median: Math.round(median * 10) / 10, variance: Math.round(variance * 100) / 100, outlierCount };
+  };
+
+  const keys: FrameKey[] = ['height','headCircumference','neckCircumference','shoulderWidth','chestGirth','waistGirth','hipGirth','torsoLength','sleeveLength','trouserLength','skirtLength'];
+  const result: Record<string, unknown> = { engineVersion: MEASUREMENT_ENGINE_VERSION } as any;
+  keys.forEach((k) => {
+    const arr = buf.get(k) as number[] | undefined;
+    result[k] = statsFor(arr as number[] | undefined);
+  });
+
+  // Overall stats
+  const overall: any = {
+    framesAnalyzed: evaluateBufferQuality(buf).framesAnalyzed,
+    stabilityScore: evaluateBufferQuality(buf).stabilityScore,
+    confidence: evaluateBufferQuality(buf).confidence,
+  };
+  result.overall = overall;
+
+  return result;
+}
*** End Patch