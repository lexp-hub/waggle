'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import Cursor from './cursor.js';
import CursorFinder from './cursorFinder.js';

const getExtensionDir = () => {
    try {
        const [path] = GLib.filename_from_uri(import.meta.url);
        return GLib.path_get_dirname(path);
    } catch (e) {
        return GLib.path_get_dirname(import.meta.url.slice(7));
    }
};

export default class Effect extends St.Icon {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();
        this.isHidden = true;
        this.magnifyDuration = 250;
        this.unmagnifyDuration = 150;
        this.unmagnifyDelay = 100;
        this.isWiggling = false;
        this._isInTransition = false;

        this.cursor = new Cursor();
        this._autoDetect = true;
        this._customPath = '';
        this._detectedHotspot = [0, 0];
        this._detectedBaseSize = 24;

        this._hotX = 0;
        this._hotY = 0;
        this._spriteSize = 24;
        this._ratio = 1.0;

        this._cursorFinder = new CursorFinder((info) => {
            if (this._autoDetect) {
                this._applyCursorInfo(info);
            }
        });

        this._syncCursorIcon();
        this._updateCursorMetrics();

        const baseScale = this._ratio > 0 ? 1.0 / this._ratio : 0.25;
        this.set_scale(baseScale, baseScale);
        if (this._pivot) {
            this.set_pivot_point(this._pivot.x, this._pivot.y);
        }

