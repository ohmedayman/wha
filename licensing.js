const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');

// المفتاح السري لتشفير وتوقيع أكواد التفعيل
const LICENSE_SECRET = 'WA_BULK_SENDER_SECRET_KEY_@2026#MARKETING!';

/**
 * استخراج بصمة جهاز فريدة وثابتة لجهاز العميل (Hardware ID)
 */
function getHWID() {
    try {
        const cpus = os.cpus();
        const cpuModel = (cpus && cpus.length > 0) ? cpus[0].model : 'GENERIC_CPU';
        const hostname = os.hostname() || 'GENERIC_HOST';
        const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024)); // بالجيجابايت
        const platform = os.platform();
        const arch = os.arch();

        // تجميع عناصر الهاردوير الثابتة
        const rawString = `${hostname}|${cpuModel}|${totalMem}GB|${platform}|${arch}`;
        const hash = crypto.createHash('sha256').update(rawString).digest('hex').toUpperCase();

        // تنسيق البصمة على شكل: WA-XXXX-XXXX-XXXX
        return `WA-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}`;
    } catch (err) {
        return 'WA-DEFAULT-HWID-2026';
    }
}

/**
 * توليد كود تفعيل مشفر لجهاز محدد وباقة محددة
 * @param {string} hwid بصمة جهاز العميل
 * @param {string} plan نوع الباقة (trial, 1month, 1year, lifetime)
 * @param {number|null} days عدد الأيام (أو null للباقة الدائمة)
 */
function generateKey(hwid, plan = 'lifetime', days = null) {
    const cleanHWID = (hwid || '').trim().toUpperCase();
    let expiry = null;

    if (days && days > 0) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + parseInt(days));
        expiry = expDate.toISOString().split('T')[0]; // YYYY-MM-DD
    } else if (plan === 'trial') {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 3);
        expiry = expDate.toISOString().split('T')[0];
    } else if (plan === '1month') {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 30);
        expiry = expDate.toISOString().split('T')[0];
    } else if (plan === '1year') {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 365);
        expiry = expDate.toISOString().split('T')[0];
    } else {
        expiry = 'LIFETIME';
    }

    const payload = `${cleanHWID}:${plan}:${expiry}`;
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').substring(0, 12).toUpperCase();
    const encodedPayload = Buffer.from(payload).toString('base64url');

    // كود التفعيل النهائي: KEY-ENCODED_PAYLOAD-SIGNATURE
    return `KEY-${encodedPayload}-${hmac}`;
}

/**
 * التحقق من صحة وصلاحية كود التفعيل
 * @param {string} key كود التفعيل المدخل
 * @param {string} currentHWID بصمة الجهاز الحالي
 */
function verifyKey(key, currentHWID) {
    if (!key || typeof key !== 'string') {
        return { valid: false, error: 'كود التفعيل فارغ' };
    }

    const parts = key.trim().split('-');
    if (parts.length !== 3 || parts[0] !== 'KEY') {
        return { valid: false, error: 'صيغة كود التفعيل غير صحيحة' };
    }

    const encodedPayload = parts[1];
    const signature = parts[2];

    let payload = '';
    try {
        payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    } catch (e) {
        return { valid: false, error: 'كود تفعيل تالف' };
    }

    const payloadParts = payload.split(':');
    if (payloadParts.length !== 3) {
        return { valid: false, error: 'بيانات الكود غير صالحة' };
    }

    const [keyHWID, plan, expiry] = payloadParts;

    // 1. التحقق من التوقيع الرقمي (لم يتم التلاعب بالكود)
    const expectedHmac = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').substring(0, 12).toUpperCase();
    if (signature !== expectedHmac) {
        return { valid: false, error: 'كود تفعيل غير صحيح أو مزور' };
    }

    // 2. التحقق من مطابقة بصمة الجهاز
    if (keyHWID !== currentHWID) {
        return { valid: false, error: 'هذا الكود مخصص لجهاز آخر ولا يعمل على هذا الجهاز' };
    }

    // 3. التحقق من تاريخ الانتهاء
    let isExpired = false;
    let daysLeft = null;

    if (expiry !== 'LIFETIME') {
        const expTime = new Date(expiry + 'T23:59:59').getTime();
        const nowTime = new Date().getTime();

        if (nowTime > expTime) {
            isExpired = true;
            return { valid: false, error: 'انتهت صلاحية كود التفعيل هذا، يرجى التجديد', plan, expiry, isExpired: true };
        }

        daysLeft = Math.ceil((expTime - nowTime) / (1000 * 60 * 60 * 24));
    }

    return {
        valid: true,
        plan,
        expiry,
        daysLeft: expiry === 'LIFETIME' ? 'غير محدود' : daysLeft,
        isExpired: false
    };
}

/**
 * الحصول على مسار ملف الترخيص
 */
function getLicenseFilePath(dataDir) {
    return path.join(dataDir, 'license.json');
}

/**
 * مسار ملف حالة الترخيص السحابي والتنبيهات
 */
function getRemoteStateFilePath(dataDir) {
    return path.join(dataDir, 'remote_license_state.json');
}

/**
 * قراءة حالة الترخيص الحالية للجهاز (مع دمج الفحص الأوفلاين والسحابي)
 */
