// @ts-nocheck
import { app } from './app';
import { Logger } from './logger';
import type { DotConfig } from './config';

const logger = new Logger('outzoom ctx: ', app.isDev());

/**
 * OutZoom context menu (background side).
 */
export class InZoomContextMenu {
  /**
   * @param config a DotConfig **reference** (so it can be updated live).
   */
  constructor(config: DotConfig) {
    this.config = config;
    this.createCommands();
  }

  createCommands() {
    this.commands = {
      zoomIn: {
        title: 'Zoom in',
        action: 'transform',
        data: 'scale(1.2,1.2)',
      },

      zoomOut: {
        title: 'Zoom out',
        action: 'transform',
        data: 'scale(0.8,0.8)',
      },

      separator1: {
        type: 'separator',
      },

      rotateLeft: {
        title: 'Rotate 90° left',
        action: 'transform',
        data: 'rotate(-90deg)',
      },

      rotateRight: {
        title: 'Rotate 90° right',
        action: 'transform',
        data: 'rotate(90deg)',
      },

      rotate180: {
        title: 'Rotate 180°',
        action: 'transform',
        data: 'rotate(180deg)',
      },

      separator2: {
        type: 'separator',
      },

      front: {
        title: 'Bring to front',
        action: 'front',
        data: '',
      },

      reset: {
        title: 'Reset (esc)',
        action: 'reset',
        data: '',
      },
    };

    if (this.config.get('contextmenu.tests')) {
      this.commands.tests = {
        title: 'Tests (45°)',
        action: 'transform',
        data: 'rotate(45deg)',
      };
    }
  }

  /**
   * @param onlyIfEnabledInConfig - default true; if false, ignore the
   * "no menu please" config setting.
   */
  create(onlyIfEnabledInConfig = true) {
    // just in case something changed in 'config'
    this.createCommands();

    logger.log('create ctx menu called');
    if (
      this.config &&
      this.config.get('contextmenu.enabled') == false &&
      onlyIfEnabledInConfig
    ) {
      logger.log('  aborting');
      return false;
    }

    // chrome allows: all, page, frame, selection, link, editable, image,
    // video, audio, launcher, browser_action, page_action
    const contexts = [
      'audio',
      'editable',
      'frame',
      'image',
      'link',
      'page',
      'selection',
      'video',
    ];

    chrome.contextMenus.create({
      id: 'outzoom-root',
      title: 'In Zoom',
      contexts,
    });

    Object.keys(this.commands).forEach((id) => {
      const command = this.commands[id];
      chrome.contextMenus.create({
        parentId: 'outzoom-root',
        id,
        title: command.title,
        type: command.type || 'normal',
        // contexts are NOT inherited from parent in chrome, so set them here too
        contexts,
      });
    });
  }

  recreate() {
    this.removeAll();
    return this.create();
  }

  getCommand(id) {
    return this.commands[id] || null;
  }

  removeAll() {
    logger.log('  ctx: removing');
    chrome.contextMenus.removeAll();
  }

  /**
   * Register the onClicked listener. Should be called once per background start.
   */
  startListening() {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      const command = this.getCommand(info.menuItemId);
      if (command && tab && tab.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, {
          command: {
            id: info.menuItemId,
            action: command.action,
            data: command.data,

            // useful to determine if we should actually process this command
            invokeInfo: {
              pageUrl: info.pageUrl,
              frameUrl: info.frameUrl,
              reason: 'contextmenu',
            },
          },
        });
      }
    });
  }
}
