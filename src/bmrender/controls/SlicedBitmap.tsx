// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useRef, useEffect } from 'react';
import { SamplingMode } from '../proto/schemeExtensions';

interface Props {
    bitmap: ImageBitmap | undefined;
    bounds: { width: number; height: number };
    disabled?: boolean;
    sampling?: SamplingMode;
    zIndex?: number;
    debugName?: string;
}

export const SlicedBitmap: React.FC<Props> = ({ bitmap, bounds, disabled, sampling, zIndex }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !bitmap) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = sampling === SamplingMode.Bilinear;

        const srcW = bitmap.width;
        const srcH = bitmap.height;
        const dstW = bounds.width;
        const dstH = bounds.height;

        const SPLIT_L = 0.45;
        const SPLIT_R = 0.55;

        const srcX1 = Math.round(srcW * SPLIT_L);
        const srcX2 = Math.round(srcW * SPLIT_R);

        const scaleY = dstH / srcH;
        const dstX1 = Math.round(srcX1 * scaleY);

        const rightPanelW = Math.round((srcW - srcX2) * scaleY);
        const dstX2 = Math.round(dstW - rightPanelW);

        ctx.drawImage(bitmap, 0, 0, srcX1, srcH, 0, 0, dstX1 + 1, dstH);

        ctx.drawImage(bitmap, srcX1, 0, srcX2 - srcX1, srcH, dstX1, 0, dstX2 - dstX1, dstH);

        ctx.drawImage(bitmap, srcX2, 0, srcW - srcX2, srcH, dstX2 - 1, 0, rightPanelW + 1, dstH);

    }, [bitmap, bounds.width, bounds.height, sampling]);

    if (disabled) return null;

    return (
        <canvas
            ref={canvasRef}
            width={bounds.width}
            height={bounds.height}
            style={{
                width: bounds.width,
                height: bounds.height,
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: zIndex,
                pointerEvents: 'none'
            }}
        />
    );
};
