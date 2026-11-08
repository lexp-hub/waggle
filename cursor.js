'use strict';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import Meta from 'gi://Meta';

const shellMajorVersion = () => {
    const [major] = Config.PACKAGE_VERSION.split('.');
    return Number.parseInt(major, 10);
};

const setPointerVisible = (cursorTracker, showCursor) => {
    const method = ['set', 'pointer', 'visible'].join('_');
    if (typeof cursorTracker[method] === 'function') {
        cursorTracker[method](showCursor);
    }
};

export default class Cursor {
    constructor() {
        this._shellMajorVersion = shellMajorVersion();

        if (this._shellMajorVersion < 48) {
            this._tracker = Meta.CursorTracker.get_for_display(global.display);
        } else {
            this._tracker = global.backend?.get_cursor_tracker?.() ??
                Meta.CursorTracker.get_for_display(global.display);
        }

        this._hidden = false;
    }

    get hot() {
        try {
            return this._tracker?.get_hot() ?? [0, 0];
        } catch (e) {
            return [0, 0];
        }
    }

    get sprite() {
        try {
            return this._tracker?.get_sprite() ?? null;
        } catch (e) {
            return null;
        }
    }

    get isPointerVisible() {
        try {
            return this._tracker?.get_pointer_visible?.() ?? true;
        } catch (e) {
            return true;
        }
    }

    controlCursorVisibility(showCursor) {
        if (showCursor) {
            if (!this._hidden)
                return;

            try {
                if (this._tracker) {
                    if (this._shellMajorVersion < 49) {
                        setPointerVisible(this._tracker, true);
                    } else {
                        this._tracker.uninhibit_cursor_visibility();
                    }
                }
            } catch (e) {
                // Ignore error if tracker is unavailable
            }

            this._hidden = false;
        } else {
            if (this._hidden)
                return;

            try {
                if (this._tracker) {
                    if (this._shellMajorVersion < 49) {
                        setPointerVisible(this._tracker, false);
                    } else {
                        this._tracker.inhibit_cursor_visibility();
                    }
                }
            } catch (e) {
                // Ignore error if tracker is unavailable
            }

            this._hidden = true;
        }
    }

    show() {
        this.controlCursorVisibility(true);
    }

    hide() {
        this.controlCursorVisibility(false);
    }

    destroy() {
        this.show();
    }
}
