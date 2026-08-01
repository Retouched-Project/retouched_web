// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { configure_logging, set_log_level, take_logs } from '../wasm/bronze_monkey';
import { LOG_LEVELS, logStore, type LogEntry, type LogLevel } from './logStore';

const LEVEL_RANK: Record<LogLevel, number> = {
    Error: 1,
    Warn: 2,
    Info: 3,
    Debug: 4,
    Trace: 5,
};

const STORAGE_KEY = 'logLevel';
const DRAIN_INTERVAL_MS = 500;
const LIB_RING_CAPACITY = 2000;

// Captured before the patch below replaces them, so logging never recurses.
const native = {
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    debug: console.debug.bind(console),
};

let currentLevel: LogLevel = loadLevel();
let drainTimer: number | null = null;
let installed = false;

function loadLevel(): LogLevel {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLevel(saved) ? saved : 'Info';
}

function isLevel(value: unknown): value is LogLevel {
    return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

export function getLogLevel(): LogLevel {
    return currentLevel;
}

export function setLogLevel(level: LogLevel) {
    currentLevel = level;
    localStorage.setItem(STORAGE_KEY, level);
    try {
        set_log_level(LEVEL_RANK[level]);
    } catch {
        // The engine is not up yet; configureLibLogging applies the level on init.
    }
}

function isEnabled(level: LogLevel): boolean {
    return LEVEL_RANK[level] <= LEVEL_RANK[currentLevel];
}

function format(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

function record(level: LogLevel, source: string, args: unknown[]) {
    if (!isEnabled(level)) return;
    logStore.add({
        time: new Date(),
        level,
        source,
        message: args.map(format).filter((s) => s.length > 0).join(' '),
    });
}

export interface Logger {
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    info(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    trace(...args: unknown[]): void;
}

export function createLogger(source: string): Logger {
    const emit = (level: LogLevel, consoleFn: (...args: unknown[]) => void) => {
        return (...args: unknown[]) => {
            if (!isEnabled(level)) return;
            record(level, source, args);
            consoleFn(`[${source}]`, ...args);
        };
    };
    return {
        error: emit('Error', native.error),
        warn: emit('Warn', native.warn),
        info: emit('Info', native.info),
        debug: emit('Debug', native.debug),
        trace: emit('Trace', native.debug),
    };
}

const SOURCE_PREFIX = /^\[([^\]]+)\]\s*/;

function captureConsole(level: LogLevel, args: unknown[]) {
    if (!isEnabled(level)) return;
    let source = 'console';
    const rest = [...args];
    if (typeof rest[0] === 'string') {
        const match = SOURCE_PREFIX.exec(rest[0]);
        if (match) {
            source = match[1];
            rest[0] = rest[0].slice(match[0].length);
        }
    }
    record(level, source, rest);
}

// Tees console output and uncaught errors into the store. Safe to call before
// the engine exists; the lib half attaches separately once wasm is up.
export function setupLogging() {
    if (installed) return;
    installed = true;

    console.error = (...args: unknown[]) => {
        captureConsole('Error', args);
        native.error(...args);
    };
    console.warn = (...args: unknown[]) => {
        captureConsole('Warn', args);
        native.warn(...args);
    };
    console.info = (...args: unknown[]) => {
        captureConsole('Info', args);
        native.info(...args);
    };
    console.log = (...args: unknown[]) => {
        captureConsole('Info', args);
        native.log(...args);
    };
    console.debug = (...args: unknown[]) => {
        captureConsole('Debug', args);
        native.debug(...args);
    };

    window.addEventListener('error', (e) => {
        record('Error', 'window', [e.message, e.error]);
    });
    window.addEventListener('unhandledrejection', (e) => {
        record('Error', 'window', ['Unhandled rejection:', e.reason]);
    });
}

// Installs the lib's log ring and starts draining it. Must run after the wasm
// module is loaded, and early enough to catch what the engine logs on startup.
export function configureLibLogging(capacity = LIB_RING_CAPACITY) {
    configure_logging(LEVEL_RANK[currentLevel], capacity);
    if (drainTimer !== null) return;
    drainTimer = window.setInterval(drainLibLogs, DRAIN_INTERVAL_MS);
}

export function stopLibLogging() {
    if (drainTimer === null) return;
    clearInterval(drainTimer);
    drainTimer = null;
}

interface LibLogRecord {
    seq: number | bigint;
    level: string;
    target: string;
    message: string;
}

interface LibLogDrain {
    records?: LibLogRecord[];
    dropped?: number | bigint;
}

function drainLibLogs() {
    let drain: LibLogDrain;
    try {
        drain = (take_logs() ?? {}) as LibLogDrain;
    } catch (e) {
        native.warn('[bronze_monkey] Draining lib logs failed:', e);
        return;
    }

    const records = drain.records ?? [];
    const dropped = Number(drain.dropped ?? 0);
    if (records.length === 0 && dropped === 0) return;

    const batch: LogEntry[] = [];
    for (const r of records) {
        const level = isLevel(r.level) ? r.level : 'Info';
        consoleFor(level)(`[${r.target}]`, r.message);
        batch.push({ time: new Date(), level, source: r.target, message: r.message });
    }
    if (dropped > 0) {
        const message = `${dropped} lib log records dropped (ring overflow)`;
        native.warn('[bronze_monkey]', message);
        batch.push({ time: new Date(), level: 'Warn', source: 'bronze_monkey', message });
    }
    logStore.addAll(batch);
}

function consoleFor(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
        case 'Error':
            return native.error;
        case 'Warn':
            return native.warn;
        case 'Info':
            return native.info;
        default:
            return native.debug;
    }
}
