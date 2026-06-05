// @ts-nocheck
/*
This is the outzoom core. Used by the content script (injected on every page) and
also by the options page (so zooming can be tested there directly).
*/

import { Point } from './point';
import { app } from './app';
import { Logger } from './logger';
import { DotConfig } from './config';

// are we inside an extension, or just on a page as a plain <script>?
const insideExtension =
  typeof browser === 'object' ||
  (typeof chrome === 'object' && typeof chrome.extension === 'object');

const logger = new Logger('outzoom: ', app.isDev());

/*
utility, splits e.g. 12px to 12 and px; same with '%'
*/
class NumberUnit {
  constructor(str) {
    this.value = null;
    this.unit = null;
    this.parse(str);
  }
  parse(str) {
    this.value = parseFloat(str);
    this.unit = str.match(/[a-zA-Z%]+/g);
  }

  combine() {
    return this.value + (this.unit ? this.unit : '');
  }
}

/*
Takes care of moving (dragging) DOM elements. A new instance is created for every
element which is to be draggable.
*/
class ElementDraggable {
  constructor(element = null, shiftRequired = true) {
    this.lastMousePos = new Point();
    this.startMousePos = new Point();
    this.mouseIsDown = false; // a button is pressed on the element
    this.dragging = false; // pressed AND moved past the threshold
    this.wasMovement = false; // there was a drag since the last click
    this.activePointerId = null;
    // When false, dragging works with plain LMB (no Shift required).
    // Set to false when an extra trigger key is configured so the user
    // doesn't have to hold Shift just to reposition an element.
    this.shiftRequired = shiftRequired;
    // Set to true by detach() to silence all handlers after a zoom reset.
    this.disabled = false;
    this.attachedElement = null;
    // Every listener this instance adds (to document or the element) is recorded
    // here so detach() can remove them all and we don't leak listeners across
    // repeated zoom/reset cycles.
    this._listeners = [];
    if (element) {
      this.attach(element);
    }
  }

  /**
   * Stop this draggable from responding to any future events and remove the
   * draggable CSS class from the element. Called when the element is reset
   * (ESC) so the grab-cursor and drag behaviour go away immediately.
   * All listeners added in attach() were recorded in `this._listeners`, so we
   * remove them here to avoid leaking listeners across repeated zoom/reset
   * cycles. `this.disabled` is kept as a belt-and-suspenders guard.
   */
  detach() {
    this.disabled = true;
    this.mouseIsDown = false;
    this.dragging = false;
    for (const [target, type, fn, opts] of this._listeners) {
      target.removeEventListener(type, fn, opts);
    }
    this._listeners = [];
    if (this.attachedElement) {
      this.attachedElement.classList.remove('outzoom-draggable', 'outzoom-dragging');
    }
  }

  /*
  Dragging a <video controls> fights the element's native controls, and the two
  engines disagree on who wins. To behave the same everywhere we:
    - listen for pointermove / pointerup on `document` in the CAPTURE phase, so
      we see the movement before the video's controls (mouse events were lost
      there - that's why the old mouse-based drag failed on video);
    - take setPointerCapture only LAZILY, once the pointer has moved past
      DRAG_THRESHOLD. A pure click never captures, so play/pause and links keep
      working in both Chrome and Firefox;
    - kill the native HTML5 drag-and-drop of <img>/<a> (it would otherwise fire
      pointercancel and abort the drag).
  The document listeners are stored so detach() can remove them.
  */
  attach(element) {
    this.attachedElement = element;
    element.classList.add('outzoom-draggable');
    this._listeners = [];

    // Register a listener AND record it so detach() can remove it later.
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._listeners.push([target, type, fn, opts]);
    };

    const DRAG_THRESHOLD = 3; // px a press must move before it counts as a drag
    const isVideo = element.tagName === 'VIDEO';

    // A <video> is special: its own player owns the surface, and the press
    // never reaches a plain listener on the element.
    //  - Native controls (e.g. our test page, Firefox) are native-anonymous
    //    content that swallows the press. While Shift is held we strip the
    //    `controls` attribute so the element becomes plain and draggable.
    //  - Custom players (e.g. Twitch) stack their own <div> overlays on top of
    //    the <video>, so the press lands on those overlays. We detect the drag
    //    on `document` (capture phase) and hit-test with elementsFromPoint to
    //    see whether our video sits under the cursor, even when covered.
    // Either way a video is dragged only while Shift is held; without it the
    // player's controls work normally.
    let shiftDown = false;
    let controlsHiddenByUs = false;
    const setControlsHidden = (hidden) => {
      if (!isVideo) return;
      if (hidden) {
        if (element.hasAttribute('controls')) {
          element.removeAttribute('controls');
          controlsHiddenByUs = true;
        }
      } else if (controlsHiddenByUs) {
        element.setAttribute('controls', '');
        controlsHiddenByUs = false;
      }
    };

    // Allow Inzoom to signal a Shift press that happened before the first zoom,
    // so this instance is fully drag-ready from the very first Shift+drag attempt.
    this._onShiftChange = (isDown) => {
      shiftDown = isDown;
      setControlsHidden(isDown);
    };

    // Transform state captured at drag-start. We apply TOTAL displacement from
    // the origin rather than incremental deltas so that external code (YouTube,
    // etc.) resetting the element's transform between events doesn't cause
    // jitter — each pointermove re-applies the full accumulated offset.
    let dragOriginTransform = '';
    let dragOriginScaleX = 1;
    let dragOriginScaleY = 1;
    let dragTotalX = 0;
    let dragTotalY = 0;

