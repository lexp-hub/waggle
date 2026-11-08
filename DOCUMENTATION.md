# Waggle Technical Documentation

This document describes the internal architecture, algorithms, and configuration of the Waggle GNOME Shell extension.

---

## 1. Architecture Overview

Waggle is structured into modular JavaScript components loaded by GNOME Shell:

```
waggle@lex/
├── metadata.json       # Extension metadata, UUID, supported shell versions
├── const.js            # Configuration key definitions
├── cursor.js           # Pointer visibility controller
├── cursorFinder.js     # System XCursor parser and automatic theme extractor
├── effect.js           # Clutter actor rendering the magnified cursor and animations
├── extension.js        # Main extension lifecycle and window/fullscreen watcher
├── history.js          # Circular motion buffer and shake detection mathematics
├── prefs.js            # Libadwaita preferences interface
└── schemas/            # GSettings schema and compiled binary
```

### Component Interaction Diagram

- `extension.js`: Coordinates lifecycle (`enable()` / `disable()`). Manages GLib timers for movement sampling and shake analysis.
- `cursorFinder.js`: Interrogates `org.gnome.desktop.interface cursor-theme`, locates the active cursor file, extracts its highest-resolution bitmap, and outputs a cached PNG with hotspot coordinates.
- `effect.js`: Extends `St.Icon`. Renders the enlarged cursor on `Main.uiGroup`, applying quad easing for zoom transitions.
- `cursor.js`: Manages standard hardware cursor visibility safely via Mutter's `CursorTracker`.
- `history.js`: Accumulates monotonic timestamps and coordinates to evaluate distance and angular deviation thresholds.

---

## 2. Motion Detection Algorithm

Shake detection evaluates two primary metrics over a rolling temporal window:

1. **Euclidean Distance**:
   Calculated between consecutive sample points $(p_1, p_2)$:
   $$\text{distance} = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$

2. **Angular Deviation (Directional Reversal)**:
   Calculated across three consecutive points $(st, nd, rd)$:
   $$a = \|st - nd\|, \quad b = \|nd - rd\|, \quad c = \|rd - st\|$$
   $$\cos(\theta) = \frac{a^2 + b^2 - c^2}{2ab}$$
   $$\gamma = \pi - \arccos(\text{clamp}(\cos(\theta), -1, 1))$$

Magnification triggers when both:
- Accumulated angular variation exceeds `radians-threshold`.
- Maximum step distance exceeds `distance-threshold`.

---

## 3. Cursor Auto-Detection Engine

`cursorFinder.js` eliminates the need for manual icon path configuration:

1. **Path Resolution**: Inspects standard XDG icon directories (`~/.local/share/icons`, `~/.icons`, `/usr/local/share/icons`, `/usr/share/icons`) for `<theme-name>/cursors/`.
2. **Binary Parsing**: Reads the XCursor file format:
   - Validates the `Xcur` magic header (`0x72756358`).
   - Traverses the Table of Contents (`ntoc`) for image chunks (`0xfffd0002`).
   - Identifies the highest resolution image block (e.g. 96x96 or 64x64).
   - Extracts image metadata: width, height, and hotspot offsets $(x_{\text{hot}}, y_{\text{hot}})$.
3. **Format Transformation**: Converts native little-endian ARGB pixels into standard RGBA byte sequences.
4. **Caching**: Writes the resulting bitmap as a PNG inside `$XDG_CACHE_HOME/waggle/<theme>.png`.
5. **Dynamic Updates**: Listens to `changed::cursor-theme` on `org.gnome.desktop.interface` to update immediately when the user changes cursor styles in GNOME Settings.

---

## 4. Gaming and Fullscreen Protection

Cursor disappearance in Linux games typically occurs when extensions interfere with relative pointer motion (`zwp_relative_pointer_v1`) or attempt to lock seat focus.

Waggle resolves this through multiple layers:

1. **No Seat Focus Locking**: Completely avoids calling `seat.inhibit_unfocus()`.
2. **Multi-Monitor Fullscreen Queries**: Checks `global.display.get_monitor_in_fullscreen(i)` across all connected displays.
3. **Focused Window Fullscreen Check**: Checks `focusWindow.is_fullscreen()`.
4. **Borderless Window Detection**: Compares `focusWindow.get_frame_rect()` against `display.get_monitor_geometry()` to identify borderless fullscreen games common in Steam, Proton, and Wine.
5. **Instant Deactivation**: Reacts to `in-fullscreen-changed` and `notify::focus-window` signals to cancel active zoom states and restore hardware pointer visibility without delay.

---

## 5. GSettings Schema Reference

Schema identifier: `org.gnome.shell.extensions.waggle`

| Key | Type | Default | Description |
|---|---|---|---|
| `auto-detect-cursor` | boolean | `true` | Extract active system cursor theme icon and hotspot automatically |
| `custom-cursor-path` | string | `""` | Optional fallback file path for custom cursor graphic |
| `cursor-size` | integer | `96` | Target magnified cursor dimension in pixels |
| `hide-original-cursor` | boolean | `true` | Hide standard hardware pointer during magnification |
| `disable-in-fullscreen` | boolean | `true` | Suspend magnification when fullscreen windows or games are active |
| `magnify-duration` | integer | `250` | Zoom-in animation duration in milliseconds |
| `unmagnify-duration` | integer | `150` | Zoom-out animation duration in milliseconds |
| `unmagnify-delay` | integer | `100` | Delay in milliseconds before shrinking |
| `sample-size` | integer | `25` | Maximum samples preserved in circular history buffer |
| `distance-threshold` | integer | `180` | Minimum movement distance threshold |
| `radians-threshold` | integer | `15` | Minimum cumulative directional variation threshold |
| `check-interval` | integer | `200` | Polling frequency in milliseconds for gesture evaluation |
| `draw-interval` | integer | `8` | Polling frequency in milliseconds for cursor tracking |

---

## 6. Development and Troubleshooting

### Compile Schemas
```bash
glib-compile-schemas schemas/
```

### Inspect Output Logs
To follow live logs and errors during testing:
```bash
journalctl -f /usr/bin/gnome-shell | grep -i waggle
```

### Test Preferences Window
To launch the preferences window independently:
```bash
gnome-extensions prefs waggle@lex
```
