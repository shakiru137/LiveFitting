*** Begin Patch
*** Update File: src/types/index.ts
@@
   suggestedSize: string | null;
   quality: MeasurementQuality;
   userHeightCm: number; // The height calibration value used
+  /** Provenance & diagnostics produced by the measurement engine (optional) */
+  provenance?: Record<string, unknown> | null;
 }
*** End Patch