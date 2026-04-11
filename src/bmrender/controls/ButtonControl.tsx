// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useRef, useEffect } from 'react';
import { SamplingMode } from '../proto/schemeExtensions';

interface Props {
    upBitmap?: ImageBitmap;
    downBitmap?: ImageBitmap;
    bounds: { width: number; height: number };
    disabled?: boolean;
    sampling?: SamplingMode;
    pressed: boolean;
}

export const ButtonControl: React.FC<Props> = ({
    upBitmap, downBitmap, bounds, disabled, sampling, pressed
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const bitmap = pressed ? (downBitmap || upBitmap) : upBitmap;

        if (!canvas || !bitmap) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = sampling === SamplingMode.Bilinear;

        ctx.drawImage(bitmap, 0, 0, bounds.width, bounds.height);

    }, [upBitmap, downBitmap, bounds, pressed, sampling]);

    if (disabled) return null;

    return (
        <canvas
            ref={canvasRef}
            width={bounds.width}
            height={bounds.height}
            style={{
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        />
    );
};
