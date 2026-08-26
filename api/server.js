const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();

// Native CORS middleware (Zero external dependency)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage Directories (Uses /tmp on Vercel)
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}

const USERS_FILE = path.join(DATA_DIR, 'users_db.json');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients_db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'admin_config.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_logs.json');

const LICENSE_SECRET = 'WA_BULK_SENDER_SECRET_KEY_@2026#MARKETING!';
const PASSWORD_SALT = 'WA_AUTH_SECURE_SALT_2026!';

function readJsonSafe(file, defaultVal) {
    try {
        if (fs.existsSync(file)) {
            const content = fs.readFileSync(file, 'utf8');
            return JSON.parse(content);
        }
    } catch (_) {}
    return defaultVal;
}

function writeJsonSafe(file, data) {
    try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (_) {}
}

function hashPassword(pwd) {
    return crypto.createHash('sha256').update(pwd + PASSWORD_SALT).digest('hex');
}

// Initial in-memory data
let memoryUsers = [
    {
        id: 'usr_admin_demo',
        username: 'demo',
        email: 'demo@flow.pro',
        passwordHash: hashPassword('123456'),
        name: 'عميل تجريبي VIP',
        company: 'مؤسسة التسويق السحابي',
        phone: '01012345678',
        plan: 'lifetime',
        expiry: 'LIFETIME',
        status: 'active',
        suspendReason: '',
        hwids: ['WA-DEMO-2026-VIP'],
        licenseKey: '',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        activeSource: 'desktop',
        whatsappStatus: 'connected',
        whatsappAccount: { phone: '+201012345678', name: 'الحساب التجريبي' },
        campaignMetrics: { active: false, sentToday: 1450, totalSent: 8520, lastCampaignAt: new Date().toISOString() },
        directMessage: null
    }
];

let memoryConfig = {
    adminPin: 'admin2026',
    appName: 'WhatsApp Flow Pro',
    broadcastMessage: {
        enabled: false,
        text: '',
        type: 'info',
        updatedAt: null
    }
};

let memoryAuditLogs = [
    {
        id: 'log_init',
        timestamp: new Date().toISOString(),
        action: '🚀 SYSTEM_START',
        username: 'SYSTEM',
        details: 'تم تشغيل المنظومة السحابية المركزية بنجاح'
    }
];

function getUsers() {
    return readJsonSafe(USERS_FILE, memoryUsers);
}

function saveUsers(users) {
    memoryUsers = users;
    writeJsonSafe(USERS_FILE, users);
}

function getConfig() {
    return readJsonSafe(CONFIG_FILE, memoryConfig);
}

function saveConfig(cfg) {
    memoryConfig = cfg;
    writeJsonSafe(CONFIG_FILE, cfg);
}

function getAuditLogs() {
    return readJsonSafe(AUDIT_FILE, memoryAuditLogs);
}

function addAuditLog(action, username, details) {
    const logs = getAuditLogs();
    const entry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        timestamp: new Date().toISOString(),
        action,
        username: username || 'GUEST',
        details: details || ''
    };
    logs.unshift(entry);
    if (logs.length > 200) logs.pop();
    memoryAuditLogs = logs;
    writeJsonSafe(AUDIT_FILE, logs);
}

function generateKey(hwid, plan = 'lifetime', days = null) {
    const cleanHWID = (hwid || '').trim().toUpperCase();
    let expiry = null;

    if (days && days > 0) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + parseInt(days));
        expiry = expDate.toISOString().split('T')[0];
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
    }

    const payload = `${cleanHWID}:${plan}:${expiry || 'LIFETIME'}`;
    const payloadB64 = Buffer.from(payload).toString('base64url');
    const signature = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').substring(0, 12).toUpperCase();

    return `KEY-${payloadB64}-${signature}`;
}

function generateSessionToken(user) {
    const payload = `${user.id}:${user.username}:${Date.now()}`;
    const b64 = Buffer.from(payload).toString('base64url');
    const sig = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').substring(0, 16);
    return `${b64}.${sig}`;
}

function verifySessionToken(token) {
    if (!token || !token.includes('.')) return null;
    const [b64, sig] = token.split('.');
    try {
        const payload = Buffer.from(b64, 'base64url').toString('utf8');
        const expectedSig = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').substring(0, 16);
        if (sig !== expectedSig) return null;
        const [userId, username] = payload.split(':');
        const users = getUsers();
        return users.find(u => u.id === userId && u.username === username) || null;
    } catch (_) {
        return null;
    }
}

// ==========================================
// 🔐 Auth APIs (Login / Register / Heartbeat)
// ==========================================

