'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { ConfigKey } from './const.js';
import Effect from './effect.js';
import History from './history.js';

const bindSettings = (settings, definitions) => {
    const getValue = (name, type) => ({
        'b': () => settings.get_boolean(name),
        'd': () => settings.get_double(name),
        'i': () => settings.get_int(name),
        's': () => settings.get_string(name),
    }[type]());

    const connectionIds = [];
    definitions.forEach(([name, type, callback]) => {
        callback(getValue(name, type));
        const id = settings.connect(`changed::${name}`, () => callback(getValue(name, type)));
        connectionIds.push(id);
    });
    return connectionIds;
};

export default class WaggleExtension extends Extension {
    _isWindowFullscreen() {
        if (!this._disableInFullscreen) {
            return false;
        }

        try {
            const display = global.display;
            if (display) {
                // 1. Check if any monitor is marked fullscreen
                const nMonitors = display.get_n_monitors?.() ?? 1;
                for (let i = 0; i < nMonitors; i++) {
                    if (display.get_monitor_in_fullscreen?.(i)) {
                        return true;
                    }
                }

                // 2. Check the active focused window
                const focusWindow = display.focus_window;
                if (focusWindow) {
                    if (focusWindow.is_fullscreen?.()) {
                        return true;
                    }

                    // 3. Detect borderless fullscreen games (undecorated windows covering the entire monitor)
                    const isMaximized = focusWindow.maximized_horizontally && focusWindow.maximized_vertically;
                    if (!isMaximized) {
                        const monitorIndex = focusWindow.get_monitor?.() ?? display.get_current_monitor?.() ?? 0;
                        const monitorGeometry = display.get_monitor_geometry?.(monitorIndex);
                        const frameRect = focusWindow.get_frame_rect?.();

                        if (monitorGeometry && frameRect) {
                            const coversMonitor =
                                frameRect.x <= monitorGeometry.x &&
                                frameRect.y <= monitorGeometry.y &&
                                frameRect.width >= monitorGeometry.width &&
                                frameRect.height >= monitorGeometry.height;

                            if (coversMonitor) {
                                return true;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            return false;
        }

        return false;
    }

    _onFullscreenOrFocusChanged() {
        if (this._isWindowFullscreen()) {
            if (this._effect?.isWiggling) {
                this._effect.cancel();
            }
            this._history?.clear();
        }
    }

    _onCheckIntervalChange(interval) {
        if (this._checkTimeoutId) {
            GLib.Source.remove(this._checkTimeoutId);
            this._checkTimeoutId = null;
        }

        const safeInterval = Math.max(1, interval || 200);
        this._checkTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, safeInterval, () => {
            if (!this._history || !this._effect) {
                return GLib.SOURCE_REMOVE;
            }

            if (this._isWindowFullscreen() || this._isWindowGrabbed) {
                if (this._effect.isWiggling) {
                    this._effect.cancel();
                }
                this._history.clear();
                return GLib.SOURCE_CONTINUE;
            }

            if (this._checkCursorHiddenByProgram()) {
                return GLib.SOURCE_CONTINUE;
            }

            if (this._history.check()) {
                if (!this._effect.isWiggling || this._effect.isInTransition) {
                    const lastCoords = this._history.lastCoords;
                    if (lastCoords) {
                        this._effect.move(lastCoords.x, lastCoords.y);
                        this._effect.magnify();
                    }
                }
            } else if (this._effect.isWiggling) {
                this._effect.unmagnify();
            }

            return GLib.SOURCE_CONTINUE;
        });
    }

    _checkCursorHiddenByProgram() {
        const isVisible = this._effect?.cursor?.isPointerVisible ?? true;
        if (!isVisible) {
            if (!this._isHiddenByProgram) {
                this._togglePointerWatcher(false);
                this._isHiddenByProgram = true;
            }
            return true;
        } else if (this._isHiddenByProgram) {
            this._togglePointerWatcher(true);
            this._isHiddenByProgram = false;
        }
        return false;
    }

    _onDrawIntervalChange(interval) {
        this._drawInterval = Math.max(1, interval || 8);
        if (this._drawIntervalId) {
            GLib.Source.remove(this._drawIntervalId);
            this._drawIntervalId = null;
        }

        this._lastPointer = null;
        this._drawIntervalId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._drawInterval, () => {
            if (!this._history || !this._effect) {
                return GLib.SOURCE_REMOVE;
            }

            if (this._isWindowFullscreen() || this._isWindowGrabbed) {
                return GLib.SOURCE_CONTINUE;
            }

            const [x, y, mods] = global.get_pointer();

            // Ignore when dragging (holding any mouse button)
            const buttonMask =
                Clutter.ModifierType.BUTTON1_MASK |
                Clutter.ModifierType.BUTTON2_MASK |
                Clutter.ModifierType.BUTTON3_MASK |
                Clutter.ModifierType.BUTTON4_MASK |
                Clutter.ModifierType.BUTTON5_MASK;

            const isButtonPressed = !!(mods & buttonMask);
            if (isButtonPressed) {
                if (this._effect.isWiggling) {
                    this._effect.cancel();
                }
                this._history.clear();
                return GLib.SOURCE_CONTINUE;
            }

            if (this._lastPointer?.x === x && this._lastPointer?.y === y) {
                return GLib.SOURCE_CONTINUE;
            }

            this._lastPointer = { x, y };
            this._history.push(x, y);

            if (this._effect.isWiggling) {
                this._effect.move(x, y);
            }

            return GLib.SOURCE_CONTINUE;
        });
    }

    _togglePointerWatcher(state) {
        if (state) {
            if (!this._drawIntervalId && this._drawInterval) {
                this._onDrawIntervalChange(this._drawInterval);
            }
        } else {
            if (this._effect?.isWiggling) {
                this._effect.cancel();
            }
            if (this._drawIntervalId) {
                GLib.Source.remove(this._drawIntervalId);
                this._drawIntervalId = null;
                this._lastPointer = null;
                this._history?.clear();
            }
        }
    }

    enable() {
        this._history = new History();
        this._effect = new Effect();
        this._settings = this.getSettings();
        this._disableInFullscreen = true;
        this._isWindowGrabbed = false;
        this._isHiddenByProgram = false;
        this._drawInterval = 8;

        this._connectionIds = bindSettings(this._settings, [
            [ConfigKey.AUTO_DETECT, 'b', (val) => { if (this._effect) this._effect.autoDetect = val; }],
            [ConfigKey.CUSTOM_PATH, 's', (val) => { if (this._effect) this._effect.customPath = val; }],
            [ConfigKey.CURSOR_SIZE, 'i', (val) => { if (this._effect) this._effect.cursorSize = val; }],
            [ConfigKey.HIDE_ORIGINAL, 'b', (val) => { if (this._effect) this._effect.isHidden = val; }],
            [ConfigKey.MAGNIFY_DURATION, 'i', (val) => { if (this._effect) this._effect.magnifyDuration = val; }],
            [ConfigKey.UNMAGNIFY_DURATION, 'i', (val) => { if (this._effect) this._effect.unmagnifyDuration = val; }],
            [ConfigKey.UNMAGNIFY_DELAY, 'i', (val) => { if (this._effect) this._effect.unmagnifyDelay = val; }],

            [ConfigKey.SAMPLE_SIZE, 'i', (val) => { if (this._history) this._history.sampleSize = val; }],
            [ConfigKey.RADIANS_THRESHOLD, 'i', (val) => { if (this._history) this._history.radiansThreshold = val; }],
            [ConfigKey.DISTANCE_THRESHOLD, 'i', (val) => { if (this._history) this._history.distanceThreshold = val; }],
            [ConfigKey.CHECK_INTERVAL, 'i', (val) => this._onCheckIntervalChange(val)],
            [ConfigKey.DRAW_INTERVAL, 'i', (val) => this._onDrawIntervalChange(val)],
            [ConfigKey.DISABLE_FULLSCREEN, 'b', (val) => {
                this._disableInFullscreen = val;
                this._onFullscreenOrFocusChanged();
            }],
        ]);

        if (global.display) {
            this._fullscreenChangedId = global.display.connect(
                'in-fullscreen-changed',
                () => this._onFullscreenOrFocusChanged()
            );
            this._focusWindowChangedId = global.display.connect(
                'notify::focus-window',
                () => this._onFullscreenOrFocusChanged()
            );
            this._grabOpBeginId = global.display.connect(
                'grab-op-begin',
                () => {
                    this._isWindowGrabbed = true;
                    if (this._effect?.isWiggling) {
                        this._effect.cancel();
                    }
                    this._history?.clear();
                }
            );
            this._grabOpEndId = global.display.connect(
                'grab-op-end',
                () => {
                    this._isWindowGrabbed = false;
                    this._history?.clear();
                }
            );
        }
    }

    disable() {
        if (this._grabOpBeginId) {
            global.display?.disconnect(this._grabOpBeginId);
            this._grabOpBeginId = null;
        }
        if (this._grabOpEndId) {
            global.display?.disconnect(this._grabOpEndId);
            this._grabOpEndId = null;
        }
        if (this._fullscreenChangedId) {
            global.display?.disconnect(this._fullscreenChangedId);
            this._fullscreenChangedId = null;
        }
        if (this._focusWindowChangedId) {
            global.display?.disconnect(this._focusWindowChangedId);
            this._focusWindowChangedId = null;
        }

        if (this._checkTimeoutId) {
            GLib.Source.remove(this._checkTimeoutId);
            this._checkTimeoutId = null;
        }

        this._togglePointerWatcher(false);

        if (this._connectionIds && this._settings) {
            this._connectionIds.forEach((id) => this._settings.disconnect(id));
            this._connectionIds = null;
        }

        if (this._effect) {
            this._effect.destroy();
            this._effect = null;
        }

        this._history = null;
        this._settings = null;
    }
}
