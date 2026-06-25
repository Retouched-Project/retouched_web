// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useRef, useEffect, useState } from 'react';

interface Props {
    initialText: string;
    onKey: (key: string) => void;
}

export const KeyboardOverlay: React.FC<Props> = ({ initialText, onKey }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const prev = useRef(initialText);
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.value = initialText;
        prev.current = initialText;
        // Best effort: raises the keyboard on Android/desktop. iOS ignores this
        // (no user gesture); the user taps to bring it up, handled below.
        el.focus();
        const end = initialText.length;
        el.setSelectionRange(end, end);
    }, [initialText]);

    // Focus from within the tap gesture so iOS raises the keyboard. Must be
    // synchronous (no await) for Safari to honor it.
    const focusInput = () => {
        inputRef.current?.focus();
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.currentTarget.value;
        const p = prev.current;

        // Diff against the previous value: longest common prefix and suffix,
        // then the middle is what changed.
        const max = Math.min(p.length, next.length);
        let pre = 0;
        while (pre < max && p[pre] === next[pre]) pre++;
        let suf = 0;
        while (
            suf < p.length - pre &&
            suf < next.length - pre &&
            p[p.length - 1 - suf] === next[next.length - 1 - suf]
        ) suf++;

        const removed = p.length - pre - suf;
        const inserted = next.slice(pre, next.length - suf);

        for (let i = 0; i < removed; i++) onKey('');
        if (inserted.length > 0) onKey(inserted);

        prev.current = next;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onKey('\n');
        }
    };

    return (
        <div
            onClick={focusInput}
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 300,
                background: '#1e1e2e',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                // Keep the field in the upper area so the soft keyboard, which
                // covers the lower part of the screen, cannot hide it.
                justifyContent: 'flex-start',
                gap: 16,
                padding: 24,
                paddingTop: '12vh',
            }}
        >
            {!focused && (
                <div style={{ color: '#a6adc8', fontSize: 18 }}>Tap to type</div>
            )}
            <input
                ref={inputRef}
                type="text"
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="enter"
                style={{
                    width: '100%',
                    maxWidth: 480,
                    fontSize: 24,
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '2px solid #45475a',
                    background: '#11111b',
                    color: '#cdd6f4',
                    outline: 'none',
                }}
            />
        </div>
    );
};