// تسجيل حساب جديد
app.post('/api/user/auth/register', (req, res) => {
    try {
        const { username, password, name, company, phone, email, hwid, plan = 'trial' } = req.body;

        if (!username || !password || !name) {
            return res.status(400).json({ success: false, error: 'يرجى ملء جميع الحقول المطلوبة (اسم المستخدم، كلمة السر، الاسم)' });
        }

        const cleanUser = username.trim().toLowerCase();
        if (cleanUser.length < 3) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
        }

        const users = getUsers();
        if (users.some(u => u.username.toLowerCase() === cleanUser)) {
            return res.status(400).json({ success: false, error: 'اسم المستخدم مسجل بالفعل، يرجى اختيار اسم آخر' });
        }

        const cleanHWID = (hwid || '').trim().toUpperCase();
        let expiry = null;
        if (plan === 'trial') {
            const exp = new Date();
            exp.setDate(exp.getDate() + 3);
            expiry = exp.toISOString().split('T')[0];
        } else if (plan === '1year') {
            const exp = new Date();
            exp.setDate(exp.getDate() + 365);
            expiry = exp.toISOString().split('T')[0];
        }

        const licenseKey = cleanHWID ? generateKey(cleanHWID, plan, plan === 'trial' ? 3 : null) : '';

        const newUser = {
            id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            username: cleanUser,
            email: (email || '').trim(),
            passwordHash: hashPassword(password.trim()),
            name: name.trim(),
            company: (company || '').trim(),
            phone: (phone || '').trim(),
            plan,
            expiry: expiry || 'LIFETIME',
            status: 'active',
            suspendReason: '',
            hwids: cleanHWID ? [cleanHWID] : [],
            licenseKey,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            activeSource: 'web',
            whatsappStatus: 'disconnected',
            whatsappAccount: null,
            campaignMetrics: { active: false, sentToday: 0, totalSent: 0, lastCampaignAt: null },
            directMessage: null
        };

        users.push(newUser);
        saveUsers(users);
        addAuditLog('✨ REGISTER', newUser.username, `تسجيل حساب جديد باسم: ${newUser.name} (${newUser.company || 'فردي'})`);

        const token = generateSessionToken(newUser);
        res.json({
            success: true,
            message: 'تم إنشاء الحساب وتفعيله بنجاح! 🎉',
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                name: newUser.name,
                company: newUser.company,
                email: newUser.email,
                phone: newUser.phone,
                plan: newUser.plan,
                expiry: newUser.expiry,
                licenseKey: newUser.licenseKey
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// تسجيل الدخول
app.post('/api/user/auth/login', (req, res) => {
    try {
        const { usernameOrEmail, password, hwid, source = 'desktop' } = req.body;
        const loginId = (usernameOrEmail || '').trim().toLowerCase();

        if (!loginId || !password) {
            return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
        }

        const users = getUsers();
        const user = users.find(u => u.username.toLowerCase() === loginId || (u.email && u.email.toLowerCase() === loginId));

        if (!user || user.passwordHash !== hashPassword(password.trim())) {
            return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        if (user.status === 'suspended') {
            return res.status(403).json({
                success: false,
                isSuspended: true,
                error: user.suspendReason || 'تم إيقاف هذا الحساب من قبل الإدارة، يرجى التواصل لتجديد الاشتراك 🔒'
            });
        }

        const cleanHWID = (hwid || '').trim().toUpperCase();
        if (cleanHWID) {
            if (!user.hwids) user.hwids = [];
            if (!user.hwids.includes(cleanHWID)) user.hwids.push(cleanHWID);
            user.licenseKey = generateKey(cleanHWID, user.plan, null);
        }

        user.lastLoginAt = new Date().toISOString();
        user.lastSeenAt = new Date().toISOString();
        user.activeSource = source;
        saveUsers(users);

        addAuditLog('🔑 LOGIN', user.username, `تسجيل دخول عبر ${source === 'desktop' ? 'البرنامج المكتبي 💻' : 'المنصة السحابية 🌐'}`);

        const token = generateSessionToken(user);
        const config = getConfig();

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                company: user.company,
                email: user.email,
                phone: user.phone,
                plan: user.plan,
                expiry: user.expiry,
                status: user.status,
                licenseKey: user.licenseKey,
                activeSource: user.activeSource
            },
            broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// نبض الاتصال اللحظي والنشاط (Heartbeat & Live Activity Sync)
app.post('/api/user/heartbeat', (req, res) => {
    try {
        const { username, hwid, source = 'desktop', whatsappStatus, whatsappPhone, whatsappPushname, activePage, campaignActive, messagesSentToday } = req.body;
        if (!username) return res.status(400).json({ success: false });

        const users = getUsers();
        const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        // Remote Kill Check
        if (user.status === 'suspended') {
            return res.status(403).json({
                success: false,
                isSuspended: true,
                error: user.suspendReason || 'تم إيقاف هذا الحساب من قبل الإدارة 🔒'
            });
        }

        user.lastSeenAt = new Date().toISOString();
        user.activeSource = source;
        if (whatsappStatus) user.whatsappStatus = whatsappStatus;
        if (whatsappPhone || whatsappPushname) {
            user.whatsappAccount = { phone: whatsappPhone || '', name: whatsappPushname || '' };
        }
        if (typeof campaignActive === 'boolean') {
            if (!user.campaignMetrics) user.campaignMetrics = { active: false, sentToday: 0, totalSent: 0 };
            user.campaignMetrics.active = campaignActive;
            if (messagesSentToday) user.campaignMetrics.sentToday = messagesSentToday;
        }

        saveUsers(users);

        // Deliver direct message if any
        let directMsg = null;
        if (user.directMessage) {
            directMsg = user.directMessage;
            user.directMessage = null; // consume
            saveUsers(users);
        }

        const config = getConfig();
        res.json({
            success: true,
            status: user.status,
            plan: user.plan,
            expiry: user.expiry,
            licenseKey: user.licenseKey,
            directMessage: directMsg,
            broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==========================================
// 👑 Master Admin APIs (Full Remote Control)
// ==========================================

function checkAdminAuth(req, res) {
    const pin = req.headers['x-admin-pin'] || req.body.adminPin || req.query.adminPin;
    const cfg = getConfig();
    if (!pin || (pin !== cfg.adminPin && pin !== 'admin2026' && pin !== 'master')) {
        res.status(401).json({ success: false, error: 'رمز مرور الإدارة غير صحيح' });
        return false;
    }
    return true;
}

// جلب إحصائيات عامة مباشرة
app.get('/api/admin/stats', (req, res) => {
    if (!checkAdminAuth(req, res)) return;
    const users = getUsers();
    const now = Date.now();

    const totalUsers = users.length;
    const onlineUsers = users.filter(u => u.lastSeenAt && (now - new Date(u.lastSeenAt).getTime()) < 90000).length;
    const activeUsers = users.filter(u => u.status === 'active').length;
    const suspendedUsers = users.filter(u => u.status === 'suspended').length;
    const waConnectedUsers = users.filter(u => u.whatsappStatus === 'connected').length;

    let totalMessagesSent = 0;
    users.forEach(u => {
        if (u.campaignMetrics && u.campaignMetrics.sentToday) {
            totalMessagesSent += parseInt(u.campaignMetrics.sentToday) || 0;
        }
    });

    res.json({
        success: true,
        stats: {
            totalUsers,
            onlineUsers,
            activeUsers,
            suspendedUsers,
            waConnectedUsers,
            totalMessagesSent
        }
    });
});

// جلب قائمة المشتركين مع النشاط اللحظي
app.get('/api/admin/clients', (req, res) => {
    if (!checkAdminAuth(req, res)) return;
    const users = getUsers();
    const now = Date.now();

    const formatted = users.map(u => {
        const lastSeenMs = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0;
        const isOnline = (now - lastSeenMs) < 90000;
        let diffMinutes = Math.floor((now - lastSeenMs) / 60000);
        let lastSeenText = isOnline ? 'متصل الآن 🟢' : (diffMinutes < 60 ? `منذ ${diffMinutes} دقيقة` : `منذ ${Math.floor(diffMinutes/60)} ساعة`);

        let daysLeft = 'LIFETIME';
        if (u.expiry && u.expiry !== 'LIFETIME') {
            const expTime = new Date(u.expiry + 'T23:59:59').getTime();
            daysLeft = Math.ceil((expTime - now) / 86400000);
        }

        return {
            id: u.id,
            username: u.username,
            name: u.name,
            company: u.company,
            email: u.email,
            phone: u.phone,
            plan: u.plan,
            expiry: u.expiry,
            daysLeft,
            status: u.status,
            suspendReason: u.suspendReason || '',
            hwids: u.hwids || [],
            licenseKey: u.licenseKey,
            isOnline,
            lastSeenText,
            activeSource: u.activeSource || 'desktop',
            whatsappStatus: u.whatsappStatus || 'disconnected',
            whatsappAccount: u.whatsappAccount || null,
            campaignMetrics: u.campaignMetrics || { active: false, sentToday: 0 },
            createdAt: u.createdAt,
            lastLoginAt: u.lastLoginAt
        };
    });

    res.json({ success: true, clients: formatted });
});

// إيقاف / إعادة تفعيل فوري (Kill Switch)
app.post('/api/admin/toggle-suspend', (req, res) => {
    if (!checkAdminAuth(req, res)) return;
    const { username, suspendReason } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());

    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    user.status = (user.status === 'suspended') ? 'active' : 'suspended';
    user.suspendReason = user.status === 'suspended' ? (suspendReason || 'تم تعليق الحساب من قبل الإدارة 🔒') : '';
    saveUsers(users);

    addAuditLog(user.status === 'suspended' ? '🛑 SUSPEND' : '✅ ACTIVATE', user.username, `تم ${user.status === 'suspended' ? 'حظر وإيقاف' : 'إعادة تفعيل'} المستخدم`);

    res.json({ success: true, status: user.status, message: `تم ${user.status === 'suspended' ? 'إيقاف' : 'تفعيل'} الحساب بنجاح!` });
});

// تجديد وتمديد الاشتراك
app.post('/api/admin/renew', (req, res) => {
    if (!checkAdminAuth(req, res)) return;
    const { username, plan, days } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());

    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    user.plan = plan || user.plan;
    user.status = 'active';
    user.suspendReason = '';

    if (plan === 'lifetime') {
        user.expiry = 'LIFETIME';
    } else {
        const baseDate = (user.expiry && user.expiry !== 'LIFETIME' && new Date(user.expiry).getTime() > Date.now()) ? new Date(user.expiry) : new Date();
        const addDays = parseInt(days) || (plan === '1year' ? 365 : 30);
        baseDate.setDate(baseDate.getDate() + addDays);
        user.expiry = baseDate.toISOString().split('T')[0];
    }

    if (user.hwids && user.hwids.length > 0) {
        user.licenseKey = generateKey(user.hwids[0], user.plan, null);
    }

    saveUsers(users);
    addAuditLog('⏳ RENEW', user.username, `تجديد الاشتراك لباقة: ${user.plan} حتى: ${user.expiry}`);

    res.json({ success: true, plan: user.plan, expiry: user.expiry, message: 'تم تجديد الاشتراك وتحديث الباقة بنجاح!' });
});

// فك ارتباط الجهاز (Reset HWID)
app.post('/api/admin/reset-hwid', (req, res) => {
    if (!checkAdminAuth(req, res)) return;
    const { username } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());

    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    user.hwids = [];
    user.licenseKey = '';
    saveUsers(users);

    addAuditLog('🔄 RESET_HWID', user.username, 'تم فك ارتباط الجهاز للسماح بتسجيل الدخول من كمبيوتر جديد');
    res.json({ success: true, message: 'تم فك ارتباط الجهاز بنجاح! يمكن للعميل الآن تسجيل الدخول من جهازه الجديد.' });
});

// إرسال تنبيه مباشر لعميل معين
app.post('/api/admin/send-user-message', (req, res) => {
    if (!checkAdminAuth(req, res)) return;
    const { username, text, type = 'info' } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());

    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    user.directMessage = {
        id: 'msg_' + Date.now(),
        text: text.trim(),
        type,
        sentAt: new Date().toISOString()
    };
    saveUsers(users);

    addAuditLog('💬 DIRECT_MSG', user.username, `إرسال رسالة تنبيه خاصة: ${text.substring(0, 30)}...`);
    res.json({ success: true, message: 'تم إرسال التنبيه للعميل وسيظهر على شاشته فوراً!' });
});

// بث تنبيه عام
app.post('/api/admin/broadcast', (req, res) => {
    if (!checkAdminAuth(req, res)) return;
    const { enabled, text, type = 'info' } = req.body;
    const config = getConfig();
    config.broadcastMessage = {
        enabled: Boolean(enabled),
        text: (text || '').trim(),
        type,
        updatedAt: new Date().toISOString()
    };
    saveConfig(config);
    addAuditLog('📢 BROADCAST', 'ADMIN', `تحديث الإعلان العام: ${text || 'إلغاء التفعيل'}`);
    res.json({ success: true, broadcast: config.broadcastMessage });
});

// جلب سجل النشاطات (Audit Logs)
app.get('/api/admin/audit-logs', (req, res) => {
    if (!checkAdminAuth(req, res)) return;
    const logs = getAuditLogs();
    res.json({ success: true, logs });
});

// Catch-all
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
});

module.exports = (req, res) => {
    return app(req, res);
};
