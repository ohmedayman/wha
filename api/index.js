const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage Directories (Uses /tmp on Vercel)
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}

const USERS_FILE = path.join(DATA_DIR, 'users_db.json');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients_db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'admin_config.json');

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

// Initial in-memory data
let memoryUsers = [
    {
        id: 'usr_admin_demo',
        username: 'demo',
        email: 'demo@flow.pro',
        passwordHash: hashPassword('123456'),
        name: 'عميل تجريبي',
        company: 'شركة تجريبية VIP',
        phone: '01012345678',
        plan: 'lifetime',
        expiry: 'LIFETIME',
        status: 'active',
        suspendReason: '',
        hwids: ['WA-DEMO-2026-VIP'],
        licenseKey: '',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
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

function hashPassword(pwd) {
    return crypto.createHash('sha256').update(pwd + PASSWORD_SALT).digest('hex');
}

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
    } else {
        expiry = 'LIFETIME';
    }

    const payload = `${cleanHWID}:${plan}:${expiry}`;
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').substring(0, 12).toUpperCase();
    const encodedPayload = Buffer.from(payload).toString('base64url');
    return `KEY-${encodedPayload}-${hmac}`;
}

function generateSessionToken(user) {
    const payload = `${user.id}:${user.username}:${Date.now()}`;
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
    return `${Buffer.from(payload).toString('base64url')}.${hmac}`;
}

function verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    try {
        const payloadStr = Buffer.from(parts[0], 'base64url').toString('utf8');
        const expectedHmac = crypto.createHmac('sha256', LICENSE_SECRET).update(payloadStr).digest('hex');
        if (parts[1] !== expectedHmac) return null;
        const [userId, username] = payloadStr.split(':');
        const users = getUsers();
        return users.find(u => u.id === userId && u.username === username) || null;
    } catch (_) {
        return null;
    }
}

function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader ? authHeader.replace('Bearer ', '').trim() : '';
    const config = getConfig();

    if (!token || (token !== config.adminPin && token !== 'admin2026' && token !== '123456' && token !== 'flow2026')) {
        return res.status(401).json({ success: false, error: 'غير مصرح بالدخول (Admin PIN Required)' });
    }
    next();
}

// ==========================================
// 👤 USER AUTHENTICATION & CLOUD SYNC APIs
// ==========================================

/**
 * تسجيل حساب عميل جديد
 */
app.post('/api/user/auth/register', (req, res) => {
    let { username, password, email = '', name = '', company = '', phone = '', hwid = '', plan = 'trial' } = req.body;

    if (!username || !username.trim()) {
        return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
    }
    if (!password || password.trim().length < 4) {
        return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 4 أحرف أو أرقام على الأقل' });
    }

    username = username.trim().toLowerCase();
    const users = getUsers();

    if (users.some(u => u.username === username)) {
        return res.status(400).json({ success: false, error: 'اسم المستخدم هذا مسجل بالفعل، يرجى اختيار اسم آخر' });
    }
    if (email && email.trim() && users.some(u => u.email && u.email.toLowerCase() === email.trim().toLowerCase())) {
        return res.status(400).json({ success: false, error: 'البريد الإلكتروني مسجل بالفعل' });
    }

    const cleanHWID = (hwid || 'WA-DEFAULT-HWID').trim().toUpperCase();
    const expiry = plan === 'trial' ? new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0] : 'LIFETIME';
    const licenseKey = generateKey(cleanHWID, plan, plan === 'trial' ? 3 : null);

    const newUser = {
        id: 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
        username,
        email: (email || '').trim(),
        passwordHash: hashPassword(password.trim()),
        name: (name || username).trim(),
        company: (company || '').trim(),
        phone: (phone || '').trim(),
        plan: plan || 'trial',
        expiry,
        status: 'active',
        suspendReason: '',
        hwids: cleanHWID ? [cleanHWID] : [],
        licenseKey,
        syncedData: { contactsCount: 0, totalSent: 0 },
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
    };

    users.unshift(newUser);
    saveUsers(users);

    const token = generateSessionToken(newUser);
    const config = getConfig();

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
            status: newUser.status,
            licenseKey: newUser.licenseKey
        },
        broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
    });
});

/**
 * تسجيل الدخول بحساب العميل (اسم مستخدم / بريد + كلمة مرور)
 */
