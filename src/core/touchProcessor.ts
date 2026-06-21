// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import type { BmEngine } from '../bmEngine';
import type { BmOutgoing } from '../types';

export interface TouchPoint {
    id: number;
    x: number;
    y: number;
    state: number;
}

export class TouchProcessor {
    private engine: BmEngine;
    private processActions: (actions: BmOutgoing[]) => void;

    private pendingTouches = new Map<number, TouchPoint>();
    private pendingScreenW = 0;
    private pendingScreenH = 0;
    private touchFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private lastTouchSentAt = 0;

    private touchEnabled = true;
    private touchIntervalMs = 100;

    constructor(engine: BmEngine, processActions: (actions: BmOutgoing[]) => void) {
        this.engine = engine;
        this.processActions = processActions;
    }

    handleTouchSet(touches: TouchPoint[], screenWidth: number, screenHeight: number, targetDeviceId: string) {
        if (!this.touchEnabled) return;

        this.pendingScreenW = screenWidth;
        this.pendingScreenH = screenHeight;
        touches.forEach(t => {
            const existing = this.pendingTouches.get(t.id);
            if (existing && t.state === 2) {
                if (existing.state !== 3) {
                    this.pendingTouches.set(t.id, { ...t, state: existing.state });
                    return;
                }
                if (existing.x === t.x && existing.y === t.y) {
                    return;
                }
            }
            this.pendingTouches.set(t.id, t);
        });

        const effectiveInterval = this.touchIntervalMs / 2;
        const now = Date.now();
        const nextFlushAt = this.lastTouchSentAt + effectiveInterval;

        if (now >= nextFlushAt) {
            if (this.touchFlushTimer) {
                clearTimeout(this.touchFlushTimer);
                this.touchFlushTimer = null;
            }
            this.flushTouches(targetDeviceId, 0);
        } else if (!this.touchFlushTimer) {
            const delay = Math.max(1, nextFlushAt - now);
            this.touchFlushTimer = setTimeout(() => this.flushTouches(targetDeviceId, 0), delay);
        }
    }

    private flushTouches(targetDeviceId: string, retryCount: number = 0) {
        this.touchFlushTimer = null;
        if (this.pendingTouches.size === 0) return;

        this.lastTouchSentAt = Date.now();
        const stateMap = ["", "Began", "Moved", "Stationary", "Ended", "Cancelled"];

        const points = Array.from(this.pendingTouches.values()).map(t => ({
            id: t.id,
            x: t.x,
            y: t.y,
            screenWidth: this.pendingScreenW,
            screenHeight: this.pendingScreenH,
            state: stateMap[t.state] || "Stationary"
        }));

        this.pendingTouches.forEach((t, id) => {
            if (t.state === 4 || t.state === 5) {
                this.pendingTouches.delete(id);
            } else if (t.state === 1 || t.state === 2) {
                t.state = 3;
            }
        });

        const actions = this.engine.makeTouchSet(targetDeviceId, points);
        this.processActions(actions);

        // Only unreliable (UDP) touches need resending to survive packet loss; the
        // engine resolves the reliability, so derive the retry need from it.
        const unreliable = actions.some(a => a.reliability === 0);
        if (retryCount < 3 && unreliable && !this.touchFlushTimer && this.pendingTouches.size > 0) {
            this.touchFlushTimer = setTimeout(() => this.flushTouches(targetDeviceId, retryCount + 1), this.touchIntervalMs);
        }
    }

    configure(config: { touchEnabled?: boolean | null, touchIntervalMs?: number | null }) {
        if (config.touchEnabled != null) this.touchEnabled = config.touchEnabled;
        if (config.touchIntervalMs != null) this.touchIntervalMs = config.touchIntervalMs;
    }

    reset() {
        if (this.touchFlushTimer) {
            clearTimeout(this.touchFlushTimer);
            this.touchFlushTimer = null;
        }
        this.pendingTouches.clear();
        this.lastTouchSentAt = 0;
        this.touchEnabled = true;
        this.touchIntervalMs = 100;
    }
}
