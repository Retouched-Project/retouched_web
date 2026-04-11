// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useId } from 'react';
import logoFull from './assets/retouched_logo.svg';
import logoOutline from './assets/retouched_logo_outline.svg';

interface LoadingLogoProps {
    progress: number;
    size?: number;
}

export const LoadingLogo: React.FC<LoadingLogoProps> = ({
    progress,
    size = 140,
}) => {
    const id = useId();
    const fillClip = `fill-clip-${id}`;
    const outlineClip = `outline-clip-${id}`;
    const p = Math.max(0, Math.min(1, progress));

    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg
                width={0}
                height={0}
                style={{ position: 'absolute' }}
            >
                <defs>
                    {}
                    <clipPath id={fillClip} clipPathUnits="objectBoundingBox">
                        <rect x={0} y={1 - p} width={1} height={p} />
                    </clipPath>
                    {}
                    <clipPath id={outlineClip} clipPathUnits="objectBoundingBox">
                        <rect x={0} y={0} width={1} height={1 - p} />
                    </clipPath>
                </defs>
            </svg>
            {}
            <img
                src={logoOutline}
                alt=""
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: size,
                    height: size,
                    clipPath: `url(#${outlineClip})`,
                }}
            />
            {}
            <img
                src={logoFull}
                alt=""
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: size,
                    height: size,
                    clipPath: `url(#${fillClip})`,
                }}
            />
        </div>
    );
};
