// @ts-nocheck
import './style.css';
// the draggable/modal styles, so zooming can be tested on this page too
import '../content/style.css';

import { app } from '@/src/app';
import { DotConfig } from '@/src/config';
import { Logger } from '@/src/logger';
import { initInzoom } from '@/src/inzoom';

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const translations = {
  en: {
    subtitle:              'Tests &amp; Configuration',
    homeLink:              'Home page &amp; Source',
    testsH2:               'Tests area',
    testsNote:             'Hover mouse over the video or image, press the modifier key(s) and use mouse wheel to zoom in or out.<br /><br />Hold <kbd>Shift</kbd> and drag to reposition the element (for a video this also keeps the player\'s own controls working when Shift is not held).<br /><br />Press <kbd>Escape</kbd> while hovering over an element to reset it to its original size and position.',
    configH2:              'Configuration',
    h3ZoomModifiers:       'Zoom Modifiers',
    labelExtraTrigger:     'Extra trigger:',
    noteZoomModifiers:     'Remember to <b>not</b> choose keys which already do something on your system, as this extension will probably not even get the notification.<br />E.g. on KDE alt key and mouse actions are reserved for windows moving/resizing. This is a pretty common issue being reported.',
    h3Wheel:               'Wheel',
    labelReverseDirection: 'Reverse direction',
    h3ZoomPosition:        'Zoom position',
    labelZoomToCursor:     'Zoom toward cursor (like Windows Photo Viewer)',
    noteZoomPosition:      "When enabled, the point under the cursor stays fixed while zooming. By default the element's center is used as the zoom origin.",
    h3Dragging:            'Dragging',
    labelEnableDragging:   'Enable dragging',
    noteDragging:          'After you zoom in/out an element, it becomes draggable so you can reposition it within its container.',
    h3KeyboardZoom:        'Keyboard zoom',
    labelEnableKeyboardZoom: 'Enable keyboard zoom shortcuts',
    shortcutZoomIn:        'Zoom in',
    shortcutZoomOut:       'Zoom out',
    shortcutReset:         'Reset',
    noteKeyboardZoom:      'Zoom in, zoom out and reset using keyboard shortcuts instead of (or in addition to) the scroll wheel. Useful in fullscreen or on devices without a scroll wheel.',
    h3ContextMenu:         'Context menu',
    labelContextMenu:      'Add context menu actions',
    noteContextMenu:       'Useful on Chrome/Opera and sites that override the default context menu (e.g. YouTube on video elements).',
    h3Front:               'Bringing to front',
    labelLightbox:         'Open in lightbox overlay',
    noteFront:             'While hovering over a covered image, press this shortcut to bring it to the front. When lightbox is enabled the element opens in a fullscreen overlay that works on any site.',
    h3ZoomFront:           'Alternative zooming: zoom in and bring to front',
    labelZoomFrontEnable:  'Enable',
    noteZoomFront:         'While hovering over a covered image, press this shortcut to both zoom in and bring it to the front.',
    h3Dev:                 'Developer stuff',
    btnResetOptions:       'Reset to defaults',
    labelTestsAction:      "Add 'tests' action",
    btnClearOptions:       'Clear options',
    noteDev:               "Probably useless, because this doesn't happen in real scenarios",
    h3Help:                'Help',
    helpText:              'Found a bug or have a suggestion? File an issue on <a href="https://github.com/tglagcs/outzoom">github.com/tglagcs/outzoom</a>.',
  },
  ru: {
    subtitle:              'Тесты и настройки',
    homeLink:              'Главная и исходный код',
    testsH2:               'Тестовая область',
    testsNote:             'Наведите мышь на видео или изображение, зажмите клавишу-модификатор и используйте колесо мыши для увеличения или уменьшения.<br /><br />Удерживайте <kbd>Shift</kbd> и перетащите для перемещения элемента (для видео это также оставляет рабочими встроенные элементы управления, когда Shift не зажат).<br /><br />Нажмите <kbd>Escape</kbd>, наведя курсор на элемент, чтобы сбросить его исходный размер и положение.',
    configH2:              'Настройки',
    h3ZoomModifiers:       'Модификаторы зума',
    labelExtraTrigger:     'Доп. триггер:',
    noteZoomModifiers:     'Старайтесь <b>не</b> выбирать клавиши, которые уже используются в системе — расширение может не получить событие.<br />Например, в KDE клавиша Alt зарезервирована для перемещения окон.',
    h3Wheel:               'Колесо мыши',
    labelReverseDirection: 'Инвертировать направление',
    h3ZoomPosition:        'Центр зума',
    labelZoomToCursor:     'Зум к курсору (как в Просмотре фотографий Windows)',
    noteZoomPosition:      'При включении точка под курсором остаётся фиксированной при зуме. По умолчанию центром зума является центр элемента.',
    h3Dragging:            'Перетаскивание',
    labelEnableDragging:   'Включить перетаскивание',
    noteDragging:          'После увеличения или уменьшения элемент становится перетаскиваемым — его можно перемещать внутри контейнера.',
    h3KeyboardZoom:        'Зум с клавиатуры',
    labelEnableKeyboardZoom: 'Включить горячие клавиши для зума',
    shortcutZoomIn:        'Увеличить',
    shortcutZoomOut:       'Уменьшить',
    shortcutReset:         'Сброс',
    noteKeyboardZoom:      'Увеличение, уменьшение и сброс с помощью горячих клавиш вместо колеса мыши (или в дополнение к нему). Полезно в полноэкранном режиме или на устройствах без колеса мыши.',
    h3ContextMenu:         'Контекстное меню',
    labelContextMenu:      'Добавить действия в контекстное меню',
    noteContextMenu:       'Полезно в Chrome/Opera и на сайтах с кастомным контекстным меню (например YouTube для видео).',
    h3Front:               'Вынести на передний план',
    labelLightbox:         'Открыть в лайтбокс-оверлее',
    noteFront:             'Наводя курсор на перекрытое изображение, нажмите этот шорткат, чтобы вынести его на передний план. При включённом лайтбоксе элемент открывается в полноэкранном оверлее — работает на любом сайте.',
    h3ZoomFront:           'Альтернативный зум: увеличить и вынести на передний план',
    labelZoomFrontEnable:  'Включить',
    noteZoomFront:         'Наводя курсор на перекрытое изображение, нажмите этот шорткат, чтобы одновременно увеличить его и вынести на передний план.',
    h3Dev:                 'Для разработчиков',
    btnResetOptions:       'Сбросить настройки',
    labelTestsAction:      "Добавить действие 'tests'",
    btnClearOptions:       'Очистить настройки',
    noteDev:               'Вероятно бесполезно, т.к. в реальных сценариях это не происходит',
    h3Help:                'Помощь',
    helpText:              'Нашли баг или есть предложение? Создайте issue на <a href="https://github.com/tglagcs/outzoom">github.com/tglagcs/outzoom</a>.',
  },
} as const;

