// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

export const LOG_LEVELS = ['Error', 'Warn', 'Info', 'Debug', 'Trace'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
    time: Date;
    level: LogLevel;
    source: string;
    message: string;
}

const MAX_ENTRIES = 2000;

class LogStore {
    private _entries: LogEntry[] = [];
    private listeners = new Set<() => void>();
    private version = 0;
    private notifyScheduled = false;

    get entries(): readonly LogEntry[] {
        return this._entries;
    }

    // The snapshot is a counter rather than the array itself, so appending in
    // place still reads as a change without copying every entry on each drain.
    getVersion = (): number => this.version;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    add(entry: LogEntry) {
        this._entries.push(entry);
        this.trim();
        this.scheduleNotify();
    }

    addAll(entries: LogEntry[]) {
        if (entries.length === 0) return;
        this._entries.push(...entries);
        this.trim();
        this.scheduleNotify();
    }

    clear = () => {
        this._entries = [];
        this.scheduleNotify();
    };

    private trim() {
        if (this._entries.length > MAX_ENTRIES) {
            this._entries.splice(0, this._entries.length - MAX_ENTRIES);
        }
    }

    private scheduleNotify() {
        this.version++;
        // A burst of records repaints once. Nothing is listening unless the log
        // page is open, so the common case costs a counter bump.
        if (this.notifyScheduled || this.listeners.size === 0) return;
        this.notifyScheduled = true;
        requestAnimationFrame(() => {
            this.notifyScheduled = false;
            for (const listener of this.listeners) listener();
        });
    }
}

export const logStore = new LogStore();
