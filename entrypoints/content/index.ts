import './style.css';
import { initInzoom } from '@/src/inzoom';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  cssInjectionMode: 'manifest',
  main() {
    initInzoom();
  },
});
