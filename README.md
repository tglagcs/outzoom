# OutZoom

> Modern **Manifest V3** fork of [kpion/inzoom](https://github.com/kpion/inzoom),
> rebuilt with TypeScript and [WXT](https://wxt.dev) for current Chrome and Firefox.

Hover over an image or video, press <kbd>Shift</kbd> and use the mouse wheel to zoom
in and out. Once zoomed, hold <kbd>Shift</kbd> and drag to reposition the element.
Right-click for a context menu with zoom / rotate / bring-to-front / reset actions.

## Develop

Requires Node.js. The toolchain is [WXT](https://wxt.dev).

```bash
npm install          # also runs `wxt prepare`
npm run dev          # Chrome, with auto-reload
npm run dev:firefox  # Firefox, with auto-reload
```

## Build

```bash
npm run build            # -> .output/chrome-mv3
npm run build:firefox    # -> .output/firefox-mv3
npm run zip              # zipped artifact for the Chrome Web Store
npm run zip:firefox      # zipped artifact for AMO
```

Load unpacked from `.output/chrome-mv3` (`chrome://extensions`, Developer mode →
Load unpacked) or `.output/firefox-mv3` (`about:debugging` → This Firefox → Load
Temporary Add-on → pick `manifest.json`).

## Project layout

- `entrypoints/` — WXT entrypoints: `background.ts`, `content/`, `popup/`, `options/`
- `src/` — core: `inzoom.ts`, `config.ts`, `context-menu.ts`, `point.ts`,
  `app.ts`, `logger.ts`
- `static/` — static assets: `icon/`, plus the options-page test media
  (`test_photo.jpeg`, `sample.mp4`) and popup icons (`config.png`, `home.png`)

## Credits

Original extension by Konrad Papała (kpion) — [kpion/inzoom](https://github.com/kpion/inzoom).


