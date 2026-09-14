*** Begin Patch
*** Update File: server/src/routes/measurements.ts
@@
-  const session = await prisma.session.findUnique({
-    where: { sessionRef: refStr },
-    include: { partner: { select: { clientId: true } } },
-  });
+  const session = await prisma.session.findUnique({
+    where: { sessionRef: refStr },
+    include: { partner: { select: { clientId: true } } },
+  });
   if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
   if (session.status === 'COMPLETE') { res.status(409).json({ error: 'Session already completed' }); return; }
@@
-  const parsed = MeasurementSchema.safeParse(req.body);
+  // If this is a non-browser call, require partner auth middleware to have attached req.partner
+  // (middleware must be wired in server index or route registration)
+
+  const parsed = MeasurementSchema.safeParse(req.body);
   if (!parsed.success) {
     res.status(400).json({ error: 'Invalid measurement data', details: parsed.error.flatten() });
     return;
   }
@@
-  const [measurement] = await prisma.$transaction([
+  // Enforce tenant isolation: if req.partner present, ensure the session belongs to that partner
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any
+  const reqAny = req as any;
+  if (reqAny.partner && reqAny.partner.clientId && reqAny.partner.clientId !== session.clientId) {
+    res.status(403).json({ error: 'Partner mismatch for session' });
+    return;
+  }
+
+  const [measurement] = await prisma.$transaction([
@@
-  // Clean Partner Payload (e.g. for SewMyWears) — excludes internal telemetry
-  const partnerPayload = buildCleanPartnerPayload(measurement);
-
-  // Digitcan Internal Record — complete telemetry for analytics
-  const internalRecord = buildDigitcanInternalRecord(session, measurement);
-
-  firePartnerWebhook(session.clientId, partnerPayload).catch(() => { /* silent */ });
-
-  // Persist internalRecord as a SessionEvent for internal analytics/audit — DO NOT return it to partners
-  try {
-    await prisma.sessionEvent.create({
-      data: {
-        sessionId: session.id,
-        type: 'measurement.saved',
-        payload: internalRecord as any,
-      },
-    });
-  } catch (err) {
-    // Log but do not fail the measurement save for partners
-    console.error('[Measurements] Failed to persist internal session event:', err);
-  }
-
-  // Return clean partner payload only — never leak internal telemetry
-  res.status(201).json({ result: partnerPayload });
+  // Clean Partner Payload (e.g. for SewMyWears) — excludes internal telemetry
+  const partnerPayload = buildCleanPartnerPayload(measurement);
+
+  // Digitcan Internal Record — complete telemetry for analytics
+  const internalRecord = buildDigitcanInternalRecord(session, measurement);
+
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