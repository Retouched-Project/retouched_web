// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

export class DeviceInfo {
    private static readonly CHARS = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890';

    private static deviceId: string | null = null;
    private static appId: string = 'c3eeomasdq211sxtlh89wjl2';

    getDeviceId(): string { return DeviceInfo.getDeviceId(); }
    getAppId(): string { return DeviceInfo.getAppId(); }
    getDeviceName(): string { return DeviceInfo.getDeviceName(); }
    getDeviceTypeCode(): number { return DeviceInfo.getDeviceTypeCode(); }

    static getDeviceId(): string {
        if (!this.deviceId) {
            this.deviceId = this.generateRandomId(16);
        }
        return this.deviceId;
    }

    static getAppId(): string {
        return this.appId;
    }

    static getDeviceName(): string {
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) return "Android Web";
        if (/iphone|ipad|ipod/i.test(ua)) return "iOS Web";
        if (/windows/i.test(ua)) return "Windows Web";
        if (/mac/i.test(ua)) return "Mac Web";
        if (/linux/i.test(ua)) return "Linux Web";
        return "Retouched Web";
    }

    static getDeviceTypeCode(): number {
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) return 4;
        if (/iphone|ipad|ipod/i.test(ua)) return 2;
        return 0;
    }

    private static generateRandomId(len: number): string {
        let result = '';
        for (let i = 0; i < len; i++) {
            result += this.CHARS.charAt(Math.floor(Math.random() * this.CHARS.length));
        }
        return result;
    }
}
