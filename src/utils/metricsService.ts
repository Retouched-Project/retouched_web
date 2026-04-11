// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

export class MetricsService {
    public static readonly SESSION_START = 1685287796;
    public static readonly SESSION_END = 1685284196;

    static send(type: number, appId: string, deviceId: string): void {
        const epoch = Math.floor(Date.now() / 1000);
        const events = encodeURIComponent(
            `[{"type":${type},"time":${epoch},"appId":"${appId}","deviceId":"${deviceId}","data":""}]`
        );
        const body = `action=logEvents&events=${events}&token=${encodeURIComponent(deviceId)}`;

        fetch('/bmregistry/metrics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        }).catch((err) => {
            console.warn('[MetricsService] Failed to send metrics:', err);
        });
    }
}
