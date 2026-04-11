// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import React, { useState } from 'react';

interface OptionsTabProps {
    floatingDpadEnabled: boolean;
    setFloatingDpadEnabled: (v: boolean) => void;
    smartWidescreenEnabled: boolean;
    setSmartWidescreenEnabled: (v: boolean) => void;
    capabilitiesOverride: number | null;
    setCapabilitiesOverride: (v: number | null) => void;
    preserveDpadDragEnabled: boolean;
    setPreserveDpadDragEnabled: (v: boolean) => void;
}

export const OptionsTab: React.FC<OptionsTabProps> = ({
    floatingDpadEnabled,
    setFloatingDpadEnabled,
    smartWidescreenEnabled,
    setSmartWidescreenEnabled,
    capabilitiesOverride,
    setCapabilitiesOverride,
    preserveDpadDragEnabled,
    setPreserveDpadDragEnabled,
}) => {
    const [showCapDialog, setShowCapDialog] = useState(false);

    const capLabel = capabilitiesOverride == null
        ? 'Auto-detect (Default)'
        : `Manual Mask: ${capabilitiesOverride} (0x${capabilitiesOverride.toString(16)})`;

    return (
        <div style={styles.container}>
            <div style={styles.sectionHeader}>Input</div>
            <SwitchItem
                title="Floating D-Pad"
                subtitle="Allow D-Pad to move when dragging outside center"
                value={floatingDpadEnabled}
                onChange={setFloatingDpadEnabled}
            />
            <SwitchItem
                title="Persistent D-Pad Drag"
                subtitle="Remember D-Pad drag position across layout changes"
                value={preserveDpadDragEnabled}
                onChange={setPreserveDpadDragEnabled}
            />

            <div style={styles.sectionHeader}>Display</div>
            <SwitchItem
                title="Force Widescreen"
                subtitle="Stretches D-Pad layouts to fill widescreen (D-Pad layouts only)"
                value={smartWidescreenEnabled}
                onChange={setSmartWidescreenEnabled}
            />
            <div style={styles.sectionHeader}>Advanced</div>
            <div style={styles.item} onClick={() => setShowCapDialog(true)}>
                <div style={styles.textContainer}>
                    <div style={styles.title}>Sensor Capabilities Override</div>
                    <div style={styles.subtitle}>{capLabel}</div>
                </div>
                {capabilitiesOverride != null && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setCapabilitiesOverride(null); }}
                        style={styles.clearButton}
                    >✕</button>
                )}
            </div>

            {showCapDialog && (
                <CapabilitiesDialog
                    initial={capabilitiesOverride ?? 0}
                    onSave={(mask) => { setCapabilitiesOverride(mask); setShowCapDialog(false); }}
                    onCancel={() => setShowCapDialog(false)}
                />
            )}
        </div>
    );
};

const CapabilitiesDialog: React.FC<{
    initial: number;
    onSave: (mask: number) => void;
    onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
    const [gyro, setGyro] = useState((initial & 1) !== 0);
    const [rotation, setRotation] = useState((initial & 2) !== 0);

    return (
        <div style={styles.dialogOverlay} onClick={onCancel}>
            <div style={styles.dialogBox} onClick={(e) => e.stopPropagation()}>
                <div style={styles.dialogTitle}>Override Sensor Capabilities</div>
                <label style={styles.checkRow}>
                    <input type="checkbox" checked={gyro} onChange={(e) => setGyro(e.target.checked)} />
                    <span>Gyroscope</span>
                </label>
                <label style={styles.checkRow}>
                    <input type="checkbox" checked={rotation} onChange={(e) => setRotation(e.target.checked)} />
                    <span>Rotation</span>
                </label>
                <div style={styles.dialogActions}>
                    <button style={styles.dialogBtn} onClick={onCancel}>Cancel</button>
                    <button
                        style={{ ...styles.dialogBtn, ...styles.dialogBtnPrimary }}
                        onClick={() => {
                            let mask = 0;
                            if (gyro) mask |= 1;
                            if (rotation) mask |= 2;
                            onSave(mask);
                        }}
                    >Save</button>
                </div>
            </div>
        </div>
    );
};

interface SwitchItemProps {
    title: string;
    subtitle?: string;
    value: boolean;
    onChange: (v: boolean) => void;
}

const SwitchItem: React.FC<SwitchItemProps> = ({ title, subtitle, value, onChange }) => {
    return (
        <div style={styles.item} onClick={() => onChange(!value)}>
            <div style={styles.textContainer}>
                <div style={styles.title}>{title}</div>
                {subtitle && <div style={styles.subtitle}>{subtitle}</div>}
            </div>
            <div className={`m3-switch ${value ? 'active' : 'inactive'}`}>
                <div className="m3-thumb" />
            </div>
        </div>
    );
};

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column' as const,
        height: '100%',
        overflowY: 'auto' as const,
    },
    sectionHeader: {
        padding: '15px 20px 5px 20px',
        color: '#7c4dff',
        fontWeight: 'bold',
        fontSize: '0.9rem',
        textTransform: 'uppercase' as const,
    },
    item: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '15px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer',
        userSelect: 'none' as const,
    },
    textContainer: {
        flex: 1,
        paddingRight: 10,
    },
    title: {
        color: '#fff',
        fontSize: '1rem',
        marginBottom: 4,
    },
    subtitle: {
        color: '#ccc',
        fontSize: '0.85rem',
        marginTop: 4,
    },
    capabilitiesText: {
        color: '#aaa',
        fontSize: '0.85rem',
        marginTop: 4,
    },
    switchTrack: {
        width: 44,
        height: 24,
        borderRadius: 12,
        position: 'relative' as const,
        transition: 'background-color 0.2s',
    },
    switchThumb: {
        width: 20,
        height: 20,
        borderRadius: '50%',
        backgroundColor: '#fff',
        position: 'absolute' as const,
        top: 2,
        left: 2,
        transition: 'transform 0.2s',
    },
    clearButton: {
        background: 'none',
        border: 'none',
        color: '#aaa',
        fontSize: 18,
        cursor: 'pointer',
        padding: '4px 8px',
    },
    dialogOverlay: {
        position: 'fixed' as const,
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    dialogBox: {
        backgroundColor: '#1e1e2e',
        borderRadius: 12,
        padding: '20px 24px',
        width: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    },
    dialogTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold' as const,
        marginBottom: 16,
    },
    checkRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: '#fff',
        fontSize: 15,
        padding: '8px 0',
        cursor: 'pointer',
    } as React.CSSProperties,
    dialogActions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 20,
    },
    dialogBtn: {
        padding: '8px 16px',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 14,
        backgroundColor: 'rgba(255,255,255,0.1)',
        color: '#fff',
    },
    dialogBtnPrimary: {
        backgroundColor: '#7c4dff',
    },
};
