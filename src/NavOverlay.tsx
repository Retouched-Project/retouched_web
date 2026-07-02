// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useState } from 'react';
import navActivate from './assets/nav/nav_btn_activate.svg?url';
import navBack from './assets/nav/nav_btn_back.svg?url';
import navUp from './assets/nav/nav_btn_up.svg?url';
import navDown from './assets/nav/nav_btn_down.svg?url';
import navLeft from './assets/nav/nav_btn_left.svg?url';
import navRight from './assets/nav/nav_btn_right.svg?url';

interface Props {
    onNav: (command: string) => void;
}

const GAP = 15;
const SIZES: Record<string, { w: number; h: number; src: string }> = {
    activate: { w: 94, h: 94, src: navActivate },
    up: { w: 93, h: 182, src: navUp },
    down: { w: 93, h: 189, src: navDown },
    left: { w: 110, h: 93, src: navLeft },
    right: { w: 100, h: 93, src: navRight },
    back: { w: 63, h: 57, src: navBack },
};

const NavButton: React.FC<{ name: string; onNav: (c: string) => void }> = ({ name, onNav }) => {
    const [pressed, setPressed] = useState(false);
    const s = SIZES[name];
    return (
        <img
            src={s.src}
            width={s.w}
            height={s.h}
            draggable={false}
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setPressed(true);
                onNav(name);
            }}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            style={{
                display: 'block',
                filter: pressed ? 'brightness(0.55)' : undefined,
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
            }}
        />
    );
};

export const NavOverlay: React.FC<Props> = ({ onNav }) => {
    const a = SIZES.activate;
    const upDy = -(a.h / 2 + GAP + SIZES.up.h / 2);
    const downDy = a.h / 2 + GAP + SIZES.down.h / 2;
    const leftDx = -(a.w / 2 + GAP + SIZES.left.w / 2);
    const rightDx = a.w / 2 + GAP + SIZES.right.w / 2;

    const centered = (dx: number, dy: number, name: string) => (
        <div
            key={name}
            style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
            }}
        >
            <NavButton name={name} onNav={onNav} />
        </div>
    );

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 50,
                background: '#000',
                touchAction: 'none',
            }}
        >
            {centered(0, upDy, 'up')}
            {centered(0, downDy, 'down')}
            {centered(leftDx, 0, 'left')}
            {centered(rightDx, 0, 'right')}
            {centered(0, 0, 'activate')}
            <div
                style={{
                    position: 'absolute',
                    top: 'max(env(safe-area-inset-top), 8px)',
                    left: 'max(env(safe-area-inset-left), 8px)',
                }}
            >
                <NavButton name="back" onNav={onNav} />
            </div>
        </div>
    );
};
