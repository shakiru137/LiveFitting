/**
 * Digitcan LiveFittingRoom SDK
 * Version: 1.0.0
 *
 * Usage:
 *   <script src="https://app.digitcan.com/sdk/digitcan-sdk.js"></script>
 *   <script>
 *     const fr = new Digitcan.LiveFittingRoom({
 *       clientId: "sewmywears",
 *       customerId: "customer_82731",
 *       url: "https://app.digitcan.com/fitting-room",
 *       container: "#digitcan-fitting-room",
 *       onComplete: (result) => console.log(result),
 *       onError:    (error)  => console.error(error),
 *       onClose:    ()       => console.log("closed"),
 *     });
 *     fr.open();
 *   </script>
 */
(function (global) {
  'use strict';

  var SDK_VERSION = '1.0.0';
  var DEFAULT_URL = 'https://app.digitcan.com/fitting-room';

  /**
   * LiveFittingRoom SDK class.
   *
   * Manages an iframe that hosts the Digitcan LiveFittingRoom experience.
   * Communicates with the iframe via postMessage for secure cross-origin messaging.
   *
   * Supported postMessage types (iframe → parent):
   *   LFR_READY    — iframe loaded and ready
   *   LFR_COMPLETE — measurement complete, result payload attached
   *   LFR_ERROR    — error occurred
   *   LFR_CLOSE    — user closed the fitting room
   *   LFR_STATUS   — status/phase update from the fitting room
   *
   * Supported postMessage types (parent → iframe):
   *   LFR_SET_HEIGHT — override height calibration
   *   LFR_CLOSE      — close the fitting room programmatically
   */
  function LiveFittingRoom(options) {
    if (!options || !options.clientId) {
      throw new Error('[Digitcan SDK] clientId is required');
    }

    this.clientId    = options.clientId;
    this.customerId  = options.customerId || null;
    this.url         = options.url || DEFAULT_URL;
    this.container   = options.container || null;
    this.onComplete  = typeof options.onComplete === 'function' ? options.onComplete : null;
    this.onError     = typeof options.onError   === 'function' ? options.onError   : null;
    this.onClose     = typeof options.onClose   === 'function' ? options.onClose   : null;
    this.onStatus    = typeof options.onStatus  === 'function' ? options.onStatus  : null;

    this._iframe     = null;
    this._overlay    = null;
    this._msgHandler = null;
    this._isOpen     = false;
  }

  LiveFittingRoom.prototype.open = function () {
    if (this._isOpen) return;
    this._isOpen = true;

    var self = this;

    // ── Build iframe URL ─────────────────────────────────────────────────────
    var src = this.url;
    var sep = src.indexOf('?') === -1 ? '?' : '&';
    src += sep + 'clientId=' + encodeURIComponent(this.clientId);
    if (this.customerId) {
      src += '&customerId=' + encodeURIComponent(this.customerId);
    }

    // ── Resolve container element ────────────────────────────────────────────
    var containerEl = null;
    if (this.container) {
      containerEl = typeof this.container === 'string'
        ? document.querySelector(this.container)
        : this.container;
    }

    // ── Build overlay wrapper (if no container, fullscreen) ──────────────────
    var overlay = document.createElement('div');
    overlay.setAttribute('id', 'digitcan-lfr-overlay');
    overlay.style.cssText = containerEl
      ? 'position:relative;width:100%;height:100%;'
      : [
          'position:fixed;inset:0;z-index:999999;',
          'background:rgba(0,0,0,0.7);',
          'display:flex;align-items:center;justify-content:center;',
          'backdrop-filter:blur(4px);',
        ].join('');
    this._overlay = overlay;

    // ── Build iframe ──────────────────────────────────────────────────────────
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.allow = 'camera; microphone';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('title', 'LiveFittingRoom by Digitcan');
    iframe.style.cssText = containerEl
      ? 'width:100%;height:100%;border:0;border-radius:0;'
      : [
          'width:min(480px,100vw);',
          'height:min(820px,95vh);',
          'border:0;',
          'border-radius:16px;',
          'box-shadow:0 32px 80px rgba(0,0,0,0.7);',
        ].join('');
    this._iframe = iframe;

    overlay.appendChild(iframe);
    (containerEl || document.body).appendChild(overlay);

    // ── postMessage listener ──────────────────────────────────────────────────
    var allowedOrigin = new URL(this.url).origin;

    this._msgHandler = function (event) {
      // Security: only accept messages from the LiveFittingRoom origin
      if (event.origin !== allowedOrigin) return;
      if (!event.data || typeof event.data.type !== 'string') return;

      switch (event.data.type) {
        case 'LFR_READY':
          break;

        case 'LFR_COMPLETE':
          if (self.onComplete) self.onComplete(event.data.result);
          self.close();
          break;

        case 'LFR_ERROR':
          if (self.onError) self.onError(event.data.error);
          break;

        case 'LFR_CLOSE':
          if (self.onClose) self.onClose();
          self.close();
          break;

        case 'LFR_STATUS':
          if (self.onStatus) self.onStatus(event.data.phase, event.data.positionStatus);
          break;
      }
    };

    window.addEventListener('message', this._msgHandler);
  };

  LiveFittingRoom.prototype.close = function () {
    if (!this._isOpen) return;
    this._isOpen = false;

    if (this._msgHandler) {
      window.removeEventListener('message', this._msgHandler);
      this._msgHandler = null;
    }
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._overlay = null;
    this._iframe  = null;
  };

  LiveFittingRoom.prototype.setHeight = function (heightCm) {
    if (this._iframe && this._iframe.contentWindow) {
      this._iframe.contentWindow.postMessage(
        { type: 'LFR_SET_HEIGHT', heightCm: heightCm },
        new URL(this.url).origin
      );
    }
  };

  LiveFittingRoom.VERSION = SDK_VERSION;

  // ── Expose globally ────────────────────────────────────────────────────────
  global.Digitcan = global.Digitcan || {};
  global.Digitcan.LiveFittingRoom = LiveFittingRoom;
  global.Digitcan.VERSION = SDK_VERSION;

  // UMD compatibility
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LiveFittingRoom: LiveFittingRoom };
  }

})(typeof window !== 'undefined' ? window : this);
