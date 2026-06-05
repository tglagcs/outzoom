// @ts-nocheck
/*
An abstraction layer over the different browser storage engines, plus
dot.notation.for.your.keys.

All config data is stored under **one** key (default 'config'), so it's tailored
for application configuration, not huge amounts of data.

Works with window.localStorage / window.sessionStorage (sync) and with
chrome.storage.local / .session / .sync (async). .load and .save are async; the
class keeps a copy of the data which you work on, then save.

Source: https://github.com/kpion
*/

export class Config {
  constructor(params = {}) {
    params = Object.assign(
      {
        mainKey: 'config',
        default: {},
        autoSave: true,
      },
      params,
    );

    // only fall back to localStorage when not explicitly passed
    if (typeof params.storage === 'undefined') {
      params.storage = window.localStorage;
    }

    this.params = params;
    this.data = JSON.parse(JSON.stringify(params.default));
    this.storage = params.storage;

    this.loaded = false;
    this.lastError = null;
  }

  getMainKey() {
    return this.params.mainKey;
  }

  /**
   * @param callback called when the (possibly async) operation is done.
   */
  load(callback = null) {
    if (this.storage === null) {
      // dummy one (e.g. for tests) - pretend we're fine
      if (callback) callback(this.data);
      return this;
    }

    // window.localStorage / window.sessionStorage
    if (typeof this.storage.getItem === 'function') {
      const data = JSON.parse(this.storage.getItem(this.params.mainKey)) || null;
      if (data) {
        this.data = data;
        this.loaded = true;
      }
      if (callback) callback(data);
      return this;
    }

    // chrome/browser.storage.local/session/sync
    this.storage.get(this.params.mainKey, (data) => {
      if (typeof data === 'undefined') {
        this.lastError = chrome.runtime.lastError;
        if (callback) callback(null);
        return;
      }
      if (data[this.params.mainKey]) {
        Object.assign(this.data, data[this.params.mainKey]);
        this.data = data[this.params.mainKey];
        this.loaded = true;
      }
      if (callback) callback(data[this.params.mainKey] || null);
    });
    return this;
  }

  save(callback = null) {
    if (this.storage === null) {
      if (callback) callback(this.data);
      return this;
    }

    if (typeof this.storage.setItem === 'function') {
      this.storage.setItem(this.params.mainKey, JSON.stringify(this.data));
      if (callback) callback(this.data);
      return this;
    }

    // chrome/browser.storage.local/session/sync
    this.storage.set(
      {
        [this.params.mainKey]: this.data,
      },
      callback,
    );
    return this;
  }

  /** Promise wrapper around .load - convenient in a service worker. */
  loadAsync() {
    return new Promise((resolve) => this.load(resolve));
  }

  /** Promise wrapper around .save. */
  saveAsync() {
    return new Promise((resolve) => this.save(resolve));
  }

  get(key = null, defaultVal = null) {
    if (key == null) {
      return this.getAll(true);
    }
    return typeof this.data[key] === 'undefined' ? defaultVal : this.data[key];
  }

  set(key, val, saveNow = null) {
    this.data[key] = val;
    return this._saveConditionally(saveNow);
  }

  setAll(data, saveNow = null) {
    this.data = JSON.parse(JSON.stringify(data));
    this._saveConditionally(saveNow);
    return this;
  }

  remove(key, saveNow = null) {
    delete this.data[key];
    return this._saveConditionally(saveNow);
  }

  // read-write direct access to internal data object (a copy when copy === true)
  all(copy = false) {
    if (copy) {
      return JSON.parse(JSON.stringify(this.data));
    }
    return this.data;
  }

  getAll(copy = false) {
    return this.all(copy);
  }

  /**
   * Removes all keys under our mainKey. To remove everything including the
   * mainKey itself, use removeMainKey.
   */
  clearAll(saveNow = null) {
    return this.setAll({}, saveNow);
  }