    const endDrag = () => {
      if (this.activePointerId !== null) {
        try {
          element.releasePointerCapture(this.activePointerId);
        } catch (e) {
          /* pointer may already be released */
        }
      }
      this.mouseIsDown = false;
      this.dragging = false;
      this.activePointerId = null;
      element.classList.remove('outzoom-dragging');
      // restore the controls unless Shift is still held (about to drag again).
      // when shiftRequired is false there's no shift tracking, so always restore.
      if (!shiftDown || !this.shiftRequired) {
        setControlsHidden(false);
      }
    };

    // begin a press that may turn into a drag. `eager`: grab the pointer right
    // away (used for video, where we must wrest it from the player at once).
    const beginDrag = (event, eager) => {
      this.mouseIsDown = true;
      this.dragging = false;
      this.wasMovement = false;
      this.activePointerId = event.pointerId;
      this.lastMousePos.set(event.clientX, event.clientY);
      this.startMousePos.set(event.clientX, event.clientY);
      // Snapshot the transform at drag-start so every move builds on a stable base.
      const cs = window.getComputedStyle(element);
      const t = cs.transform;
      dragOriginTransform = (t === 'none' || t === '') ? '' : t;
      dragTotalX = 0;
      dragTotalY = 0;
      const arT = this.transformationFromString(dragOriginTransform);
      dragOriginScaleX = arT ? (parseFloat(arT[0]) || 1) : 1;
      dragOriginScaleY = arT ? (parseFloat(arT[3]) || 1) : 1;
      // When Shift is not the drag trigger, hide video controls at drag-start
      // (instead of on keydown) so plain LMB drag still suppresses them.
      if (!this.shiftRequired) {
        setControlsHidden(true);
      }
      if (eager) {
        event.preventDefault();
        try {
          element.setPointerCapture(event.pointerId);
        } catch (e) {
          /* ignore */
        }
      }
    };

    if (isVideo) {
      // Track Shift globally so a zoomed video is drag-ready while it's held.
      on(
        document,
        'keydown',
        (event) => {
          if (event.key === 'Shift') {
            shiftDown = true;
            setControlsHidden(true);
          }
        },
        true,
      );
      on(
        document,
        'keyup',
        (event) => {
          if (event.key === 'Shift') {
            shiftDown = false;
            if (!this.dragging) {
              setControlsHidden(false);
            }
          }
        },
        true,
      );
    }

    // Kill native HTML5 drag-and-drop on the element itself too (belt-and-suspenders
    // alongside the document-level dragstart handler added above).
    on(element, 'dragstart', (event) => event.preventDefault(), true);

    // All elements (video and non-video) listen on document in capture phase
    // so we detect presses even when the element is covered by overlays.
    // For video: stop propagation immediately so the player doesn't react.
    // For non-video: if the element is covered use eager capture (take pointer
    //   ownership straight away); if it is the topmost hit use lazy capture so
    //   plain clicks / links are not hijacked.
    on(
      document,
      'pointerdown',
      (event) => {
        if (this.disabled) return;
        if (event.button !== 0) return;
        if (this.shiftRequired && !event.shiftKey) return;
        if (this.mouseIsDown) return; // already handling a drag
        const stack = document.elementsFromPoint(event.clientX, event.clientY);
        if (stack.indexOf(element) === -1) return;
        if (isVideo) {
          event.stopPropagation();
          beginDrag(event, true);
        } else {
          // Eager only when covered so the foreground element doesn't start
          // its own native drag before we can capture the pointer.
          const covered = stack[0] !== element;
          beginDrag(event, covered);
        }
      },
      true,
    );

    // Suppress the browser's native drag-and-drop icon while the drag
    // modifier is held so the system cursor doesn't flash on the user.
    on(
      document,
      'dragstart',
      (event) => {
        if (this.mouseIsDown || (this.shiftRequired && event.shiftKey)) {
          event.preventDefault();
        }
      },
      true,
    );

    const onPointerMove = (event) => {
      if (this.disabled) return;
      if (!this.mouseIsDown || event.pointerId !== this.activePointerId) {
        return;
      }

      if (!this.dragging) {
        const dx = event.clientX - this.startMousePos.x;
        const dy = event.clientY - this.startMousePos.y;
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
          return; // not a drag yet
        }
        // Real drag: grab the pointer now (no-op if already captured) and mark
        // movement so the trailing click gets swallowed.
        this.dragging = true;
        this.wasMovement = true;
        element.classList.add('outzoom-dragging');
        try {
          element.setPointerCapture(this.activePointerId);
        } catch (e) {
          /* ignore */
        }
      }