        this._unmagnifyDelayId = null;
    }

    get isInTransition() {
        return this._isInTransition;
    }

    set autoDetect(enabled) {
        this._autoDetect = enabled;
        this._syncCursorIcon();
    }

    set customPath(path) {
        this._customPath = path || '';
        if (!this._autoDetect) {
            this._syncCursorIcon();
        }
    }

    set cursorSize(size) {
        this.icon_size = Math.max(16, size || 96);
        this._updateCursorMetrics();
    }

    _applyCursorInfo(info) {
        if (info?.iconPath && GLib.file_test(info.iconPath, GLib.FileTest.EXISTS)) {
            try {
                this.gicon = Gio.Icon.new_for_string(info.iconPath);
                if (info.hotspot) {
                    this._detectedHotspot = info.hotspot;
                }
                if (info.width > 0) {
                    this._detectedBaseSize = info.width;
                }
            } catch (e) {
                this._useDefaultFallback();
            }
        } else {
            this._useDefaultFallback();
        }
        this._updateCursorMetrics();
    }

    _useDefaultFallback() {
        try {
            const defaultSvg = GLib.build_filenamev([getExtensionDir(), 'icons', 'cursor.svg']);
            this.gicon = Gio.Icon.new_for_string(defaultSvg);
            this._detectedHotspot = [0, 0];
            this._detectedBaseSize = 24;
        } catch (e) {
            // Ignore icon loading error
        }
    }

    _syncCursorIcon() {
        if (this._autoDetect) {
            const info = this._cursorFinder.getCursorInfo();
            this._applyCursorInfo(info);
        } else if (this._customPath && GLib.file_test(this._customPath, GLib.FileTest.EXISTS)) {
            try {
                this.gicon = Gio.Icon.new_for_string(this._customPath);
                this._detectedHotspot = [0, 0];
                this._detectedBaseSize = 24;
            } catch (e) {
                this._useDefaultFallback();
            }
        } else {
            this._useDefaultFallback();
        }
        this._updateCursorMetrics();
    }

    _updateCursorMetrics() {
        try {
            if (this._detectedHotspot && this._detectedHotspot.length >= 2) {
                this._hotX = this._detectedHotspot[0];
                this._hotY = this._detectedHotspot[1];
            } else {
                const liveHot = this.cursor.hot;
                this._hotX = Array.isArray(liveHot) ? (liveHot[0] || 0) : 0;
                this._hotY = Array.isArray(liveHot) ? (liveHot[1] || 0) : 0;
            }
        } catch (e) {
            this._hotX = 0;
            this._hotY = 0;
        }

        try {
            const sprite = this.cursor.sprite;
            this._spriteSize = (sprite && sprite.get_width() > 0)
                ? sprite.get_width()
                : this._detectedBaseSize || 24;
        } catch (e) {
            this._spriteSize = this._detectedBaseSize || 24;
        }

        const targetSize = this.icon_size > 0 ? this.icon_size : 96;
        this._ratio = this._spriteSize > 0 ? targetSize / this._spriteSize : 1.0;

        const pivotX = this._spriteSize > 0 ? (this._hotX / this._spriteSize) : 0;
        const pivotY = this._spriteSize > 0 ? (this._hotY / this._spriteSize) : 0;

        this._pivot = new Graphene.Point({
            x: Math.max(0, Math.min(1, pivotX)),
            y: Math.max(0, Math.min(1, pivotY)),
        });

        this.set_size(targetSize, targetSize);
        this.set_pivot_point(this._pivot.x, this._pivot.y);
    }

    move(x, y) {
        this.set_position(x - this._hotX * this._ratio, y - this._hotY * this._ratio);
    }

    magnify() {
        if (this._unmagnifyDelayId) {
            GLib.Source.remove(this._unmagnifyDelayId);
            this._unmagnifyDelayId = null;
        }
        this._isInTransition = false;
        this.isWiggling = true;
        this._updateCursorMetrics();

        const baseScale = this._ratio > 0 ? 1.0 / this._ratio : 0.25;

        if (!this.get_parent()) {
            this.set_scale(baseScale, baseScale);
            Main.uiGroup.add_child(this);
        }

        if (this.isHidden) {
            this.cursor.hide();
        }

        const currentScale = Number.isFinite(this.scale_x) && this.scale_x > 0 ? this.scale_x : baseScale;
        if (currentScale >= 0.99) {
            this.set_scale(1.0, 1.0);
            return;
        }

        const scaleRange = Math.max(0.01, 1.0 - baseScale);
        const remaining = Math.max(0.05, Math.min(1.0, (1.0 - currentScale) / scaleRange));
        const duration = Math.max(50, Math.round(this.magnifyDuration * remaining));

        this.remove_all_transitions();
        this.ease({
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            scale_x: 1.0,
            scale_y: 1.0,
        });
    }

    unmagnify() {
        if (!this.isWiggling || this._isInTransition) {
            return;
        }

        if (this._unmagnifyDelayId) {
            GLib.Source.remove(this._unmagnifyDelayId);
            this._unmagnifyDelayId = null;
        }

        this._isInTransition = true;

        const delay = Math.max(0, this.unmagnifyDelay || 0);
        this._unmagnifyDelayId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._unmagnifyDelayId = null;
            this.remove_all_transitions();

            const baseScale = this._ratio > 0 ? 1.0 / this._ratio : 0.25;

            this.ease({
                duration: this.unmagnifyDuration,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                scale_x: baseScale,
                scale_y: baseScale,
                onComplete: () => {
                    if (this.get_parent()) {
                        Main.uiGroup.remove_child(this);
                    }
                    if (this.isHidden) {
                        this.cursor.show();
                    }

                    this.isWiggling = false;
                    this._isInTransition = false;
                },
            });

            return GLib.SOURCE_REMOVE;
        });
    }

    cancel() {
        if (this._unmagnifyDelayId) {
            GLib.Source.remove(this._unmagnifyDelayId);
            this._unmagnifyDelayId = null;
        }
        this.remove_all_transitions();
        if (this.get_parent()) {
            Main.uiGroup.remove_child(this);
        }
        if (this.isHidden) {
            this.cursor.show();
        }
        this.isWiggling = false;
        this._isInTransition = false;

        const baseScale = this._ratio > 0 ? 1.0 / this._ratio : 0.25;
        this.set_scale(baseScale, baseScale);
    }

    destroy() {
        this.cancel();
        if (this._cursorFinder) {
            this._cursorFinder.destroy();
            this._cursorFinder = null;
        }
        this.cursor.destroy();
        super.destroy();
    }
}
