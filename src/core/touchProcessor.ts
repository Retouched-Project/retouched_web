// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { WasmEngineBridge } from './engine/wasmEngineBridge';
import type { BmAction } from '../types';

export interface TouchPoint {
    id: number;
    x: number;
    y: number;
    state: number;
}

export class TouchProcessor {
    private engine: WasmEngineBridge;
    private processActions: (actions: BmAction[]) => void;

    private pendingTouches = new Map<number, TouchPoint>();
    private pendingScreenW = 0;
    private pendingScreenH = 0;
    private touchFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private lastTouchSentAt = 0;

    private touchEnabled = true;
    private touchIntervalMs = 100;
    private touchReliability = 0;

    constructor(engine: WasmEngineBridge, processActions: (actions: BmAction[]) => void) {
        this.engine = engine;
        this.processActions = processActions;
    }

    handleTouchSet(touches: TouchPoint[], screenWidth: number, screenHeight: number, targetDeviceId: string) {
        if (!this.touchEnabled) return;

        this.pendingScreenW = screenWidth;
        this.pendingScreenH = screenHeight;
        touches.forEach(t => this.pendingTouches.set(t.id, t));

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
            screen_width: this.pendingScreenW,
            screen_height: this.pendingScreenH,
            state: stateMap[t.state] || "Stationary"
        }));

        this.pendingTouches.forEach((t, id) => {
            if (t.state === 4 || t.state === 5) {
                this.pendingTouches.delete(id);
            } else if (t.state === 1 || t.state === 2) {
                t.state = 3;
            }
        });

        const actions = this.engine.makeTouchSet(targetDeviceId, points, this.touchReliability);
        this.processActions(actions);

        if (retryCount < 3 && this.touchReliability === 0 && !this.touchFlushTimer && this.pendingTouches.size > 0) {
            this.touchFlushTimer = setTimeout(() => this.flushTouches(targetDeviceId, retryCount + 1), this.touchIntervalMs);
        }
    }

    configure(config: { touchReliability?: number, touchEnabled?: boolean, touchIntervalMs?: number }) {
        if (config.touchReliability !== undefined) this.touchReliability = config.touchReliability;
        if (config.touchEnabled !== undefined) this.touchEnabled = config.touchEnabled;
        if (config.touchIntervalMs !== undefined) this.touchIntervalMs = config.touchIntervalMs;
    }

    reset() {
        if (this.touchFlushTimer) {
            clearTimeout(this.touchFlushTimer);
            this.touchFlushTimer = null;
        }
        this.pendingTouches.clear();
        this.lastTouchSentAt = 0;
    }
}