      event.preventDefault();
      // Accumulate TOTAL displacement from drag-start (not incremental deltas).
      // This makes drag resilient to external code (e.g. YouTube) that resets
      // the element's transform between events: every move re-applies the full
      // offset on top of the stable origin snapshot taken in beginDrag.
      dragTotalX += event.clientX - this.lastMousePos.x;
      dragTotalY += event.clientY - this.lastMousePos.y;
      // Divide by the origin scale so the element tracks the pointer correctly
      // when it has been zoomed (scale ≠ 1).
      const tx = dragOriginScaleX !== 0 ? dragTotalX / dragOriginScaleX : dragTotalX;
      const ty = dragOriginScaleY !== 0 ? dragTotalY / dragOriginScaleY : dragTotalY;
      element.style.transform = dragOriginTransform + ` translate(${tx}px,${ty}px)`;
      this.lastMousePos.set(event.clientX, event.clientY);
    };

    const onPointerUp = (event) => {
      if (this.disabled) return;
      if (event.pointerId === this.activePointerId) {
        endDrag();
      }
    };

    // Capture phase on document: fires before the player's controls/overlays, so
    // we reliably get the movement in every browser.
    on(document, 'pointermove', onPointerMove, true);
    on(document, 'pointerup', onPointerUp, true);
    on(document, 'pointercancel', onPointerUp, true);

    // swallow the click that ends a drag (so it doesn't toggle play / follow a link)
    on(
      element,
      'click',
      (event) => {
        const preventDefault = this.wasMovement;
        this.wasMovement = false;
        if (preventDefault) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true,
    );

    on(
      document,
      'keydown',
      (event) => {
        // user pressed escape while dragging
        if (this.mouseIsDown && event.keyCode == 27) {
          endDrag();
        }
      },
      true,
    );
  }

  /**
   * Called by Inzoom when Shift is pressed before any zoom has happened.
   * Propagates the shift state into the closure (hides video controls in Firefox
   * so the very first Shift+drag works without a prior zoom).
   */
  notifyShiftDown(isDown) {
    if (this._onShiftChange) {
      this._onShiftChange(isDown);
    }
  }

  /*
  returns an array of matrix values from a string 'matrix(1,0,0,1,0,0)'.
  */
  transformationFromString(transformationString) {
    let regex = /\((.*?),(.*?),(.*?),(.*?),(.*?),(.*?)\)/;
    let arTransform = transformationString.match(regex);
    if (arTransform && arTransform.length > 0) {
      return arTransform.slice(1);
    }
    return null;
  }

  getElementTransform(element) {
    let computedStyle = window.getComputedStyle(element);
    let transform = computedStyle.transform;
    if (transform === '' || transform === 'none') {
      transform = 'matrix(1,0,0,1,0,0)';
    }
    return this.transformationFromString(transform);
  }
}

class Utils {
  /**
   * Returns an inline style (element.style) as a plain object. Works in both FX
   * and Chrome. Useful for backing up user-defined inline-style.
   */
  static getElementInlineStyle(element) {
    var style = element.style;
    var result = {};
    for (let i = 0; i < element.style.length; i++) {
      let propName = style.item(i);
      result[propName] = style.getPropertyValue(propName);
    }
    return result;
  }

  static getElementComputedStyle(element, pseudoElement = null) {
    return getComputedStyle(element, pseudoElement);
  }

  /**
   * If an element is 'imprisoned' (e.g. in a div with overflow:hidden), clone it
   * to the body so it isn't clipped anymore.
   */
  static freeElement(elem) {
    const bodyRect = document.body.getBoundingClientRect();
    const orygRect = elem.getBoundingClientRect();
    var clone = elem.cloneNode(true);
    clone.classList.add('outzoom-clone-freed');
    // Store a reference back so reset can restore the original.
    clone._outzoomOriginalElement = elem;
    document.querySelector('body').appendChild(clone);
    clone.style.position = 'absolute';
    clone.style.left = orygRect.left + 'px';
    clone.style.top = orygRect.top + Math.abs(bodyRect.top) + 'px';
    // Lock the visual size to what the element actually occupied in the page.
    // Without this, percentage/container-relative sizes recalculate against
    // the body and the clone appears at its natural (often much larger) size.
    clone.style.width = orygRect.width + 'px';
    clone.style.height = orygRect.height + 'px';
    // Remove any transform that was already applied (e.g. from a prior zoom):
    // the clone starts at the correct position and size, so transform resets to none.
    clone.style.transform = '';
    // Hide the original so it doesn't show as a duplicate behind the clone.
    elem.style.visibility = 'hidden';
    return clone;
  }
}

/**
 * Builds an array of an element and its parents (and their computed styles) to
 * answer questions like "is any parent overflow:hidden?".
 */
class ElementStudy {
  constructor(element = null) {
    this.parents = [];
    if (element) {
      this.prepare(element);
    }
  }

  prepare(element) {
    this.element = element;
    let curElement = element;
    let index = 0;
    while (curElement != null) {
      const info = {};
      info.element = curElement;
      info.computedStyle = getComputedStyle(curElement);
      info.index = index;
      this.parents.push(info);
      curElement = curElement.parentElement;

      index++;
      if (index > 100) {
        break; // defensive
      }
    }
  }

  isInprisoned() {
    console.assert(this.parents.length !== 0, 'forgot to call .prepare?');
    for (var i = 1; i < this.parents.length; i++) {
      const info = this.parents[i];
      const tagName = info.element.tagName.toLowerCase();
      if (tagName !== 'html' && tagName !== 'body') {
        if (
          info.computedStyle['overflow'] !== 'visible' ||
          info.computedStyle['overflow-x'] !== 'visible' ||
          info.computedStyle['overflow-y'] !== 'visible'
        ) {
          return true;
        }
      }
    }
    return false;
  }
}

export class Inzoom {
  constructor(config) {
    this.config = config;
    this.curElement = null;
    this.curElementOryginalStyle = null;
    this.curElementOryginalComputedStyle = null;
    this.lastZIndex = 0;
    this.lastFrontElement = null;
    this.mousePos = new Point();
    this.testMode = false;
    this.contextMenuEvent = null;
    // Extra trigger key state (for non-mouse-button keys).
    this.extraKeyHeld = false;
    // Set to true when a wheel-zoom fired with RMB held, so we can swallow
    // the contextmenu event that fires when the button is released.
    this.rmbZoomed = false;
    // Lightbox overlay state.
    this._lightbox = null;
    this._lightboxOriginal = null;
    this._lightboxIsVideo = false;
    this._lightboxVideoPlaceholder = null;
    this._lightboxVideoOriginalStyles = null;
  }

