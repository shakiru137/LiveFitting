*** Begin Patch
*** Update File: server/src/routes/measurements.ts
@@
-  firePartnerWebhook(session.clientId, partnerPayload).catch(() => { /* silent */ });
-
-  res.status(201).json({
-    result: partnerPayload,
-    internalRecord, // Internal audit reference
-  });
+  // Fire webhook to partner (best-effort)
+  firePartnerWebhook(session.clientId, partnerPayload).catch(() => { /* silent */ });
+
+  // Persist internalRecord as a SessionEvent for internal analytics/audit — DO NOT return it to partners
+  try {
+    await prisma.sessionEvent.create({
+      data: {
+        sessionId: session.id,
+        type: 'measurement.saved',
+        payload: internalRecord as any,
+      },
+    });
+  } catch (err) {
+    // Log but do not fail the measurement save for partners
+    console.error('[Measurements] Failed to persist internal session event:', err);
+  }
+
+  // Return clean partner payload only — never leak internal telemetry
+  res.status(201).json({ result: partnerPayload });
*** End Patch