function getLicenseStatus(dataDir) {
    const hwid = getHWID();
    const licenseFile = getLicenseFilePath(dataDir);
    const remoteStateFile = getRemoteStateFilePath(dataDir);

    // 1. فحص إذا كان الأدمن قد علق أو حظر الحساب عن بُعد
    if (fs.existsSync(remoteStateFile)) {
        try {
            const remoteState = fs.readJsonSync(remoteStateFile);
            if (remoteState && remoteState.isSuspended) {
                return {
                    isActivated: false,
                    isSuspended: true,
                    hwid,
                    plan: remoteState.plan || null,
                    expiry: remoteState.expiry || null,
                    daysLeft: 0,
                    broadcast: remoteState.broadcast || null,
                    message: remoteState.suspendReason || 'تم تعليق هذا الترخيص من قبل الإدارة، يرجى التواصل للتجديد 🔒'
                };
            }
        } catch (_) {}
    }

    if (!fs.existsSync(licenseFile)) {
        return {
            isActivated: false,
            hwid,
            plan: null,
            expiry: null,
            daysLeft: null,
            message: 'البرنامج غير مفعل، يرجى إدخال كود التفعيل'
        };
    }

    try {
        const licenseData = fs.readJsonSync(licenseFile);
        const verification = verifyKey(licenseData.key, hwid);

        let broadcast = null;
        if (fs.existsSync(remoteStateFile)) {
            try { broadcast = fs.readJsonSync(remoteStateFile).broadcast || null; } catch (_) {}
        }

        if (verification.valid) {
            return {
                isActivated: true,
                hwid,
                plan: verification.plan,
                expiry: verification.expiry,
                daysLeft: verification.daysLeft,
                activatedAt: licenseData.activatedAt,
                broadcast,
                message: 'البرنامج مفعل بنجاح'
            };
        } else {
            return {
                isActivated: false,
                hwid,
                plan: verification.plan || null,
                expiry: verification.expiry || null,
                isExpired: verification.isExpired || false,
                broadcast,
                message: verification.error
            };
        }
    } catch (e) {
        return {
            isActivated: false,
            hwid,
            message: 'خطأ في قراءة ملف الترخيص'
        };
    }
}

/**
 * تفعيل البرنامج باستخدام كود
 */
function activate(key, dataDir) {
    const hwid = getHWID();
    const verification = verifyKey(key, hwid);

    if (!verification.valid) {
        return { success: false, error: verification.error };
    }

    fs.ensureDirSync(dataDir);
    const licenseFile = getLicenseFilePath(dataDir);
    const remoteStateFile = getRemoteStateFilePath(dataDir);

    const licenseData = {
        key: key.trim(),
        hwid,
        plan: verification.plan,
        expiry: verification.expiry,
        activatedAt: new Date().toISOString()
    };

    fs.writeJsonSync(licenseFile, licenseData, { spaces: 2 });

    // مسح أي تعليق قديم عند التفعيل الناجح
    if (fs.existsSync(remoteStateFile)) {
        try {
            const remoteState = fs.readJsonSync(remoteStateFile);
            remoteState.isSuspended = false;
            remoteState.suspendReason = '';
            fs.writeJsonSync(remoteStateFile, remoteState, { spaces: 2 });
        } catch (_) {}
    }

    return {
        success: true,
        message: 'تم تفعيل البرنامج بنجاح!',
        plan: verification.plan,
        expiry: verification.expiry,
        daysLeft: verification.daysLeft
    };
}

/**
 * فحص وتزامن الترخيص مع سيرفر الأدمن المركزي عن بُعد (Cloud Heartbeat)
 */
async function syncWithCloudServer(dataDir, userProfile = {}, clientVersion = '3.0.0', serverUrl = null) {
    const axios = require('axios');
    const hwid = getHWID();
    const licenseFile = getLicenseFilePath(dataDir);
    const remoteStateFile = getRemoteStateFilePath(dataDir);

    let currentKey = '';
    if (fs.existsSync(licenseFile)) {
        try { currentKey = fs.readJsonSync(licenseFile).key || ''; } catch (_) {}
    }

    const targetUrl = serverUrl || process.env.LICENSE_SERVER_URL || 'http://localhost:5000';

    try {
        const response = await axios.post(`${targetUrl}/api/v1/license/sync`, {
            hwid,
            name: userProfile.name || '',
            company: userProfile.company || '',
            phone: userProfile.phone || '',
            email: userProfile.email || '',
            clientVersion,
            licenseKey: currentKey
        }, { timeout: 7000 });

        const data = response.data;
        if (!data || !data.success) return { synced: false };

        const remoteState = {
            isSuspended: data.isAllowed === false && data.status === 'suspended',
            suspendReason: data.message || '',
            plan: data.plan,
            expiry: data.expiry,
            broadcast: data.broadcast || null,
            lastSyncedAt: new Date().toISOString()
        };

        fs.writeJsonSync(remoteStateFile, remoteState, { spaces: 2 });

        // إذا قام الأدمن بتجديد أو ترقية ترخيص العميل عن بُعد من اللوحة، نقوم بتحديث الكود تلقائياً
        if (data.isAllowed && data.licenseKey && data.licenseKey !== currentKey) {
            const ver = verifyKey(data.licenseKey, hwid);
            if (ver.valid) {
                activate(data.licenseKey, dataDir);
            }
        }

        return { synced: true, remoteState };
    } catch (err) {
        // في حال عدم توفر اتصال بالسيرفر المركزي، يعمل البرنامج أوفلاين كالمعتاد
        return { synced: false, offlineFallback: true };
    }
}

module.exports = {
    getHWID,
    generateKey,
    verifyKey,
    getLicenseStatus,
    activate,
    syncWithCloudServer
};
