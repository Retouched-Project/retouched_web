// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import logo from '../assets/retouched_logo_text_web.svg';

export const AboutTab: React.FC = () => {
    return (
        <div style={styles.container}>
            <img src={logo} alt="Retouched Web Logo" style={{ height: 60, marginBottom: 20 }} />
            <h2 style={{ color: '#fff', margin: 0 }}>Retouched Web</h2>
            <p style={{ color: '#aaa', marginTop: 5 }}>Version 2.0 Experimental</p>

            <div style={{ height: 40 }} />

            <p style={{ color: '#666', fontSize: '0.9rem', textAlign: 'center' }}>
                Copyright (C) 2026<br />
                ddavef/KinteLiX
            </p>
        </div>
    );
};

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 20,
    }
};