  removeMainKey(callback = null) {
    if (this.storage === null) {
      if (callback) callback(this.data);
      return this;
    }

    if (typeof this.storage.setItem === 'function') {
      this.storage.removeItem(this.params.mainKey);
      if (callback) callback(this.data);
      return this;
    }
    this.storage.remove(this.params.mainKey, callback);
    return this;
  }

  /**
   * Compare recursively two objects and build an object with keys which differ
   * (missing, added, changed).
   *
   * @param flags {missingOnLeft, missingOnRight, different} - all default true
   */
  diff(obj1, obj2 = null, flags = {}) {
    const result = {};

    if (obj2 === null) {
      obj2 = this.data;
    }
    const showMissingOnLeft =
      typeof flags.missingOnLeft === 'undefined' ? true : flags.missingOnLeft;
    const showMissingOnRight =
      typeof flags.missingOnRight === 'undefined' ? true : flags.missingOnRight;
    const showDifferent =
      typeof flags.different === 'undefined' ? true : flags.different;

    for (const p in obj1) {
      if (typeof obj2 === 'undefined' || !obj2.hasOwnProperty(p)) {
        if (showMissingOnRight) {
          result[p] = {};
        }
        continue;
      }
      if (typeof obj1[p] === 'object' && typeof obj2[p] === 'object') {
        const deepResult = this.diff(obj1[p], obj2[p], flags);
        if (Object.keys(deepResult).length !== 0) {
          result[p] = deepResult;
        }
      } else {
        if (showDifferent) {
          if (obj1[p] != obj2[p]) {
            result[p] = {};
          }
        }
      }
    }

    if (showMissingOnLeft) {
      for (const p in obj2) {
        if (typeof obj1 === 'undefined' || typeof obj1[p] == 'undefined') {
          result[p] = {};
        }
      }
    }

    return result;
  }

  /**
   * Copy (clone) keys from 'src' into this.data, but only ones missing here.
   * Useful when a new version introduces new config keys.
   */
  setMissing(src, target = null) {
    if (target === null) {
      target = this.data;
    }

    for (const prop in src) {
      if (typeof src[prop] === 'object' && !Array.isArray(src[prop])) {
        if (typeof target[prop] === 'undefined') {
          target[prop] = {};
        }
        if (typeof target[prop] === 'object') {
          this.setMissing(src[prop], target[prop]);
        }
      } else {
        if (typeof target[prop] === 'undefined') {
          target[prop] = src[prop];
        }
      }
    }
    return this;
  }

  _saveConditionally(saveNow = null, callback = null) {
    if (saveNow || (saveNow === null && this.params.autoSave)) {
      return this.save(callback);
    }
    return this;
  }
}

export class DotConfig extends Config {
  constructor(params = {}) {
    super(params);
  }

  set(keyPath, val, saveNow = null) {
    this._objPath(keyPath.split('.'), this.data, val);
    return this._saveConditionally(saveNow);
  }

  get(keyPath, defaultVal = null) {
    const result = this._objPath(keyPath.split('.'), this.data);
    return typeof result === 'undefined' ? defaultVal : result;
  }

  remove(keyPath, saveNow = null) {
    this._objPath(keyPath.split('.'), this.data, undefined, true);
    return this._saveConditionally(saveNow);
  }

  // dot notation internals
  _objPath(keyChain, obj, setTo = undefined, remove = false) {
    let cur = obj;
    for (let index = 0; index < keyChain.length; index++) {
      const key = keyChain[index];

      if (typeof cur[key] === 'undefined') {
        if (setTo === undefined) {
          return undefined;
        }
        cur[key] = {};
      }

      if (setTo !== undefined) {
        if (index === keyChain.length - 1) {
          cur[key] = setTo;
        } else {
          if (typeof cur[key] !== 'object') {
            throw `.${key} already exists and is not an object (while trying to create a subkey in it)`;
          }
        }
      }

      if (remove) {
        if (index === keyChain.length - 1) {
          delete cur[key];
        }
      }

      cur = cur[key];
    }
    return cur;
  }
}