type Lang = keyof typeof translations;

/**
 * Set the content of `el` from a translation string that may contain a small
 * safe subset of HTML (<b>, <kbd>, <br>, <a href>).  Uses a regex tokeniser
 * instead of innerHTML so AMO's no-unsanitized linter rule is satisfied and
 * there is no XSS surface even if a translation string were ever tainted.
 */
function setTranslation(el: HTMLElement, html: string): void {
  el.replaceChildren();
  const SAFE = new Set(['b', 'kbd', 'br', 'a', 'span']);
  const re = /<(\/?)([a-zA-Z]+)([^>]*)\/?>|([^<]+)/g;
  const stack: HTMLElement[] = [el];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, closing, tag, attrs, text] = m;
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      top.appendChild(document.createTextNode(
        text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
      ));
    } else {
      const t = tag.toLowerCase();
      if (!SAFE.has(t)) continue;
      if (closing) {
        if (stack.length > 1) stack.pop();
      } else if (t === 'br') {
        top.appendChild(document.createElement('br'));
      } else {
        const node = document.createElement(t);
        if (t === 'a') {
          const href = /href="([^"]*)"/.exec(attrs)?.[1] ?? '';
          if (href) node.setAttribute('href', href);
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
        top.appendChild(node);
        stack.push(node);
      }
    }
  }
}

