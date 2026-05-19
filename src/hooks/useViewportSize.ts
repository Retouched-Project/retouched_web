// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { useEffect, useState } from 'react';

export interface ViewportSize {
    w: number;
    h: number;
}

function read(): ViewportSize {
    return { w: window.innerWidth, h: window.innerHeight };
}

export function useViewportSize(): ViewportSize {
    const [size, setSize] = useState<ViewportSize>(read);

    useEffect(() => {
        const update = () => {
            const next = read();
            setSize(prev => (prev.w === next.w && prev.h === next.h) ? prev : next);
        };

        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
        const vv = window.visualViewport;
        vv?.addEventListener('resize', update);

        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
            vv?.removeEventListener('resize', update);
        };
    }, []);

    return size;
}
