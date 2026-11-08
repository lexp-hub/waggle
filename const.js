'use strict';

export const ConfigKey = {
    AUTO_DETECT: 'auto-detect-cursor',
    CUSTOM_PATH: 'custom-cursor-path',
    CURSOR_SIZE: 'cursor-size',
    HIDE_ORIGINAL: 'hide-original-cursor',
    DISABLE_FULLSCREEN: 'disable-in-fullscreen',
    MAGNIFY_DURATION: 'magnify-duration',
    UNMAGNIFY_DURATION: 'unmagnify-duration',
    UNMAGNIFY_DELAY: 'unmagnify-delay',
    SAMPLE_SIZE: 'sample-size',
    DISTANCE_THRESHOLD: 'distance-threshold',
    RADIANS_THRESHOLD: 'radians-threshold',
    CHECK_INTERVAL: 'check-interval',
    DRAW_INTERVAL: 'draw-interval',
};

export const Field = {
    AUTO: ConfigKey.AUTO_DETECT,
    PATH: ConfigKey.CUSTOM_PATH,
    SIZE: ConfigKey.CURSOR_SIZE,
    HIDE: ConfigKey.HIDE_ORIGINAL,
    FULL: ConfigKey.DISABLE_FULLSCREEN,
    MAGN: ConfigKey.MAGNIFY_DURATION,
    UMGN: ConfigKey.UNMAGNIFY_DURATION,
    DLAY: ConfigKey.UNMAGNIFY_DELAY,
    SAMP: ConfigKey.SAMPLE_SIZE,
    DIST: ConfigKey.DISTANCE_THRESHOLD,
    RADI: ConfigKey.RADIANS_THRESHOLD,
    CHCK: ConfigKey.CHECK_INTERVAL,
    DRAW: ConfigKey.DRAW_INTERVAL,
};
