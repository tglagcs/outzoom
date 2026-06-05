import { defineConfig } from 'wxt';

// Single Manifest V3 config for both Chrome and Firefox.
// WXT turns `defineBackground` into a `service_worker` (Chrome) or
// `background.scripts` (Firefox) automatically.
export default defineConfig({
  publicDir: 'static',
  manifestVersion: 3,
  manifest: {
    name: 'OutZoom',
    description:
      'Zoom in and out on images and videos using shift + mouse wheel and by other ways.',
    homepage_url: 'https://github.com/tglagcs/outzoom',
    permissions: ['storage', 'contextMenus'],
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
    action: {
      default_title: 'OutZoom — zoom in / out on images and videos',
    },
    // (The options page opens in a full tab - configured via a meta tag in
    // entrypoints/options/index.html, since WXT owns the options_ui key.)
    // Required for Firefox to keep a stable add-on id.
    browser_specific_settings: {
      gecko: {
        id: 'outzoom@tglagcs.github.io',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