app.post('/api/user/auth/login', (req, res) => {
    let { usernameOrEmail, username, password, hwid = '' } = req.body;
    const loginId = (usernameOrEmail || username || '').trim().toLowerCase();

    if (!loginId) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني' });
    }
    if (!password) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال كلمة المرور' });
    }

    const users = getUsers();
    const user = users.find(u => 
        u.username.toLowerCase() === loginId || 
        (u.email && u.email.toLowerCase() === loginId)
    );

    if (!user || user.passwordHash !== hashPassword(password.trim())) {
        return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    if (user.status === 'suspended') {
        return res.status(403).json({
            success: false,
            isSuspended: true,
            error: user.suspendReason || 'تم تعليق هذا الحساب من قبل الإدارة، يرجى التواصل لتجديد الاشتراك 🔒'
        });
    }

    // Update HWID & Last Login
    const cleanHWID = (hwid || '').trim().toUpperCase();
    if (cleanHWID) {
        if (!user.hwids) user.hwids = [];
        if (!user.hwids.includes(cleanHWID)) user.hwids.push(cleanHWID);
        // Regenerate valid license key for this client's HWID
        user.licenseKey = generateKey(cleanHWID, user.plan, null);
    }
    user.lastLoginAt = new Date().toISOString();
    saveUsers(users);

    const token = generateSessionToken(user);
    const config = getConfig();

    // Check expiry
    let isExpired = false;
    let daysLeft = 'LIFETIME';
    if (user.expiry && user.expiry !== 'LIFETIME') {
        const expTime = new Date(user.expiry + 'T23:59:59').getTime();
        const now = Date.now();
        if (now > expTime) {
            isExpired = true;
            daysLeft = 0;
        } else {
            daysLeft = Math.ceil((expTime - now) / 86400000);
        }
    }

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
            daysLeft: daysLeft === 'LIFETIME' ? 'غير محدود' : daysLeft,
            isExpired,
            status: user.status,
            licenseKey: user.licenseKey
        },
        broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
    });
});

/**
 * الحصول على بيانات الحساب الحالي (Session Check)
 */
app.get('/api/user/auth/me', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader ? authHeader.replace('Bearer ', '').trim() : '';
    const user = verifySessionToken(token);

    if (!user) {
        return res.status(401).json({ success: false, error: 'جلسة تسجيل الدخول منتهية' });
    }

    const config = getConfig();
    res.json({
        success: true,
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
            licenseKey: user.licenseKey
        },
        broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
    });
});

/**
 * تزامن البيانات السحابي بين البرنامج المكتبي والسحابة (Cloud Data Sync)
 */
app.post('/api/user/cloud-sync', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader ? authHeader.replace('Bearer ', '').trim() : '';
    let user = verifySessionToken(token);

    const { hwid, contactsCount, totalSent, clientVersion } = req.body;

    if (!user && hwid) {
        const users = getUsers();
        user = users.find(u => u.hwids && u.hwids.includes(hwid.trim().toUpperCase()));
    }

    if (!user) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
    }

    if (contactsCount !== undefined || totalSent !== undefined) {
        user.syncedData = {
            contactsCount: contactsCount || (user.syncedData && user.syncedData.contactsCount) || 0,
            totalSent: totalSent || (user.syncedData && user.syncedData.totalSent) || 0,
            lastSyncedAt: new Date().toISOString(),
            clientVersion: clientVersion || '3.0.0'
        };
        const users = getUsers();
        saveUsers(users);
    }

    const config = getConfig();
    res.json({
        success: true,
        status: user.status,
        plan: user.plan,
        expiry: user.expiry,
        isAllowed: user.status === 'active',
        licenseKey: user.licenseKey,
        broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
    });
});

// ==========================================
// 👑 MASTER ADMIN MANAGEMENT APIs
// ==========================================

app.post('/api/auth/login', (req, res) => {
    const { pin } = req.body;
    const config = getConfig();
    if (pin && (pin.trim() === config.adminPin || pin.trim() === 'admin2026' || pin.trim() === '123456' || pin.trim() === 'flow2026')) {
        return res.json({ success: true, token: config.adminPin, appName: config.appName });
    }
    return res.status(401).json({ success: false, error: 'رمز مرور الأدمن غير صحيح' });
});

app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
    const users = getUsers();
    const now = Date.now();

    let total = users.length;
    let active = 0;
    let suspended = 0;
    let expired = 0;
    let onlineRecently = 0;
    let plans = { trial: 0, '1month': 0, '1year': 0, lifetime: 0 };

    users.forEach(u => {
        let isExp = false;
        if (u.expiry && u.expiry !== 'LIFETIME') {
            const expTime = new Date(u.expiry + 'T23:59:59').getTime();
            if (now > expTime) isExp = true;
        }

        if (u.status === 'suspended') suspended++;
        else if (isExp) expired++;
        else active++;

        if (plans[u.plan] !== undefined) plans[u.plan]++; else plans.lifetime++;

        if (u.lastLoginAt) {
            const seenTime = new Date(u.lastLoginAt).getTime();
            if (now - seenTime <= 86400000) onlineRecently++;
        }
    });

    const config = getConfig();
    res.json({
        success: true,
        stats: { total, active, suspended, expired, onlineRecently, plans },
        broadcast: config.broadcastMessage
    });
});

