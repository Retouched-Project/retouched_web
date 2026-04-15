// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { WasmEngineBridge } from './engine/wasmEngineBridge';
import type { BmAction } from '../types';

export type SensorStatus = 'idle' | 'active' | 'permission_denied' | 'unavailable';

export class SensorProcessor {
    private engine: WasmEngineBridge;
    private processActions: (actions: BmAction[]) => void;

    private accelSensor: Sensor | null = null;
    private accelDeviceMotionHandler: ((e: DeviceMotionEvent) => void) | null = null;
    private lastAccelSentAt = 0;
    private lastAccelEvent: { x: number, y: number, z: number } | null = null;
    private accelIntervalMs = 100;
    private accelGotReading = false;

    private gyroSensor: Sensor | null = null;
    private gyroDeviceMotionHandler: ((e: DeviceMotionEvent) => void) | null = null;
    private lastGyroSentAt = 0;
    private gyroIntervalMs = 100;
    private gyroGotReading = false;

    private orientationEnabled = false;
    private orientationTimer: ReturnType<typeof setInterval> | null = null;
    private orientationIntervalMs = 50;

    private controlReliability = 0;

    private static permissionGranted: boolean | null = null;
    onStatusChange?: (status: SensorStatus) => void;

    constructor(engine: WasmEngineBridge, processActions: (actions: BmAction[]) => void) {
        this.engine = engine;
        this.processActions = processActions;
    }

    static isPermissionGranted(): boolean | null {
        return SensorProcessor.permissionGranted;
    }

    static needsPermissionRequest(): boolean {
        return typeof DeviceMotionEvent !== 'undefined' &&
            typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function';
    }

