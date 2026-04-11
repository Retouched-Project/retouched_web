// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

interface SensorOptions {
    frequency?: number;
    referenceFrame?: 'device' | 'screen';
}

interface SensorErrorEvent extends Event {
    readonly error: DOMException;
}

interface Sensor extends EventTarget {
    readonly activated: boolean;
    readonly hasReading: boolean;
    readonly timestamp: number | null;
    start(): void;
    stop(): void;
    onreading: ((this: Sensor, ev: Event) => void) | null;
    onerror: ((this: Sensor, ev: SensorErrorEvent) => void) | null;
    onactivate: ((this: Sensor, ev: Event) => void) | null;
}

declare class Accelerometer implements Sensor {
    constructor(options?: SensorOptions);
    readonly x: number | null;
    readonly y: number | null;
    readonly z: number | null;
    readonly activated: boolean;
    readonly hasReading: boolean;
    readonly timestamp: number | null;
    start(): void;
    stop(): void;
    onreading: ((this: Sensor, ev: Event) => void) | null;
    onerror: ((this: Sensor, ev: SensorErrorEvent) => void) | null;
    onactivate: ((this: Sensor, ev: Event) => void) | null;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
    dispatchEvent(event: Event): boolean;
}

declare class Gyroscope implements Sensor {
    constructor(options?: SensorOptions);
    readonly x: number | null;
    readonly y: number | null;
    readonly z: number | null;
    readonly activated: boolean;
    readonly hasReading: boolean;
    readonly timestamp: number | null;
    start(): void;
    stop(): void;
    onreading: ((this: Sensor, ev: Event) => void) | null;
    onerror: ((this: Sensor, ev: SensorErrorEvent) => void) | null;
    onactivate: ((this: Sensor, ev: Event) => void) | null;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
    dispatchEvent(event: Event): boolean;
}

declare class Magnetometer implements Sensor {
    constructor(options?: SensorOptions);
    readonly x: number | null;
    readonly y: number | null;
    readonly z: number | null;
    readonly activated: boolean;
    readonly hasReading: boolean;
    readonly timestamp: number | null;
    start(): void;
    stop(): void;
    onreading: ((this: Sensor, ev: Event) => void) | null;
    onerror: ((this: Sensor, ev: SensorErrorEvent) => void) | null;
    onactivate: ((this: Sensor, ev: Event) => void) | null;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
    dispatchEvent(event: Event): boolean;
}
