/* Shared browser/Electron reply completion tracker. */
(function (root) {
  class NexusTurnTracker {
    constructor({ requestId, sessionId, provider, baseline = {}, startedAt = Date.now(), stableMs = 1800, graceMs = 1500 }) {
      Object.assign(this, { requestId, sessionId, provider, baseline, startedAt, stableMs, graceMs });
      this.lastText = ''; this.changedAt = startedAt; this.idleSamples = 0; this.completedAt = 0;
    }
    observe(snapshot, now = Date.now()) {
      if (!snapshot || snapshot.busy || snapshot.streaming) { this.idleSamples = 0; this.completedAt = 0; return null; }
      const ownTurn = snapshot.replyForRequestId === this.requestId || String(snapshot.lastUserText || '').includes(this.requestId);
      const text = String(snapshot.reply || '').trim();
      const fresh = !!snapshot.replyId && snapshot.replyId !== this.baseline.replyId || snapshot.replyCount > (this.baseline.replyCount || 0) || text !== String(this.baseline.reply || '').trim();
      if (!ownTurn || !fresh || !text) { this.idleSamples = 0; return null; }
      if (text !== this.lastText) { this.lastText = text; this.changedAt = now; this.idleSamples = 0; this.completedAt = 0; return null; }
      this.idleSamples++;
      if (this.idleSamples < 3 || now - this.changedAt < this.stableMs) return null;
      if (!this.completedAt) this.completedAt = now;
      if (now - this.completedAt < this.graceMs) return null;
      return { requestId: this.requestId, sessionId: this.sessionId, provider: this.provider, text, source: 'browser', done: true, createdAt: this.startedAt, finishedAt: now };
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { NexusTurnTracker };
  else root.NexusTurnTracker = NexusTurnTracker;
})(globalThis);