function applyLang(lang: Lang) {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n') as keyof typeof translations['en'];
    const val = translations[lang][key];
    if (val !== undefined) setTranslation(el, val as string);
  });
  const btn = document.getElementById('langToggle') as HTMLButtonElement;
  if (btn) btn.textContent = lang === 'en' ? 'RU' : 'EN';
  localStorage.setItem('outzoom-lang', lang);
}

function initLang() {
  const saved = localStorage.getItem('outzoom-lang') as Lang | null;
  const lang: Lang = saved === 'ru' ? 'ru' : 'en';
  applyLang(lang);
  document.getElementById('langToggle')?.addEventListener('click', () => {
    const current = (localStorage.getItem('outzoom-lang') || 'en') as Lang;
    applyLang(current === 'en' ? 'ru' : 'en');
  });
}

// ---------------------------------------------------------------------------

function run() {
  const logger = new Logger('outzoom options: ', app.isDev());

  const form = document.querySelector('form#config');
  // defaults were already loaded into storage on install.
  const config = new DotConfig({
    storage: typeof chrome.storage !== 'undefined' ? chrome.storage.local : null,
    autoSave: false,
  });

  if (app.isDev()) {
    document.querySelectorAll('.only-in-dev,.only-in-dev-box').forEach((el) => {
      el.style.display = 'block';
    });
  }

  build(); // prepare keyboard-shortcut selects
  load();

  function message(text, className) {
    const lmsg = document.querySelector('#config .message');
    lmsg.textContent = text;
    lmsg.classList.remove('success', 'error');
    lmsg.classList.add(className);

    if (text === '') {
      lmsg.classList.add('hidden');
    } else {
      lmsg.classList.add('msg-visible');
      if (className == 'success') {
        setTimeout(() => {
          lmsg.classList.remove('msg-visible');
        }, 1500);
      }
    }
  }

  function load() {
    config.load(() => {
      document.querySelectorAll('form#config input').forEach((element) => {
        if (element.type === 'checkbox') {
          const check = config.get(element.name, false) != false;
          element.checked = check;
        } else if (element.type === 'text') {
          element.value = config.get(element.name);
        }
      });
      document.querySelectorAll('form#config select').forEach((element) => {
        element.value = config.get(element.name);
      });
    });
  }

  function save(showMessage = false) {
    document.querySelectorAll('form#config input').forEach((element) => {
      if (element.type === 'checkbox') {
        let val = false;
        if (element.checked) {
          val = element.value == 'on' ? true : element.value;
        }
        config.set(element.name, val);
      } else if (element.type === 'text') {
        config.set(element.name, element.value);
      }
    });
    document.querySelectorAll('form#config select').forEach((element) => {
      config.set(element.name, element.value);
    });
    config.save(() => {
      logger.log('form saved');
      if (showMessage) {
        message('Saved', 'success');
      }
    });
  }

  function build() {
    document.querySelectorAll('.shortcut-key').forEach((select) => {
      feedKeyboardShortcutSelect(select);
    });
    document.querySelectorAll('.extra-trigger-key').forEach((select) => {
      feedExtraTriggerSelect(select);
    });
    setupModifierRadioBehaviour();
  }

  // Only one modifier (Shift / Ctrl / Alt) can be active at a time within a
  // group. Checking one automatically unchecks the others in the same group.
  function setupModifierRadioBehaviour() {
    const groups = [
      ['zoom.modifiers.shift',          'zoom.modifiers.ctrl',          'zoom.modifiers.alt'],
      ['front.modifiers.shift',         'front.modifiers.ctrl',         'front.modifiers.alt'],
      ['zoomFront.modifiers.shift',     'zoomFront.modifiers.ctrl',     'zoomFront.modifiers.alt'],
      ['keyboardZoom.in.modifiers.shift',    'keyboardZoom.in.modifiers.ctrl',    'keyboardZoom.in.modifiers.alt'],
      ['keyboardZoom.out.modifiers.shift',   'keyboardZoom.out.modifiers.ctrl',   'keyboardZoom.out.modifiers.alt'],
      ['keyboardZoom.reset.modifiers.shift', 'keyboardZoom.reset.modifiers.ctrl', 'keyboardZoom.reset.modifiers.alt'],
    ];
    groups.forEach((names) => {
      const boxes = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          names.map((n) => `input[name="${n}"]`).join(', '),
        ),
      );
      boxes.forEach((cb) => {
        cb.addEventListener('change', () => {
          if (cb.checked) {
            boxes.forEach((other) => {
              if (other !== cb) other.checked = false;
            });
          }
        });
      });
    });
  }

  function feedExtraTriggerSelect(selectElement) {
    function add(code, text) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = text;
      selectElement.appendChild(opt);
    }
    add('', '— none —');
    add('rmb', 'Right mouse button');
    add('mmb', 'Middle mouse button');
    // letters
    for (let code = 65; code < 65 + 26; code++) {
      add(code, String.fromCharCode(code));
    }
    // digits
    for (let code = 48; code < 48 + 10; code++) {
      add(code, String.fromCharCode(code));
    }
    // specials
    const specials = [
      [13, 'Enter'],
      [32, 'Space'],
      [9, 'Tab'],
      [8, 'Backspace'],
      [45, 'Insert'],
      [46, 'Delete'],
      [36, 'Home'],
      [35, 'End'],
      [33, 'Page up'],
      [34, 'Page down'],
      [188, ','],
      [190, '.'],
      [219, '['],
      [221, ']'],
      [189, '-'],
      [187, '='],
    ];
    specials.forEach((item) => {
      add(item[0], item[1]);
    });
  }

  function feedKeyboardShortcutSelect(selectElement) {
    function add(code, text) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = text;
      selectElement.appendChild(opt);
    }
    // letters
    for (let code = 65; code < 65 + 26; code++) {
      add(code, String.fromCharCode(code));
    }
    // digits
    for (let code = 48; code < 48 + 10; code++) {
      add(code, String.fromCharCode(code));
    }
    // specials
    const specials = [
      [13, 'Enter'],
      [32, 'Space'],
      [9, 'Tab'],
      [8, 'Backspace'],
      [45, 'Insert'],
      [46, 'Delete'],
      [36, 'Home'],
      [35, 'End'],
      [33, 'Page up'],
      [34, 'Page down'],
      [188, ','],
      [190, '.'],
      [219, '['],
      [221, ']'],
      [189, '-'],
      [187, '='],
    ];
    specials.forEach((item) => add(item[0], item[1]));
    // Numpad operators only — digits (96–105) are skipped because
    // Alt+Numpad digit is intercepted by Windows for Alt-code character input.
    const numpad = [
      [107, 'Numpad +'],
      [109, 'Numpad −'],
      [106, 'Numpad *'],
      [111, 'Numpad /'],
    ];
    numpad.forEach((item) => add(item[0], item[1]));
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save(true);
  });

  form.addEventListener('change', function () {
    save();
  });

  document
    .querySelector('form#config #clear-options')
    ?.addEventListener('click', () => {
      if (
        confirm(
          "Are you sure you want to CLEAR the options? Which doesn't make great sense?",
        )
      ) {
        config.removeMainKey();
      }
    });

  // bring the default options back, i.e. just like a fresh install.
  document
    .querySelector('form#config #reset-options')
    ?.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset the options?')) {
        config.setAll(app.defaultConfig).save();
        message('Options reset to defaults.', 'success');
        setTimeout(() => {
          location.reload();
        }, 500);
      }
    });
}

window.addEventListener('DOMContentLoaded', () => {
  initLang();
  run();
  // allow testing zoom directly on this page (test image / video above)
  initInzoom();
});
