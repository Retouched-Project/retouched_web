// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

export class VibrationService {
    static vibrate(pattern: number | number[] | { duration?: number } = 1000): void {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            if (typeof pattern === 'object' && !Array.isArray(pattern)) {
                navigator.vibrate(pattern.duration ?? 1000);
            } else {
                navigator.vibrate(pattern || 1000);
            }
        }
    }
}
