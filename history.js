'use strict';

import GLib from 'gi://GLib';

const calcDistance = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

const calcGamma = (st, nd, rd) => {
    const a = Math.hypot(st.x - nd.x, st.y - nd.y);
    const b = Math.hypot(nd.x - rd.x, nd.y - rd.y);
    const c = Math.hypot(rd.x - st.x, rd.y - st.y);

    if (a * b === 0) {
        return 0;
    }
    const cosAngle = (a * a + b * b - c * c) / (2 * a * b);
    return Math.PI - Math.acos(Math.max(-1, Math.min(1, cosAngle)));
};

export default class History {
    constructor() {
        this._samples = [];
        this.sampleSize = 35;
        this.radiansThreshold = 10;
        this.distanceThreshold = 220;
    }

    get lastCoords() {
        return this._samples[this._samples.length - 1];
    }

    clear() {
        this._samples = [];
    }

    check() {
        const now = GLib.get_monotonic_time();
        const maxAge = 500 * 1000; // 500ms sliding window in microseconds

        while (this._samples.length > 0 && now - this._samples[0].t > maxAge) {
            this._samples.shift();
        }

        const maxSamples = Math.max(60, this.sampleSize * 2);
        while (this._samples.length > maxSamples) {
            this._samples.shift();
        }

        if (this._samples.length < 5) {
            return false;
        }

        let radians = 0;
        let distance = 0;
        for (let i = 2; i < this._samples.length; i++) {
            radians += calcGamma(this._samples[i - 2], this._samples[i - 1], this._samples[i]);
            distance += calcDistance(this._samples[i - 1], this._samples[i]);
        }

        // Require at least ~3 deliberate direction reversals (approx 9.5 rad)
        const radThreshold = Math.max(9.0, Math.min(this.radiansThreshold, 14.0));
        const distThreshold = Math.max(180.0, this.distanceThreshold);

        return radians >= radThreshold && distance >= distThreshold;
    }

    push(x, y) {
        const last = this.lastCoords;
        if (last && Math.hypot(x - last.x, y - last.y) < 2) {
            return; // Ignore sub-pixel stationary jitter
        }

        this._samples.push({ x, y, t: GLib.get_monotonic_time() });
        if (this._samples.length > 120) {
            this._samples.shift();
        }
    }
}