  /**
   * Like Utils.freeElement but for <video>: moves the real element to <body>
   * (positioned absolutely at its current screen location) instead of cloning,
   * so playback continues uninterrupted. Stores metadata for reset.
   */
  _freeVideo(element) {
    const bodyRect = document.body.getBoundingClientRect();
    const orygRect = element.getBoundingClientRect();
    // Insert an invisible placeholder so the parent container doesn't collapse
    // when the video is moved out of it.
    // Use offsetWidth/offsetHeight — these reflect the layout size BEFORE any
    // CSS transform, so a zoomed video still produces a correctly-sized placeholder.
    const placeholder = document.createElement('div');
    placeholder.style.width      = element.offsetWidth  + 'px';
    placeholder.style.height     = element.offsetHeight + 'px';
    placeholder.style.visibility = 'hidden';
    element.parentNode.insertBefore(placeholder, element);
    element._outzoomVideoPlaceholder = placeholder;
    element._outzoomVideoOrigStyles  = {
      position:  element.style.position,
      left:      element.style.left,
      top:       element.style.top,
      width:     element.style.width,
      height:    element.style.height,
      transform: element.style.transform,
    };
    element.style.position  = 'absolute';
    element.style.left      = orygRect.left + 'px';
    element.style.top       = (orygRect.top + Math.abs(bodyRect.top)) + 'px';
    element.style.width     = orygRect.width  + 'px';
    element.style.height    = orygRect.height + 'px';
    element.style.transform = '';
    element.classList.add('outzoom-clone-freed');
    document.body.appendChild(element);
    return element;
  }

