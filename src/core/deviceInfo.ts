// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright(C) 2026 ddavef/KinteLiX retouched_web

import { DeviceType, generate_device_id } from '../wasm/bronze_monkey';

export class DeviceInfo {
    private static deviceId: string | null = null;
    private static appId: string = 'c3eeomasdq211sxtlh89wjl2';

    getDeviceId(): string { return DeviceInfo.getDeviceId(); }
    getAppId(): string { return DeviceInfo.getAppId(); }
    getDeviceName(): string { return DeviceInfo.getDeviceName(); }
    getDeviceType(): DeviceType { return DeviceInfo.getDeviceType(); }

    static getDeviceId(): string {
        if (!this.deviceId) {
            this.deviceId = generate_device_id();
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

    static getDeviceType(): DeviceType {
        const ua = navigator.userAgent;
        if (/android/i.test(ua)) return DeviceType.Android;
        if (/iphone|ipad|ipod/i.test(ua)) return DeviceType.IPhone;
        return DeviceType.Palm;
    }
}