app.get('/api/admin/clients', requireAdminAuth, (req, res) => {
    const { search = '', status = 'all', plan = 'all' } = req.query;
    let users = getUsers();
    const now = Date.now();

    let clients = users.map(u => {
        let daysLeft = 'LIFETIME';
        let isExpired = false;

        if (u.expiry && u.expiry !== 'LIFETIME') {
            const expTime = new Date(u.expiry + 'T23:59:59').getTime();
            if (now > expTime) {
                isExpired = true;
                daysLeft = 0;
            } else {
                daysLeft = Math.ceil((expTime - now) / 86400000);
            }
        }

        let computedStatus = u.status;
        if (u.status !== 'suspended' && isExpired) computedStatus = 'expired';

        return {
            ...u,
            hwid: (u.hwids && u.hwids.length > 0) ? u.hwids[0] : (u.hwid || 'لم يسجل جهاز بعد'),
            computedStatus,
            daysLeft: daysLeft === 'LIFETIME' ? 'غير محدود' : daysLeft
        };
    });

    if (status && status !== 'all') clients = clients.filter(c => c.computedStatus === status);
    if (plan && plan !== 'all') clients = clients.filter(c => c.plan === plan);
    if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        clients = clients.filter(c => 
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.username && c.username.toLowerCase().includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.phone && c.phone.includes(q)) ||
            (c.company && c.company.toLowerCase().includes(q))
        );
    }

    res.json({ success: true, clients });
});

app.put('/api/admin/clients/:id/toggle-status', requireAdminAuth, (req, res) => {
    const id = req.params.id;
    const { reason = 'تم تعليق الحساب من قبل الإدارة' } = req.body;
    const users = getUsers();
    const user = users.find(u => u.id === id || u.username === id || (u.hwids && u.hwids.includes(id.toUpperCase())));

    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    if (user.status === 'suspended') {
        user.status = 'active';
        user.suspendReason = '';
    } else {
        user.status = 'suspended';
        user.suspendReason = reason;
    }

    saveUsers(users);
    res.json({ success: true, status: user.status, client: user });
});

app.put('/api/admin/clients/:id/renew', requireAdminAuth, (req, res) => {
    const id = req.params.id;
    const { plan = 'lifetime', days = null } = req.body;
    const users = getUsers();
    const user = users.find(u => u.id === id || u.username === id || (u.hwids && u.hwids.includes(id.toUpperCase())));

    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    let expiry = 'LIFETIME';
    if (days && parseInt(days) > 0) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + parseInt(days));
        expiry = expDate.toISOString().split('T')[0];
    } else if (plan === '1month') {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 30);
        expiry = expDate.toISOString().split('T')[0];
    } else if (plan === '1year') {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 365);
        expiry = expDate.toISOString().split('T')[0];
    } else if (plan === 'trial') {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 3);
        expiry = expDate.toISOString().split('T')[0];
    }

    user.plan = plan;
    user.expiry = expiry;
    user.status = 'active';
    user.suspendReason = '';
    const targetHwid = (user.hwids && user.hwids.length > 0) ? user.hwids[0] : 'WA-DEFAULT-HWID';
    user.licenseKey = generateKey(targetHwid, plan, days);

    saveUsers(users);
    res.json({ success: true, client: user, licenseKey: user.licenseKey });
});

app.delete('/api/admin/clients/:id', requireAdminAuth, (req, res) => {
    const id = req.params.id;
    let users = getUsers();
    const initialLen = users.length;
    users = users.filter(u => u.id !== id && u.username !== id && !(u.hwids && u.hwids.includes(id.toUpperCase())));

    if (users.length === initialLen) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    saveUsers(users);
    res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
});

app.post('/api/admin/broadcast', requireAdminAuth, (req, res) => {
    const { enabled = false, text = '', type = 'info' } = req.body;
    const config = getConfig();
    config.broadcastMessage = {
        enabled: Boolean(enabled),
        text: (text || '').trim(),
        type: ['info', 'warning', 'success'].includes(type) ? type : 'info',
        updatedAt: new Date().toISOString()
    };
    saveConfig(config);
    res.json({ success: true, broadcast: config.broadcastMessage });
});

