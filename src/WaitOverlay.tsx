// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React from 'react';
import waitIcon from './assets/wait.svg?url';

export const WaitOverlay: React.FC = () => (
    <div
        style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            background: '#000',
            touchAction: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            WebkitUserSelect: 'none',
        }}
    >
        <img src={waitIcon} width={64} height={64} draggable={false} alt="" />
        <div style={{ height: 8 }} />
        <div style={{ color: '#666666', fontSize: 22, fontFamily: "'Inter', sans-serif" }}>
            Waiting for Game
        </div>
    </div>
);
