// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import dpadLeftUp from '../../assets/dpad/dpad_left_up.svg?url';
import dpadUp from '../../assets/dpad/dpad_up.svg?url';
import dpadRightUp from '../../assets/dpad/dpad_right_up.svg?url';
import dpadLeft from '../../assets/dpad/dpad_left.svg?url';
import dpadInactive from '../../assets/dpad/dpad_inactive.svg?url';
import dpadRight from '../../assets/dpad/dpad_right.svg?url';
import dpadLeftDown from '../../assets/dpad/dpad_left_down.svg?url';
import dpadDown from '../../assets/dpad/dpad_down.svg?url';
import dpadRightDown from '../../assets/dpad/dpad_right_down.svg?url';

const BUILT_IN_FRAME_URLS: Record<string, string> = {
    left_up: dpadLeftUp,
    up: dpadUp,
    right_up: dpadRightUp,
    left: dpadLeft,
    inactive: dpadInactive,
    right: dpadRight,
    left_down: dpadLeftDown,
    down: dpadDown,
    right_down: dpadRightDown,
};

const BUILT_IN_FRAME_SIZE = 512;
let builtInFrames: Record<string, ImageBitmap> | null = null;
let builtInLoading: Promise<Record<string, ImageBitmap>> | null = null;

export function getBuiltInDpadFrame(suffix: string): ImageBitmap | undefined {
    return builtInFrames?.[suffix];
}

export function loadBuiltInDpadSkin(): Promise<Record<string, ImageBitmap>> {
    if (builtInFrames) return Promise.resolve(builtInFrames);
    if (builtInLoading) return builtInLoading;
    builtInLoading = (async () => {
        const entries = await Promise.all(
            Object.entries(BUILT_IN_FRAME_URLS).map(async ([suffix, url]) => {
                const bitmap = await rasterizeSvg(url, BUILT_IN_FRAME_SIZE);
                return [suffix, bitmap] as const;
            }),
        );
        builtInFrames = Object.fromEntries(entries);
        builtInLoading = null;
        return builtInFrames;
    })();
    return builtInLoading;
}

async function rasterizeSvg(url: string, size: number): Promise<ImageBitmap> {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for d-pad rasterization');
    ctx.drawImage(img, 0, 0, size, size);
    return await createImageBitmap(canvas);
}