  /**
   * Open a fixed-position lightbox for `element`.
   * - Non-video: cloned into the lightbox; original hidden.
   * - Video: the real element is MOVED into the lightbox so playback
   *   continues uninterrupted; on close it is moved back.
   * Works on any site regardless of stacking context or overflow clipping.
   */
  openLightbox(element) {
    this.closeLightbox();

    const backdrop = document.createElement('div');
    backdrop.className = 'outzoom-lightbox';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'outzoom-lightbox-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.closeLightbox());

    const content = document.createElement('div');
    content.className = 'outzoom-lightbox-content';

    const isVideo = element.tagName === 'VIDEO';
    let displayElement;

    if (isVideo) {
      // Move the real video element — cloneNode loses playback state and
      // shows only the first frame.
      displayElement = element;
      this._lightboxIsVideo = true;
      // Leave a placeholder so the parent container keeps its shape while
      // the video is displayed in the lightbox.
      // offsetWidth/offsetHeight = layout size before CSS transform.
      const ph = document.createElement('div');
      ph.style.width      = element.offsetWidth  + 'px';
      ph.style.height     = element.offsetHeight + 'px';
      ph.style.visibility = 'hidden';
      element.parentNode.insertBefore(ph, element);
      this._lightboxVideoPlaceholder = ph;
      // Save inline styles we are about to override so we can restore them.
      this._lightboxVideoOriginalStyles = {
        transform: element.style.transform,
        position:  element.style.position,
        width:     element.style.width,
        height:    element.style.height,
        maxWidth:  element.style.maxWidth,
        maxHeight: element.style.maxHeight,
      };
      element.style.transform = '';
      element.style.position  = '';
      element.style.width     = '';
      element.style.height    = '';
      element.style.maxWidth  = '';
      element.style.maxHeight = '';
    } else {
      // Clone images / backgrounds / SVG / canvas.
      displayElement = element.cloneNode(true) as HTMLElement;
      displayElement.classList.add('outzoom-clone-freed');
      (displayElement as any)._outzoomOriginalElement = element;
      displayElement.style.transform = '';
      displayElement.style.position  = '';
      displayElement.style.width     = '';
      displayElement.style.height    = '';
      displayElement.style.maxWidth  = '';
      displayElement.style.maxHeight = '';
      element.style.visibility = 'hidden';
    }

    content.appendChild(displayElement);
    backdrop.appendChild(closeBtn);
    backdrop.appendChild(content);
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target === content) {
        this.closeLightbox();
      }
    });

    this._lightbox         = backdrop;
    this._lightboxOriginal = element;
    this.curElement                      = displayElement;
    this.lastFrontElement                = displayElement;
    this.curElementOryginalStyle         = Utils.getElementInlineStyle(displayElement);
    this.curElementOryginalComputedStyle = Utils.getElementComputedStyle(displayElement);

    if (this.config.get('dragging.enabled') === true) {
      if (typeof (displayElement as any).outzoomDraggableInstance === 'undefined') {
        (displayElement as any).outzoomDraggableInstance = new ElementDraggable(displayElement, this._makeShiftRequired());
      }
    }

    return displayElement;
  }

  /**
   * Close the lightbox and restore the original element.
   */
  closeLightbox() {
    if (!this._lightbox) return;

    if (this._lightboxOriginal) {
      if (this._lightboxIsVideo) {
        // Restore the styles we overrode.
        const s = this._lightboxVideoOriginalStyles || {};
        this._lightboxOriginal.style.transform = s.transform || '';
        this._lightboxOriginal.style.position  = s.position  || '';
        this._lightboxOriginal.style.width     = s.width     || '';
        this._lightboxOriginal.style.height    = s.height    || '';
        this._lightboxOriginal.style.maxWidth  = s.maxWidth  || '';
        this._lightboxOriginal.style.maxHeight = s.maxHeight || '';
        // Move the video back before the placeholder, then remove it.
        if (this._lightboxVideoPlaceholder) {
          this._lightboxVideoPlaceholder.parentNode?.insertBefore(
            this._lightboxOriginal,
            this._lightboxVideoPlaceholder,
          );
          this._lightboxVideoPlaceholder.remove();
          this._lightboxVideoPlaceholder = null;
        }
        // Detach the draggable we attached in the lightbox so the grab-cursor
        // and listeners don't persist on the video after it returns to the page.
        if ((this._lightboxOriginal as any).outzoomDraggableInstance) {
          (this._lightboxOriginal as any).outzoomDraggableInstance.detach();
          delete (this._lightboxOriginal as any).outzoomDraggableInstance;
        }
      } else {
        this._lightboxOriginal.style.visibility = '';
      }
      this._lightboxOriginal = null;
    }

    this._lightbox.remove();
    this._lightbox                   = null;
    this._lightboxIsVideo             = false;
    this._lightboxVideoPlaceholder    = null;
    this._lightboxVideoOriginalStyles = null;
    this.curElement = null;
  }

  // called when document ready and config loaded
  run() {
    try {
      document.body.addEventListener('wheel', (event) => this.onWheel(event), {
        passive: false,
      });
    } catch (error) {
      // happens rarely, e.g. on .svg documents opened directly in the browser
      return false;
    }
    document.addEventListener(
      'mousemove',
      (event) => {
        this.onMouseMove(event);
      },
      true,
    );

    document.addEventListener(
      'keydown',
      (event) => {
        // Track extra trigger key state (non-modifier keyboard keys).
        const extraKey = this.config.get('zoom.modifiers.extraKey');
        if (extraKey && extraKey !== 'rmb' && extraKey !== 'mmb') {
          if (event.keyCode == extraKey) {
            this.extraKeyHeld = true;
          }
        }
        this.onKeyDown(event);
      },
      true,
    );

    document.addEventListener(
      'keyup',
      (event) => {
        const extraKey = this.config.get('zoom.modifiers.extraKey');
        if (extraKey && extraKey !== 'rmb' && extraKey !== 'mmb') {
          if (event.keyCode == extraKey) {
            this.extraKeyHeld = false;
          }
        }
      },
      true,
    );

    if (insideExtension) {
      // re-read config if it changed in storage
      chrome.storage.onChanged.addListener(() => {
        this.config.clearAll(false).load();
      });

      chrome.runtime.onMessage.addListener((event) => {
        this.onMessage(event);
      });

      // store right-click coordinates for later context-menu commands
      document.addEventListener(
        'click',
        (event) => {
          if (event.button === 2) {
            this.saveContextMenuEvent(event);
          }
        },
        true,
      );

      document.addEventListener(
        'contextmenu',
        (event) => {
          // Swallow the context menu that fires when RMB is released after
          // being used as a zoom trigger (scroll happened while button was held).
          if (this.rmbZoomed) {
            this.rmbZoomed = false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          this.saveContextMenuEvent(event);
        },
        true,
      );
    }
  }

  getElementInfo(element) {
    let result = {
      type: null, // img, background-image, ...
      element: null,
    };
    if (!element) return result;
    const tag = element.tagName?.toLowerCase();

    if (tag === 'img') {
      result.type = 'img';
      result.element = element;
    }

    if (result.type === null && tag === 'svg') {
      result.type = 'svg';
      result.element = element;
    }

    if (result.type === null && tag === 'canvas') {
      result.type = 'canvas';
      result.element = element;
    }

    if (result.type === null) {
      const computedStyle = window.getComputedStyle(element);
      if (computedStyle.backgroundImage && computedStyle.backgroundImage !== 'none') {
        result.type = 'background-image';
        result.element = element;
      }
    }

    if (result.type === null && tag === 'video') {
      result.type = 'video';
      result.element = element;
    }
    return result;
  }

  /*
  tries to find a target element (e.g. image) to zoom.
  */
  findElement(element, point) {
    let result = { type: null, element: null };
    if (element != null) {
      result = this.getElementInfo(element);
    }
    if (result.type === null) {
      result = this.findElement2(document, point);
    }
    return result;
  }

  /*
  uses the mouse pointer to find all the elements under the cursor, recursing
  into shadow roots.
  */
  findElement2(root, point) {
    let result = { type: null, element: null };
    const elements = root.elementsFromPoint(point.x, point.y);

    for (const el of elements) {
      if (el.shadowRoot) {
        result = this.findElement2(el.shadowRoot, point);
        if (result.type !== null) break;
      }
      result = this.getElementInfo(el);
      if (result.type !== null) break;
    }

    return result;
  }

  /**
   * specific to using the mouse wheel; otherwise call runCommand directly.
   */
  zoomElement(elementInfo, deltaX, deltaY, cursorX?, cursorY?) {
    let enlarge = null;
    if (this.config.get('zoom.wheel.direction') == 0) {
      enlarge = deltaY > 0;
    } else {
      enlarge = deltaY < 0;
    }
    let ratio = enlarge ? 1.1 : 0.9;
    this.runCommand(elementInfo, {
      action: 'transform',
      data: `scale(${ratio},${ratio})`,
      cursorX,
      cursorY,
    });
  }

  findAndZoom(element, event, deltaX, deltaY) {
    const found = this.findElement(element, new Point(event.clientX, event.clientY));
    if (found.element) {
      this.zoomElement(found, deltaX, deltaY, event.clientX, event.clientY);
    }
  }

  /**
   * Used by onWheel, onContextMenu and others.
   */
  runCommand(elementInfo, command) {
    if (!elementInfo.element) {
      if (app.isDev()) {
        console.log('elementInfo is empty');
      }
      return false;
    }
    let element = elementInfo.element;
    if (command.action === 'transform') {
      let makeDraggable = false;

      let curElementChanged = this.curElement !== element;
      this.curElement = element;
      const transitionDuration = 300; // ms

      if (curElementChanged) {
        makeDraggable = true;
        this.curElementOryginalStyle = Utils.getElementInlineStyle(element);
        this.curElementOryginalComputedStyle =
          Utils.getElementComputedStyle(element);
      }

      // smooth transition for context-menu invocations
      if (command.invokeInfo && command.invokeInfo.reason === 'contextmenu') {
        element.style.transitionProperty = 'transform';
        element.style.transitionDuration = `${transitionDuration}ms`;

        setTimeout(() => {
          element.style.transitionProperty =
            this.curElementOryginalStyle['transition-property'] || '';
          element.style.transitionDuration =
            this.curElementOryginalStyle['transition-duration'] || '';
        }, transitionDuration);
      }
      let computedStyle = window.getComputedStyle(element);
      let transform = computedStyle.transform;
      if (transform === '' || transform === 'none') {
        transform = 'matrix(1,0,0,1,0,0)';
      }

      // Zoom toward cursor: keep the point under the mouse fixed instead of
      // always zooming around the element's center.
      // Math: after scaling by r around the element's center, a point that was
      // at offset (ox, oy) from the center moves to (ox*r, oy*r). To fix it we
      // prepend a translate of (ox*(1-r), oy*(1-r)) in the element's local
      // coordinate space (i.e. divided by the current CSS scale).
      if (
        this.config.get('zoom.wheel.zoomToCursor') === true &&
        command.cursorX !== undefined && command.cursorY !== undefined
      ) {
        const rect = element.getBoundingClientRect();
        const cx = command.cursorX - (rect.left + rect.width  / 2);
        const cy = command.cursorY - (rect.top  + rect.height / 2);
        const m  = new DOMMatrix(transform);
        const sx = m.a || 1;
        const sy = m.d || 1;
        // Extract the ratio from command.data ("scale(r,r)")
        const rm = command.data.match(/scale\(([\d.]+)/);
        const r  = rm ? parseFloat(rm[1]) : 1;
        const tx = cx * (1 - r) / sx;
        const ty = cy * (1 - r) / sy;
        element.style.transform = transform + ` translate(${tx}px,${ty}px) ${command.data}`;
      } else {
        element.style.transform = transform + ' ' + command.data;
      }
      // dragging
      if (makeDraggable && this.config.get('dragging.enabled') === true) {
        if (typeof element.outzoomDraggableInstance === 'undefined') {
          element.outzoomDraggableInstance = new ElementDraggable(element, this._makeShiftRequired());
        }
      }
    }

    // restore original style
    if (command.action === 'reset') {
      if (element && element.classList.contains('outzoom-clone-freed')) {
        if (element._outzoomVideoPlaceholder) {
          // This is a moved video (not a clone) — restore styles and put it
          // back before its placeholder, then remove the placeholder.
          const s = element._outzoomVideoOrigStyles || {};
          element.style.position  = s.position  || '';
          element.style.left      = s.left      || '';
          element.style.top       = s.top       || '';
          element.style.width     = s.width     || '';
          element.style.height    = s.height    || '';
          element.style.transform = s.transform || '';
          element.classList.remove('outzoom-clone-freed');
          const ph = element._outzoomVideoPlaceholder;
          ph.parentNode?.insertBefore(element, ph);
          ph.remove();
          if (element.outzoomDraggableInstance) {
            element.outzoomDraggableInstance.detach();
            delete element.outzoomDraggableInstance;
          }
          delete element._outzoomVideoPlaceholder;
          delete element._outzoomVideoOrigStyles;
        } else if (element._outzoomOriginalElement) {
          // It's a clone — restore the original's visibility and remove the clone.
          element._outzoomOriginalElement.style.visibility = '';
          element.remove();
        } else {
          element.remove();
        }
        return;
      }
      if (element && element === this.curElement) {
        this.curElement.style.transform = this.curElementOryginalStyle.transform || '';
        this.curElement.style.position = this.curElementOryginalStyle.position || '';
        this.curElement.style['z-index'] =
          this.curElementOryginalStyle['z-index'] || '';
        // Detach the draggable so the grab-cursor and drag listeners stop
        // responding. On the next zoom the element gets a fresh instance.
        if (element.outzoomDraggableInstance) {
          element.outzoomDraggableInstance.detach();
          delete element.outzoomDraggableInstance;
        }
        this.curElement = null;
      }
    }

    // bring to front
    if (command.action === 'front') {
      if (element) {
        // Lightbox mode: open in a fixed overlay (works on any site,
        // any stacking context). Enabled via options checkbox.
        if (this.config.get('front.lightbox') === true) {
          this.openLightbox(element);
          return;
        }

        // Default mode: z-index / freeElement approach.
        let curElementChanged = this.curElement !== element;
        this.curElement = element;
        if (curElementChanged) {
          this.curElementOryginalStyle = Utils.getElementInlineStyle(element);
          this.curElementOryginalComputedStyle =
            Utils.getElementComputedStyle(element);
        }

        const es = new ElementStudy(element);
        const isInprisoned = es.isInprisoned();

        if (isInprisoned) {
          let freed;
          if (element.tagName === 'VIDEO') {
            // Move the real video element instead of cloning so playback
            // continues. Position it absolutely at the same screen location.
            freed = this._freeVideo(element);
          } else {
            freed = Utils.freeElement(element);
          }
          if (freed) {
            let changeZindexTo = this.lastZIndex + 1000000;
            freed.style['z-index'] = changeZindexTo;
            if (this.config.get('dragging.enabled') === true) {
              if (typeof freed.outzoomDraggableInstance === 'undefined') {
                freed.outzoomDraggableInstance = new ElementDraggable(freed, this._makeShiftRequired());
              }
            }
            this.lastFrontElement = freed;
            this.curElement = freed;
            this.curElementOryginalStyle = Utils.getElementInlineStyle(freed);
            this.curElementOryginalComputedStyle = Utils.getElementComputedStyle(freed);
          }
          return;
        }

        // z-index only works on positioned elements
        let changePositionTo = null;
        let changeZindexTo = this.lastZIndex + 1000000;
        const orygComputedStyle = Utils.getElementComputedStyle(element);
        if (orygComputedStyle) {
          if (orygComputedStyle.position === 'static') {
            changePositionTo = 'relative';
          }
          let orygZindex = orygComputedStyle['z-index'];
          if (!isNaN(parseFloat(orygZindex)) && isFinite(orygZindex)) {
            changeZindexTo = parseFloat(orygZindex) + 1000000;
          }
        }
        this.lastZIndex = changeZindexTo;
        if (changePositionTo) {
          element.style['position'] = changePositionTo;
        }
        element.style['z-index'] = changeZindexTo;
        if (this.config.get('dragging.enabled') === true) {
          if (typeof element.outzoomDraggableInstance === 'undefined') {
            element.outzoomDraggableInstance = new ElementDraggable(element, this._makeShiftRequired());
          }
        }
        this.lastFrontElement = element;
      }
    }
  }

  // wheel somewhere on the page (body)
  onWheel(event) {
    const shiftReq = this.config.get('zoom.modifiers.shift');
    const ctrlReq  = this.config.get('zoom.modifiers.ctrl');
    const altReq   = this.config.get('zoom.modifiers.alt');
    const extraKey = this.config.get('zoom.modifiers.extraKey');

    // Modifier checkboxes work as a group (all checked ones must be held).
    const anyModifierRequired = shiftReq || ctrlReq || altReq;
    const modifiersMatch =
      (!shiftReq || event.shiftKey) &&
      (!ctrlReq  || event.ctrlKey)  &&
      (!altReq   || event.altKey);

    // Extra trigger is an independent alternative: RMB, MMB, or a keyboard key.
    // event.buttons is a bitmask of currently-held mouse buttons (MouseEvent API).
    let extraMatch = false;
    if (extraKey === 'rmb') {
      extraMatch = !!(event.buttons & 2);
      if (extraMatch) {
        // Mark so the contextmenu event (fired on RMB release) gets suppressed.
        this.rmbZoomed = true;
      }
    } else if (extraKey === 'mmb') {
      extraMatch = !!(event.buttons & 4);
    } else if (extraKey) {
      extraMatch = this.extraKeyHeld;
    }

    // If at least one trigger is configured, at least one must be satisfied.
    // With nothing configured at all, every scroll zooms (legacy behaviour).
    if (anyModifierRequired || extraKey) {
      const modifierTrigger = anyModifierRequired && modifiersMatch;
      if (!modifierTrigger && !extraMatch) return;
    }

    event.preventDefault();
    // Normalize to a signed step: positive = zoom in (scroll up),
    // negative = zoom out (scroll down). WheelEvent.deltaY is positive when
    // scrolling down, so we flip the sign. Fall back to deltaX for pure
    // horizontal trackpad swipes.
    const deltaY =
      event.deltaY !== 0 ? -Math.sign(event.deltaY) : -Math.sign(event.deltaX);
    this.findAndZoom(event.target, event, 0, deltaY);
  }

  onMouseMove(event) {
    this.mousePos.set(event.clientX, event.clientY);
  }

  onKeyDown(event) {
    const activeEl = event.target;

    let userIsTypingText = false;
    if (activeEl) {
      const tagName = activeEl.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') {
        userIsTypingText = true;
      }
    }

    // On the first Shift press, attach draggable to whatever element is under the
    // cursor — even if it has never been zoomed. This lets the user Shift+drag
    // right away without having to zoom first.
    // Also update curElement here so that a subsequent "bring to front" shortcut
    // targets this element, not the one from a previous operation.
    if (event.key === 'Shift' && !userIsTypingText && this.config.get('dragging.enabled') === true) {
      const elementInfo = this.findElement(null, this.mousePos);
      if (elementInfo.element) {
        const el = elementInfo.element;
        if (typeof el.outzoomDraggableInstance === 'undefined') {
          el.outzoomDraggableInstance = new ElementDraggable(el, this._makeShiftRequired());
        }
        // notifyShiftDown is only relevant when Shift is the actual drag trigger.
        if (this._makeShiftRequired()) {
          el.outzoomDraggableInstance.notifyShiftDown(true);
        }
        // Track as current element so keyboard shortcuts act on it.
        if (this.curElement !== el) {
          this.curElement = el;
          this.curElementOryginalStyle = Utils.getElementInlineStyle(el);
          this.curElementOryginalComputedStyle = Utils.getElementComputedStyle(el);
        }
      }
    }

    // 'reset' action (escape) — skip when the browser is about to use ESC
    // to exit fullscreen (video fullscreen + ESC would otherwise kick the user
    // out of fullscreen AND reset the zoom simultaneously).
    // If a lightbox is open, ESC closes it instead of doing a normal reset.
    if (event.keyCode == 27 && !document.fullscreenElement) {
      if (this._lightbox) {
        this.closeLightbox();
        return;
      }
      this.runCommand(this.findElement(null, this.mousePos), {
        action: 'reset',
      });
    }

    // 'front' action — only require that configured modifiers ARE held;
    // extra modifiers (e.g. Shift held for dragging) are ignored.
    if (
      (!this.config.get('front.modifiers.ctrl')  || event.ctrlKey) &&
      (!this.config.get('front.modifiers.shift') || event.shiftKey) &&
      (!this.config.get('front.modifiers.alt')   || event.altKey) &&
      this.config.get('front.key') == event.keyCode
    ) {
      if (!userIsTypingText) {
        event.preventDefault();
      }
      // Prefer curElement (the last element the user zoomed/dragged) so that
      // the shortcut works even when the element has been moved behind another
      // and is no longer reachable by a plain hit-test. Fall back to hit-test
      // when no element has been interacted with yet.
      const frontTarget = this.curElement
        ? this.getElementInfo(this.curElement)
        : this.findElement(null, this.mousePos);
      this.runCommand(frontTarget, { action: 'front' });
    }

    // Keyboard zoom in / zoom out / reset (configurable shortcuts, disabled by default).
    // Useful for zooming without the scroll wheel, e.g. Numpad +/−/0.
    if (!userIsTypingText && this.config.get('keyboardZoom.enabled') === true) {
      const kz = (action: string, delta: number) => {
        if (
          (!this.config.get(`keyboardZoom.${action}.modifiers.ctrl`)  || event.ctrlKey)  &&
          (!this.config.get(`keyboardZoom.${action}.modifiers.shift`) || event.shiftKey) &&
          (!this.config.get(`keyboardZoom.${action}.modifiers.alt`)   || event.altKey)   &&
          this.config.get(`keyboardZoom.${action}.key`) == event.keyCode
        ) {
          event.preventDefault();
          const found = this.findElement(null, this.mousePos);
          if (action === 'reset') {
            this.runCommand(found, { action: 'reset' });
          } else if (found.element) {
            this.zoomElement(found, 0, delta);
          }
        }
      };
      kz('in',    1);
      kz('out',  -1);
      kz('reset', 0);
    }

    // 'zoomFront' action — same loose modifier check as 'front'.
    if (
      this.config.get('zoomFront.enabled') === true &&
      (!this.config.get('zoomFront.modifiers.ctrl')  || event.ctrlKey) &&
      (!this.config.get('zoomFront.modifiers.shift') || event.shiftKey) &&
      (!this.config.get('zoomFront.modifiers.alt')   || event.altKey) &&
      this.config.get('zoomFront.key') == event.keyCode
    ) {
      if (!userIsTypingText) {
        event.preventDefault();
      }
      const elementInfo = this.curElement
        ? this.getElementInfo(this.curElement)
        : this.findElement(null, this.mousePos);
      this.runCommand(elementInfo, { action: 'front' });
      const frontedElementInfo = this.getElementInfo(this.lastFrontElement);
      const ratio = 1.5;
      this.runCommand(frontedElementInfo, {
        action: 'transform',
        data: `scale(${ratio},${ratio})`,
      });
    }
  }

  /**
   * Whether ElementDraggable instances should require Shift for dragging.
   * Returns false when an extra trigger key is configured (the user has moved
   * away from keyboard-modifier zoom, so plain LMB drag makes more sense).
   */
  _makeShiftRequired() {
    return this.config.get('zoom.modifiers.shift') === true;
  }

  /**
   * A message sent e.g. by the background (a context menu command).
   */
  onMessage(message) {
    if (message.command) {
      /*
      We can get called for every frame on a page separately. Plus, if clicked
      inside a frame, this one frame gets called too. So we check whether the
      invocation url matches our url.
      */
      if (message.command.invokeInfo) {
        let invokeInfo = message.command.invokeInfo;
        let abort = false;
        if (invokeInfo.frameUrl && invokeInfo.frameUrl !== window.location.href) {
          abort = true;
        }
        if (!invokeInfo.frameUrl && invokeInfo.pageUrl !== window.location.href) {
          abort = true;
        }
        if (abort) {
          return false;
        }
      }

      if (message.command.action) {
        if (
          !this.contextMenuEvent ||
          typeof this.contextMenuEvent.clientX === 'undefined'
        ) {
          logger.log('context menu command but contextMenuEvent empty');
          return false;
        }
        let findResult = this.findElement2(
          document,
          new Point(this.contextMenuEvent.clientX, this.contextMenuEvent.clientY),
        );
        if (findResult.type) {
          this.runCommand(findResult, message.command);
        } else {
          logger.log('context menu command but no element found');
        }
      }
    }
  }

  /**
   * Fired on right-click / contextmenu. Remembers the click position for later
   * context-menu commands.
   */
  saveContextMenuEvent(event) {
    this.contextMenuEvent = {};
    for (var prop in event) {
      if (typeof event[prop] === 'object') {
        continue;
      }
      this.contextMenuEvent[prop] = event[prop];
    }
  }
}

/**
 * Initialise inzoom on the current document. Safe to call at document_start —
 * it waits for DOMContentLoaded if needed.
 */
export function initInzoom() {
  const start = () => {
    logger.log('init called in url:' + window.location.href);
    if (insideExtension) {
      // a page testing inzoom directly can disable it with:
      // <meta name="EnableOutZoomExtension" content="false">
      let enableInzoomMeta = document.querySelector('meta[name="EnableOutZoomExtension"]')?.getAttribute('content');
      if (enableInzoomMeta === 'false' || enableInzoomMeta === '0') {
        logger.log('outzoom init ABORTED (EnableOutZoomExtension is false)');
        return;
      }
    }
    logger.log('initing, inside extension: ', insideExtension);

    let configParams = {};
    if (insideExtension) {
      configParams = {
        storage: chrome.storage.local,
      };
    } else {
      configParams = {
        storage: null,
        default: app.defaultConfig,
      };
    }
    // config is re-read every time the user changes it in preferences.
    let config = new DotConfig(configParams);
    config.load(() => {
      let iz = new Inzoom(config);
      iz.run();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, false);
  } else {
    start();
  }
}
