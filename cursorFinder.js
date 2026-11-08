'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';

const XCUR_MAGIC = 0x72756358; // 'Xcur' in little-endian format
const XCUR_IMAGE_TYPE = 0xfffd0002;

export default class CursorFinder {
    constructor(onThemeChanged) {
        this._onThemeChanged = onThemeChanged;
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

        this._changedId = this._interfaceSettings.connect('changed::cursor-theme', () => {
            if (typeof this._onThemeChanged === 'function') {
                this._onThemeChanged(this.getCursorInfo());
            }
        });
    }

    getCurrentThemeName() {
        try {
            return this._interfaceSettings.get_string('cursor-theme') || 'Adwaita';
        } catch (e) {
            return 'Adwaita';
        }
    }

    _findXCursorFile(themeName) {
        const searchDirs = [
            GLib.build_filenamev([GLib.get_user_data_dir(), 'icons']),
            GLib.build_filenamev([GLib.get_home_dir(), '.icons']),
            '/usr/local/share/icons',
            '/usr/share/icons',
        ];

        const candidateThemes = [themeName, 'default', 'Adwaita'];
        const cursorNames = ['left_ptr', 'default', 'arrow', 'pointer', 'top_left_arrow'];

        for (const theme of candidateThemes) {
            for (const baseDir of searchDirs) {
                const cursorsDir = GLib.build_filenamev([baseDir, theme, 'cursors']);
                if (GLib.file_test(cursorsDir, GLib.FileTest.IS_DIR)) {
                    for (const cursorName of cursorNames) {
                        const candidatePath = GLib.build_filenamev([cursorsDir, cursorName]);
                        if (GLib.file_test(candidatePath, GLib.FileTest.EXISTS)) {
                            return candidatePath;
                        }
                    }
                }
            }
        }

        return null;
    }

    _parseAndExtractPng(xcursorPath, themeName) {
        try {
            const file = Gio.File.new_for_path(xcursorPath);
            const [ok, contents] = file.load_contents(null);
            if (!ok || contents.byteLength < 16) {
                return null;
            }

            const view = new DataView(contents.buffer, contents.byteOffset, contents.byteLength);
            const magic = view.getUint32(0, true);
            if (magic !== XCUR_MAGIC) {
                return null;
            }

            const ntoc = view.getUint32(12, true);
            let bestSize = -1;
            let bestPos = 0;

            for (let i = 0; i < ntoc; i++) {
                const entryOffset = 16 + i * 12;
                if (entryOffset + 12 > contents.byteLength) {
                    break;
                }
                const type = view.getUint32(entryOffset, true);
                const subtype = view.getUint32(entryOffset + 4, true);
                const pos = view.getUint32(entryOffset + 8, true);

                if (type === XCUR_IMAGE_TYPE && subtype > bestSize) {
                    bestSize = subtype;
                    bestPos = pos;
                }
            }

            if (bestPos <= 0 || bestPos + 36 > contents.byteLength) {
                return null;
            }

            const width = view.getUint32(bestPos + 16, true);
            const height = view.getUint32(bestPos + 20, true);
            const xhot = view.getUint32(bestPos + 24, true);
            const yhot = view.getUint32(bestPos + 28, true);

            const pixelOffset = bestPos + 36;
            const numPixels = width * height;
            if (pixelOffset + numPixels * 4 > contents.byteLength) {
                return null;
            }

            // Convert ARGB (little-endian: B, G, R, A) to RGBA (R, G, B, A)
            const rgba = new Uint8Array(numPixels * 4);
            for (let i = 0; i < numPixels; i++) {
                const src = pixelOffset + i * 4;
                const dst = i * 4;
                const b = contents[src];
                const g = contents[src + 1];
                const r = contents[src + 2];
                const a = contents[src + 3];

                rgba[dst] = r;
                rgba[dst + 1] = g;
                rgba[dst + 2] = b;
                rgba[dst + 3] = a;
            }

            const glibBytes = new GLib.Bytes(rgba);
            const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
                glibBytes,
                GdkPixbuf.Colorspace.RGB,
                true,
                8,
                width,
                height,
                width * 4
            );

            const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'waggle']);
            GLib.mkdir_with_parents(cacheDir, 0o755);

            const sanitizedTheme = themeName.replace(/[^a-zA-Z0-9_-]/g, '_');
            const outPath = GLib.build_filenamev([cacheDir, `${sanitizedTheme}.png`]);

            pixbuf.savev(outPath, 'png', [], []);

            return {
                iconPath: outPath,
                hotspot: [xhot, yhot],
                width,
                height,
            };
        } catch (e) {
            return null;
        }
    }

    getCursorInfo() {
        const themeName = this.getCurrentThemeName();
        const xcursorPath = this._findXCursorFile(themeName);
        if (xcursorPath) {
            const extracted = this._parseAndExtractPng(xcursorPath, themeName);
            if (extracted) {
                return extracted;
            }
        }

        return {
            iconPath: null,
            hotspot: null,
            width: 24,
            height: 24,
        };
    }

    destroy() {
        if (this._changedId) {
            this._interfaceSettings.disconnect(this._changedId);
            this._changedId = null;
        }
        this._interfaceSettings = null;
    }
}
