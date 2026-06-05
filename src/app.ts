/**
 * Common stuff shared among the extension parts (background, content, options,
 * popup), including the default configuration.
 */
export const app = {
  /**
   * Default configuration. Saved to storage.local on install and used from
   * there afterwards.
   */
  defaultConfig: {
    zoom: {
      modifiers: {
        shift: true,
        ctrl: false,
        alt: false,
        extraKey: '', // '' | 'rmb' | 'mmb' | keyCode string
      },
      wheel: {
        direction: 0,    // 0: normal, 1: reversed
        zoomToCursor: false, // zoom toward the cursor position instead of element center
      },
    },

    dragging: {
      enabled: true,
    },

    contextmenu: {
      enabled: true,
      tests: false,
    },

    // the 'bring to front' action
    front: {
      modifiers: {
        shift: false,
        ctrl: false,
        alt: true,
      },
      key: 65, // 'A'
      lightbox: false, // open in a fixed overlay instead of z-index manipulation
    },

    // the 'zoom in and bring to front' action
    zoomFront: {
      enabled: true,
      modifiers: {
        shift: false,
        ctrl: false,
        alt: true,
      },
      key: 90, // 'z'
    },

    // configurable keyboard shortcuts for zooming without the scroll wheel
    keyboardZoom: {
      enabled: false, // master switch
      in:    { modifiers: { shift: false, ctrl: false, alt: true }, key: 107 }, // Numpad +
      out:   { modifiers: { shift: false, ctrl: false, alt: true }, key: 109 }, // Numpad -
      reset: { modifiers: { shift: false, ctrl: false, alt: true }, key: 111 }, // Numpad /
    },

    tests: {},
  },

  // Driven by the build mode so dev logging and dev-only options are active in
  // `npm run dev` and silent in production builds.
  environment: (import.meta.env.DEV ? 'dev' : 'prod') as 'prod' | 'dev',

  isDev(): boolean {
    return !!(this.environment && this.environment.toUpperCase() === 'DEV');
  },
};
