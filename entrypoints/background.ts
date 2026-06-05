// @ts-nocheck
import { app } from '@/src/app';
import { DotConfig } from '@/src/config';
import { InZoomContextMenu } from '@/src/context-menu';
import { Logger } from '@/src/logger';

/*
 * MV3 background. In Chrome this becomes a service worker; in Firefox a
 * background script. A service worker has NO DOM and does NOT keep global state
 * between wake-ups, so:
 *   - context menus are (re)created in onInstalled / onStartup, not on every wake
 *     (Chrome persists registered menus across SW restarts within a session);
 *   - listeners are registered synchronously at the top level on every start;
 *   - config defaults are applied idempotently (setMissing) in onInstalled.
 */
export default defineBackground(() => {
  const logger = new Logger('outzoom bkg: ', app.isDev());
  logger.log('starting background');

  // config - starting with defaults; real values are loaded from storage.
  const config = new DotConfig({
    storage: chrome.storage.local,
    autoSave: false,
    default: app.defaultConfig,
  });

  const contextMenu = new InZoomContextMenu(config);

  // (Re)build the context menu from scratch. removeAll() first makes this
  // idempotent (no "duplicate id" errors).
  async function rebuildMenu() {
    await config.loadAsync();
    await new Promise<void>((resolve) =>
      chrome.contextMenus.removeAll(() => resolve()),
    );
    contextMenu.create();
  }

  // --- listeners registered synchronously on every SW start ---

  contextMenu.startListening();

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    logger.log('message from content script: ', request);
    sendResponse({ text: 'Response from background script' });
  });

  chrome.runtime.onInstalled.addListener(async (details) => {
    logger.log('on install / update:', details);
    await config.loadAsync();

    if (details.reason === 'update' || details.reason === 'install') {
      // bring in any config keys introduced by a new version, then persist.
      config.setMissing(app.defaultConfig);
      await config.saveAsync();
    }

    await rebuildMenu();
  });

  // Browser restart: SW starts but onInstalled does not fire.
  if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      rebuildMenu();
    });
  }

  // React to config changes made on the options page.
  chrome.storage.onChanged.addListener((changes) => {
    if (!changes[config.getMainKey()]) {
      return;
    }
    const diff = config.diff(changes[config.getMainKey()].newValue);
    config.clearAll(false);
    config.load(() => {
      // only rebuild the menu if the context-menu config actually changed
      if (diff.contextmenu) {
        logger.log('context menu config changed, recreating');
        rebuildMenu();
      }
    });
  });
});