    static async requestPermission(): Promise<boolean> {
        if (!SensorProcessor.needsPermissionRequest()) {
            SensorProcessor.permissionGranted = true;
            return true;
        }
        try {
            const result = await (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
            SensorProcessor.permissionGranted = result === 'granted';
            return SensorProcessor.permissionGranted;
        } catch {
            SensorProcessor.permissionGranted = false;
            return false;
        }
    }

    private gridAlign(now: number, last: number, interval: number): number {
        if (interval <= 0) return now;
        const effectiveInterval = interval / 2;
        const nextAt = last + effectiveInterval;
        if (now >= nextAt) {
            return last + Math.floor((now - last) / effectiveInterval) * effectiveInterval;
        }
        return -1;
    }

    startAccel(targetDeviceId: string) {
        if (this.accelSensor || this.accelDeviceMotionHandler) return;
        this.accelGotReading = false;

        if (SensorProcessor.permissionGranted === false) {
            this.onStatusChange?.('permission_denied');
            return;
        }

        if (typeof Accelerometer !== 'undefined') {
            try {
                const s = new Accelerometer({ frequency: 60 });
                s.onreading = () => {
                    this.accelGotReading = true;
                    this.lastAccelEvent = { x: s.x ?? 0, y: s.y ?? 0, z: s.z ?? 0 };
                    const aligned = this.gridAlign(Date.now(), this.lastAccelSentAt, this.accelIntervalMs);
                    if (aligned < 0) return;
                    this.lastAccelSentAt = aligned;
                    this.processActions(this.engine.makeAccel(
                        targetDeviceId,
                        (s.x ?? 0) / -9.80665,
                        (s.y ?? 0) / -9.80665,
                        (s.z ?? 0) / -9.80665,
                        this.controlReliability
                    ));
                };
                s.start();
                this.accelSensor = s;
                return;
            } catch (e) {
                if (!this.accelSensor && !this.accelDeviceMotionHandler) {
                    console.warn('[SensorProcessor] Accelerometer API failed, falling back to DeviceMotion', e);
                }
            }
        }

        if (typeof DeviceMotionEvent !== 'undefined') {
            this.accelDeviceMotionHandler = (e: DeviceMotionEvent) => {
                const a = e.accelerationIncludingGravity;
                if (!a) return;
                this.accelGotReading = true;
                this.lastAccelEvent = { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 };
                const aligned = this.gridAlign(Date.now(), this.lastAccelSentAt, this.accelIntervalMs);
                if (aligned < 0) return;
                this.lastAccelSentAt = aligned;
                this.processActions(this.engine.makeAccel(
                    targetDeviceId,
                    (a.x ?? 0) / -9.80665,
                    (a.y ?? 0) / -9.80665,
                    (a.z ?? 0) / -9.80665,
                    this.controlReliability
                ));
            };
            window.addEventListener('devicemotion', this.accelDeviceMotionHandler);
        }
    }

    stopAccel() {
        if (this.accelSensor) {
            this.accelSensor.stop();
            this.accelSensor = null;
        }
        if (this.accelDeviceMotionHandler) {
            window.removeEventListener('devicemotion', this.accelDeviceMotionHandler);
            this.accelDeviceMotionHandler = null;
        }
        this.lastAccelEvent = null;
    }

    checkSensorsAfterDelay(delayMs = 2000) {
        setTimeout(() => {
            const accelRunning = !!(this.accelSensor || this.accelDeviceMotionHandler);
            const gyroRunning = !!(this.gyroSensor || this.gyroDeviceMotionHandler);
            if ((accelRunning && !this.accelGotReading) || (gyroRunning && !this.gyroGotReading)) {
                this.onStatusChange?.('unavailable');
            } else if (accelRunning || gyroRunning) {
                this.onStatusChange?.('active');
            }
        }, delayMs);
    }

    startGyro(targetDeviceId: string) {
        if (this.gyroSensor || this.gyroDeviceMotionHandler) return;
        this.gyroGotReading = false;

        if (SensorProcessor.permissionGranted === false) {
            this.onStatusChange?.('permission_denied');
            return;
        }

        if (typeof Gyroscope !== 'undefined') {
            try {
                const s = new Gyroscope({ frequency: 60 });
                s.onreading = () => {
                    this.gyroGotReading = true;
                    const aligned = this.gridAlign(Date.now(), this.lastGyroSentAt, this.gyroIntervalMs);
                    if (aligned < 0) return;
                    this.lastGyroSentAt = aligned;
                    this.processActions(this.engine.makeGyro(
                        targetDeviceId,
                        s.x ?? 0,
                        s.y ?? 0,
                        s.z ?? 0,
                        this.controlReliability
                    ));
                };
                s.start();
                this.gyroSensor = s;
                return;
            } catch (e) {
                if (!this.gyroSensor && !this.gyroDeviceMotionHandler) {
                    console.warn('[SensorProcessor] Gyroscope API failed, falling back to DeviceMotion', e);
                }
            }
        }

        if (typeof DeviceMotionEvent !== 'undefined') {
            this.gyroDeviceMotionHandler = (e: DeviceMotionEvent) => {
                const r = e.rotationRate;
                if (!r) return;
                this.gyroGotReading = true;
                const aligned = this.gridAlign(Date.now(), this.lastGyroSentAt, this.gyroIntervalMs);
                if (aligned < 0) return;
                this.lastGyroSentAt = aligned;
                const d2r = Math.PI / 180;
                this.processActions(this.engine.makeGyro(
                    targetDeviceId,
                    (r.alpha ?? 0) * d2r,
                    (r.beta ?? 0) * d2r,
                    (r.gamma ?? 0) * d2r,
                    this.controlReliability
                ));
            };
            window.addEventListener('devicemotion', this.gyroDeviceMotionHandler);
        }
    }

    stopGyro() {
        if (this.gyroSensor) {
            this.gyroSensor.stop();
            this.gyroSensor = null;
        }
        if (this.gyroDeviceMotionHandler) {
            window.removeEventListener('devicemotion', this.gyroDeviceMotionHandler);
            this.gyroDeviceMotionHandler = null;
        }
    }

    startOrientation(targetDeviceId: string) {
        if (this.orientationTimer) return;
        this.startAccel(targetDeviceId);
        this.orientationTimer = setInterval(() => {
            if (this.orientationEnabled && this.lastAccelEvent) {
                const q = this.computeQuaternion(this.lastAccelEvent.x, this.lastAccelEvent.y, this.lastAccelEvent.z);
                this.processActions(this.engine.makeOrientation(
                    targetDeviceId,
                    q[0], q[1], q[2], q[3],
                    this.controlReliability
                ));
            }
        }, this.orientationIntervalMs);
    }

    stopOrientation() {
        if (this.orientationTimer) {
            clearInterval(this.orientationTimer);
            this.orientationTimer = null;
        }
    }

    private computeQuaternion(ax: number, ay: number, az: number): [number, number, number, number] {
        const g = Math.sqrt(ax * ax + ay * ay + az * az);
        if (g === 0) return [0, 0, 0, 1];
        const nx = ax / g, ny = ay / g, nz = az / g;
        const p = Math.atan2(-nx, Math.sqrt(ny * ny + nz * nz)), r = Math.atan2(ny, nz);
        const cp = Math.cos(p * 0.5), sp = Math.sin(p * 0.5), cr = Math.cos(r * 0.5), sr = Math.sin(r * 0.5);
        return [sr * cp, cr * sp, sr * sp, cr * cp]; // Simplified for yaw=0
    }

    configure(config: { controlReliability?: number, accelIntervalMs?: number, gyroIntervalMs?: number, orientationEnabled?: boolean, orientationIntervalMs?: number }, targetDeviceId: string) {
        if (config.controlReliability !== undefined) this.controlReliability = config.controlReliability;

        if (config.accelIntervalMs !== undefined && config.accelIntervalMs !== this.accelIntervalMs) {
            const wasRunning = this.accelSensor || this.accelDeviceMotionHandler;
            this.accelIntervalMs = config.accelIntervalMs;
            if (wasRunning) {
                this.stopAccel();
                this.startAccel(targetDeviceId);
            }
        }

        if (config.gyroIntervalMs !== undefined && config.gyroIntervalMs !== this.gyroIntervalMs) {
            const wasRunning = this.gyroSensor || this.gyroDeviceMotionHandler;
            this.gyroIntervalMs = config.gyroIntervalMs;
            if (wasRunning) {
                this.stopGyro();
                this.startGyro(targetDeviceId);
            }
        }

        if (config.orientationEnabled !== undefined) {
            this.orientationEnabled = config.orientationEnabled;
            if (config.orientationEnabled) {
                this.startOrientation(targetDeviceId);
            } else {
                this.stopOrientation();
            }
        }
        if (config.orientationIntervalMs !== undefined) {
            const nextInterval = Math.max(10, config.orientationIntervalMs);
            if (nextInterval !== this.orientationIntervalMs) {
                const wasRunning = !!this.orientationTimer;
                this.orientationIntervalMs = nextInterval;
                if (wasRunning) {
                    this.stopOrientation();
                    this.startOrientation(targetDeviceId);
                }
            }
        }
    }

    reset() {
        this.stopAccel();
        this.stopGyro();
        this.stopOrientation();
    }
}
