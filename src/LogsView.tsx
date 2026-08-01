// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LOG_LEVELS, logStore, type LogLevel } from './utils/logStore';
import { getLogLevel, setLogLevel } from './utils/logger';

const LEVEL_COLORS: Record<LogLevel, string> = {
    Error: '#FF5555',
    Warn: '#FFCC00',
    Info: '#5FD75F',
    Debug: '#5F9FFF',
    Trace: '#5FD7D7',
};

interface LogsViewProps {
    onClose: () => void;
}

export const LogsView: React.FC<LogsViewProps> = ({ onClose }) => {
    const version = useSyncExternalStore(logStore.subscribe, logStore.getVersion);
    const [level, setLevel] = useState<LogLevel>(getLogLevel);
    const [toast, setToast] = useState<string | null>(null);

    const listRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);
    const toastTimer = useRef<number | null>(null);

    const entries = logStore.entries;

    const handleScroll = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        // Following the tail only while the user is already there, so scrolling
        // back to read something does not get yanked away by the next drain.
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    }, []);

    useLayoutEffect(() => {
        const el = listRef.current;
        if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
    }, [version]);

    useEffect(() => {
        return () => {
            if (toastTimer.current !== null) clearTimeout(toastTimer.current);
        };
    }, []);

    const showToast = (text: string) => {
        setToast(text);
        if (toastTimer.current !== null) clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 1500);
    };

    const handleLevel = (next: LogLevel) => {
        setLevel(next);
        setLogLevel(next);
    };

    const handleCopy = async () => {
        const text = logStore.entries
            .map((e) => `[${e.level}] ${e.source}: ${e.message}`)
            .join('\n');
        showToast((await copyText(text)) ? 'Logs copied' : 'Copy failed');
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <button style={styles.iconButton} onClick={onClose} title="Back" aria-label="Back">
                    ‹
                </button>
                <div style={styles.title}>Logs</div>
                <select
                    style={styles.select}
                    value={level}
                    onChange={(e) => handleLevel(e.target.value as LogLevel)}
                    title="Log level"
                >
                    {LOG_LEVELS.map((l) => (
                        <option key={l} value={l}>
                            {l}
                        </option>
                    ))}
                </select>
                <button style={styles.iconButton} onClick={handleCopy} title="Copy all" aria-label="Copy all">
                    ⧉
                </button>
                <button style={styles.iconButton} onClick={logStore.clear} title="Clear" aria-label="Clear">
                    🗑
                </button>
            </header>

            <div style={styles.list} ref={listRef} onScroll={handleScroll}>
                {entries.length === 0 ? (
                    <div style={styles.empty}>No logs yet</div>
                ) : (
                    entries.map((e, i) => (
                        <div key={i} style={styles.row}>
                            <span style={{ color: LEVEL_COLORS[e.level], fontWeight: 'bold' }}>[{e.level}] </span>
                            <span style={styles.source}>{e.source}: </span>
                            <span>{e.message}</span>
                        </div>
                    ))
                )}
            </div>

            {toast && <div style={styles.toast}>{toast}</div>}
        </div>
    );
};

async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Falls through to the textarea path below.
    }
    // The clipboard API needs a secure context.
    try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        return ok;
    } catch {
        return false;
    }
}

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column' as const,
        position: 'fixed' as const,
        inset: 0,
        backgroundColor: '#12121c',
        zIndex: 900,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
    },
    title: {
        flex: 1,
        color: '#fff',
        fontSize: '1.1rem',
        fontWeight: 'bold' as const,
        paddingLeft: 4,
    },
    iconButton: {
        background: 'none',
        border: 'none',
        color: '#fff',
        fontSize: 20,
        lineHeight: 1,
        cursor: 'pointer',
        padding: '6px 10px',
    },
    select: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        padding: '6px 8px',
        fontSize: 14,
        cursor: 'pointer',
    },
    list: {
        flex: 1,
        overflowY: 'auto' as const,
        overflowX: 'hidden' as const,
        padding: 8,
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#e0e0e0',
        userSelect: 'text' as const,
        WebkitUserSelect: 'text' as const,
    },
    row: {
        whiteSpace: 'pre-wrap' as const,
        wordBreak: 'break-word' as const,
        padding: '1px 0',
    },
    source: {
        color: 'rgba(255,255,255,0.4)',
    },
    empty: {
        color: '#888',
        textAlign: 'center' as const,
        marginTop: 40,
        fontFamily: 'sans-serif',
        fontSize: 14,
    },
    toast: {
        position: 'absolute' as const,
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0,0,0,0.85)',
        color: '#fff',
        padding: '8px 16px',
        borderRadius: 20,
        fontSize: 14,
        pointerEvents: 'none' as const,
    },
};
