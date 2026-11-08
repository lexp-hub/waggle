'use strict';

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { ConfigKey } from './const.js';

export default class WagglePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // -------------------------------------------------------------
        // Page 1: Appearance and Cursor
        // -------------------------------------------------------------
        const appearancePage = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'org.gnome.Settings-appearance-symbolic',
        });

        // Group: Cursor Source
        const cursorSourceGroup = new Adw.PreferencesGroup({
            title: _('Cursor Source'),
            description: _('Choose the cursor visual used for magnification.'),
        });

        const autoDetectRow = new Adw.SwitchRow({
            title: _('Auto-detect System Cursor'),
            subtitle: _('Automatically extracts the icon and hotspot from the active system cursor theme.'),
        });
        settings.bind(ConfigKey.AUTO_DETECT, autoDetectRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        cursorSourceGroup.add(autoDetectRow);

        let detectedThemeName = 'System Default';
        try {
            const ifaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
            detectedThemeName = ifaceSettings.get_string('cursor-theme') || 'System Default';
        } catch (e) {
            // Ignore settings read error
        }

        const themeStatusRow = new Adw.ActionRow({
            title: _('Active Cursor Theme'),
            subtitle: detectedThemeName,
        });
        cursorSourceGroup.add(themeStatusRow);

        const customPathRow = new Adw.EntryRow({
            title: _('Custom Cursor Image Path'),
            show_apply_button: true,
        });
        settings.bind(ConfigKey.CUSTOM_PATH, customPathRow, 'text', Gio.SettingsBindFlags.DEFAULT);

        try {
            const browseButton = new Gtk.Button({
                icon_name: 'document-open-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                tooltip_text: _('Browse for cursor image'),
            });
            browseButton.connect('clicked', () => {
                const dialog = new Gtk.FileDialog({
                    title: _('Select Cursor Image'),
                });
                dialog.open(window, null, (dlg, res) => {
                    try {
                        const file = dlg.open_finish(res);
                        if (file) {
                            settings.set_string(ConfigKey.CUSTOM_PATH, file.get_path());
                        }
                    } catch (e) {
                        // User cancelled
                    }
                });
            });
            customPathRow.add_suffix(browseButton);
        } catch (e) {
            // Fallback if Gtk.FileDialog is not available
        }

        autoDetectRow.connect('notify::active', () => {
            customPathRow.sensitive = !autoDetectRow.active;
            themeStatusRow.visible = autoDetectRow.active;
        });
        customPathRow.sensitive = !autoDetectRow.active;
        themeStatusRow.visible = autoDetectRow.active;

        cursorSourceGroup.add(customPathRow);
        appearancePage.add(cursorSourceGroup);

        // Group: Scaling and Animation
        const animationGroup = new Adw.PreferencesGroup({
            title: _('Magnification and Animation'),
            description: _('Configure cursor size and animation timings.'),
        });

        const sizeRow = new Adw.SpinRow({
            title: _('Magnified Size (px)'),
            subtitle: _('Size in pixels of the magnified cursor when shaken.'),
            numeric: true,
            adjustment: new Gtk.Adjustment({ lower: 32, upper: 1024, step_increment: 8 }),
        });
        settings.bind(ConfigKey.CURSOR_SIZE, sizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        animationGroup.add(sizeRow);

        const hideOriginalRow = new Adw.SwitchRow({
            title: _('Hide Original Cursor'),
            subtitle: _('Hides standard hardware cursor while magnified.'),
        });
        settings.bind(ConfigKey.HIDE_ORIGINAL, hideOriginalRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        animationGroup.add(hideOriginalRow);

        const magnifyDurationRow = new Adw.SpinRow({
            title: _('Magnify Duration (ms)'),
            subtitle: _('Duration of the zoom-in transition.'),
            numeric: true,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 2000, step_increment: 25 }),
        });
        settings.bind(ConfigKey.MAGNIFY_DURATION, magnifyDurationRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        animationGroup.add(magnifyDurationRow);

        const unmagnifyDelayRow = new Adw.SpinRow({
            title: _('Shrink Delay (ms)'),
            subtitle: _('Delay before the cursor returns to standard size.'),
            numeric: true,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 3000, step_increment: 50 }),
        });
        settings.bind(ConfigKey.UNMAGNIFY_DELAY, unmagnifyDelayRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        animationGroup.add(unmagnifyDelayRow);

        const unmagnifyDurationRow = new Adw.SpinRow({
            title: _('Shrink Duration (ms)'),
            subtitle: _('Duration of the zoom-out transition.'),
            numeric: true,
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 2000, step_increment: 25 }),
        });
        settings.bind(ConfigKey.UNMAGNIFY_DURATION, unmagnifyDurationRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        animationGroup.add(unmagnifyDurationRow);

        appearancePage.add(animationGroup);

        // -------------------------------------------------------------
        // Page 2: Sensitivity and Detection
        // -------------------------------------------------------------
        const sensitivityPage = new Adw.PreferencesPage({
            title: _('Sensitivity'),
            icon_name: 'input-mouse-symbolic',
        });

        const triggerGroup = new Adw.PreferencesGroup({
            title: _('Shake Detection'),
            description: _('Configure motion thresholds to trigger magnification.'),
        });

        const distRow = new Adw.SpinRow({
            title: _('Distance Threshold (px)'),
            subtitle: _('Minimum movement distance required to trigger.'),
            numeric: true,
            adjustment: new Gtk.Adjustment({ lower: 50, upper: 1000, step_increment: 10 }),
        });
        settings.bind(ConfigKey.DISTANCE_THRESHOLD, distRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        triggerGroup.add(distRow);

        const radRow = new Adw.SpinRow({
            title: _('Angular Variation Threshold'),
            subtitle: _('Sensitivity to rapid directional changes.'),
            numeric: true,
            adjustment: new Gtk.Adjustment({ lower: 5, upper: 100, step_increment: 1 }),
        });
        settings.bind(ConfigKey.RADIANS_THRESHOLD, radRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        triggerGroup.add(radRow);

        const samplesRow = new Adw.SpinRow({
            title: _('Sample Window Size'),
            subtitle: _('Number of historical track samples retained for calculation.'),
            numeric: true,
            adjustment: new Gtk.Adjustment({ lower: 10, upper: 200, step_increment: 5 }),
        });
        settings.bind(ConfigKey.SAMPLE_SIZE, samplesRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        triggerGroup.add(samplesRow);

        sensitivityPage.add(triggerGroup);

        // Group: Intervals and Performance
        const intervalsGroup = new Adw.PreferencesGroup({
            title: _('Update Intervals'),
            description: _('Configure gesture evaluation and pointer tracking frequency.'),
        });

        const checkIntervalRow = new Adw.SpinRow({
            title: _('Check Interval (ms)'),
            subtitle: _('Interval between shake evaluations.'),
            numeric: true,
            adjustment: new Gtk.Adjustment({ lower: 10, upper: 1000, step_increment: 10 }),
        });
        settings.bind(ConfigKey.CHECK_INTERVAL, checkIntervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        intervalsGroup.add(checkIntervalRow);

        const drawIntervalRow = new Adw.SpinRow({
            title: _('Tracking Interval (ms)'),
            subtitle: _('Frequency of pointer movement sampling.'),
            numeric: true,
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 100, step_increment: 1 }),
        });
        settings.bind(ConfigKey.DRAW_INTERVAL, drawIntervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        intervalsGroup.add(drawIntervalRow);

        sensitivityPage.add(intervalsGroup);

        // -------------------------------------------------------------
        // Page 3: Gaming and Fullscreen
        // -------------------------------------------------------------
        const gamingPage = new Adw.PreferencesPage({
            title: _('Gaming and Fullscreen'),
            icon_name: 'applications-games-symbolic',
        });

        const gamingGroup = new Adw.PreferencesGroup({
            title: _('Fullscreen and Game Protection'),
            description: _('Prevent cursor lock or pointer disappearance during gaming sessions.'),
        });

        const fullscreenRow = new Adw.SwitchRow({
            title: _('Disable in Fullscreen'),
            subtitle: _('Disables magnification when fullscreen games (Steam, Proton, Wine) or apps are active.'),
        });
        settings.bind(ConfigKey.DISABLE_FULLSCREEN, fullscreenRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        gamingGroup.add(fullscreenRow);

        gamingPage.add(gamingGroup);

        // Add pages to main window
        window.add(appearancePage);
        window.add(sensitivityPage);
        window.add(gamingPage);
    }
}
