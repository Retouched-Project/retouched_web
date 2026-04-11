// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useRef, useEffect, useCallback } from 'react';
import { SamplingMode } from '../proto/schemeExtensions';

interface Props {
    skin: {
        up?: ImageBitmap,
        down?: ImageBitmap,
        left?: ImageBitmap,
        right?: ImageBitmap,
        center?: ImageBitmap,
        ul?: ImageBitmap,
        ur?: ImageBitmap,
        dl?: ImageBitmap,
        dr?: ImageBitmap,
    };
    bounds: { width: number; height: number };
    disabled?: boolean;
    sampling?: SamplingMode;
    stateIndex: number;
    dragOffset: { x: number; y: number };
}

export const DpadControl: React.FC<Props> = ({
    skin, bounds, disabled, sampling, stateIndex, dragOffset
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const getBitmap = useCallback((idx: number) => {
        switch (idx) {
            case 0: return skin.ul;
            case 1: return skin.up;
            case 2: return skin.ur;
            case 3: return skin.left;
            case 4: return skin.center;
            case 5: return skin.right;
            case 6: return skin.dl;
            case 7: return skin.down;
            case 8: return skin.dr;
            default: return skin.center;
        }
    }, [skin]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const bitmap = getBitmap(stateIndex);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = sampling === SamplingMode.Bilinear;

        if (bitmap) {
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        }
    }, [skin, stateIndex, sampling, bounds, getBitmap]);

    if (disabled) return null;

    return (
        <canvas
            ref={canvasRef}
            width={256}
            height={256}
            style={{
                width: bounds.width,
                height: bounds.height,
                transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
                pointerEvents: 'none',
            }}
        />
    );
};