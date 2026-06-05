// Popup (browser action) logic.
import { browser } from 'wxt/browser';

document.querySelector('#openOptions')?.addEventListener('click', (ev) => {
  ev.preventDefault();
  browser.runtime.openOptionsPage();
  window.close();
});

// Anything with a data-url attribute opens that url in a new tab.
document.querySelectorAll<HTMLElement>('[data-url]').forEach((el) => {
  el.addEventListener('click', (ev) => {
    ev.preventDefault();
    const url = el.getAttribute('data-url');
    if (url) {
      browser.tabs.create({ url });
    }
    window.close();
  });
});
