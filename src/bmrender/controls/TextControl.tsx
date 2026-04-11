// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React from 'react';

interface Props {
    text: string;
    fontSize: number;
    color: number;
    disabled?: boolean;
}

function argbToRgba(argb: number): string {
    const a = ((argb >>> 24) & 0xFF) / 255;
    const r = (argb >>> 16) & 0xFF;
    const g = (argb >>> 8) & 0xFF;
    const b = argb & 0xFF;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const TextControl: React.FC<Props> = ({ text, fontSize, color, disabled }) => {
    if (disabled || !text) return null;

    const textColor = color ? argbToRgba(color) : 'white';

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                pointerEvents: 'none',
                userSelect: 'none',
                fontSize: `${fontSize}px`,
                color: textColor,
                fontFamily: 'sans-serif',
                fontWeight: 'bold',
                textAlign: 'center',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
            }}
        >
            {text}
        </div>
    );
};