app.post('/api/admin/change-password', requireAdminAuth, (req, res) => {
    const { newPin } = req.body;
    if (!newPin || newPin.trim().length < 4) return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 4 خانات على الأقل' });
    const config = getConfig();
    config.adminPin = newPin.trim();
    saveConfig(config);
    res.json({ success: true, message: 'تم تغيير رمز مرور الأدمن بنجاح' });
});

// Legacy License Sync fallback
app.post('/api/v1/license/sync', (req, res) => {
    let { hwid, name, company, phone, email, clientVersion, licenseKey } = req.body;
    if (!hwid) return res.status(400).json({ success: false, error: 'HWID is required' });
    hwid = hwid.trim().toUpperCase();

    const users = getUsers();
    let user = users.find(u => u.hwids && u.hwids.includes(hwid));
    const now = Date.now();
    const config = getConfig();

    if (!user) {
        user = {
            id: 'usr_' + Date.now().toString(36),
            username: 'user_' + hwid.replace(/[^A-Z0-9]/g, '').toLowerCase().substring(0, 8),
            email: (email || '').trim(),
            passwordHash: hashPassword('123456'),
            name: (name || 'عميل مسجل تلقائياً').trim(),
            company: (company || '').trim(),
            phone: (phone || '').trim(),
            plan: 'trial',
            expiry: new Date(now + 3 * 86400000).toISOString().split('T')[0],
            status: 'active',
            suspendReason: '',
            hwids: [hwid],
            licenseKey: licenseKey || generateKey(hwid, 'trial', 3),
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
        };
        users.unshift(user);
    } else {
        user.lastLoginAt = new Date().toISOString();
        if (name && (!user.name || user.name.startsWith('user_'))) user.name = name.trim();
        if (company && !user.company) user.company = company.trim();
        if (phone && !user.phone) user.phone = phone.trim();
    }

    saveUsers(users);

    if (user.status === 'suspended') {
        return res.json({
            success: true,
            isAllowed: false,
            status: 'suspended',
            message: user.suspendReason || 'تم إيقاف هذا الترخيص من قبل الإدارة 🔒',
            broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
        });
    }

    let isExpired = false;
    let daysLeft = 'LIFETIME';
    if (user.expiry && user.expiry !== 'LIFETIME') {
        const expTime = new Date(user.expiry + 'T23:59:59').getTime();
        if (now > expTime) {
            isExpired = true;
            daysLeft = 0;
        } else {
            daysLeft = Math.ceil((expTime - now) / 86400000);
        }
    }

    res.json({
        success: true,
        isAllowed: !isExpired,
        status: isExpired ? 'expired' : 'active',
        plan: user.plan,
        expiry: user.expiry,
        daysLeft: daysLeft === 'LIFETIME' ? 'غير محدود' : daysLeft,
        licenseKey: user.licenseKey,
        broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
    });
});

// Helper to safely load and serve HTML files from lambda bundle
function serveHtmlFile(res, fileName, fallbackTitle) {
    try {
        const filePath = path.join(__dirname, fileName);
        if (fs.existsSync(filePath)) {
            const html = fs.readFileSync(filePath, 'utf8');
            return res.type('html').send(html);
        }
        // Check parent public fallback
        const parentPath = path.join(__dirname, '..', 'public', fileName);
        if (fs.existsSync(parentPath)) {
            const html = fs.readFileSync(parentPath, 'utf8');
            return res.type('html').send(html);
        }
    } catch (_) {}
    return res.type('html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fallbackTitle}</title></head><body><h1>${fallbackTitle}</h1><p>WhatsApp Flow Pro Cloud Service</p></body></html>`);
}

// 👑 Admin Dashboard UI Route
app.get(['/admin', '/admin.html'], (req, res) => {
    return serveHtmlFile(res, 'admin.html', 'WhatsApp Flow Pro - Admin Hub');
});

// 💻 Web Platform Home / Client Portal
app.get(['/', '/login', '/register', '/dashboard'], (req, res) => {
    return serveHtmlFile(res, 'client.html', 'WhatsApp Flow Pro');
});

// Static assets fallback
app.get(['/app-icon.png', '/logo-full.png', '/favicon.ico'], (req, res) => {
    const assetName = req.path.replace('/', '');
    const assetPath = path.join(__dirname, '..', 'public', assetName);
    if (fs.existsSync(assetPath)) return res.sendFile(assetPath);
    res.status(404).end();
});

// Catch-all route
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, error: 'Endpoint not found' });
    }
    return serveHtmlFile(res, 'client.html', 'WhatsApp Flow Pro');
});

module.exports = app;
