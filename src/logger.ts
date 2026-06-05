/**
 * Logger: a console.log which can be globally enabled/disabled, with a prefix
 * **and** showing the right file and line number in console (i.e. wherever the
 * function was called).
 *
 * Usage:
 *   const logger = new Logger('module xyz:', app.isDev());
 *   logger.log('blah');
 */
export class Logger {
  log: (...args: unknown[]) => void;

  constructor(prefix = '', enabled = true) {
    if (!enabled) {
      this.log = function () {};
      return;
    }
    // Bind so the console shows the real caller's file/line, not this wrapper.
    this.log = Function.prototype.bind.call(console.log, console, prefix);
  }
}
