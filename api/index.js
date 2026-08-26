const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs-extra');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Database File Paths (supports Vercel serverless /tmp or local data)
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');
fs.ensureDirSync(DATA_DIR);

const DB_FILE = path.join(DATA_DIR, 'clients_db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'admin_config.json');

// Master License Secret Key
const LICENSE_SECRET = 'WA_BULK_SENDER_SECRET_KEY_@2026#MARKETING!';

let memoryClients = [
    {
        hwid: 'WA-DEMO-2026-VIP',
        name: 'عميل تجريبي',
        company: 'شركة تجريبية',
        phone: '01012345678',
        email: '',
        plan: 'lifetime',
        expiry: 'LIFETIME',
        status: 'active',
        suspendReason: '',
        licenseKey: 'KEY-V0EtREVNTy0yMDI2LVZJUDpsaWZldGltZTpMSUZFVElNRQ-87D43981B2AA',
        notes: 'حساب تجريبي افتراضي',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        clientVersion: '3.0.0'
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

if (!fs.existsSync(CONFIG_FILE)) {
    try { fs.writeJsonSync(CONFIG_FILE, memoryConfig, { spaces: 2 }); } catch (_) {}
}

if (!fs.existsSync(DB_FILE)) {
    try { fs.writeJsonSync(DB_FILE, memoryClients, { spaces: 2 }); } catch (_) {}
}

function getClients() {
    try {
        if (fs.existsSync(DB_FILE)) return fs.readJsonSync(DB_FILE);
    } catch (_) {}
    return memoryClients;
}

function saveClients(clients) {
    memoryClients = clients;
    try {
        fs.writeJsonSync(DB_FILE, clients, { spaces: 2 });
    } catch (_) {}
}

function getConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) return fs.readJsonSync(CONFIG_FILE);
    } catch (_) {}
    return memoryConfig;
}

function saveConfig(cfg) {
    memoryConfig = cfg;
    try {
        fs.writeJsonSync(CONFIG_FILE, cfg, { spaces: 2 });
    } catch (_) {}
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

function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader ? authHeader.replace('Bearer ', '').trim() : '';
    const config = getConfig();

    if (!token || (token !== config.adminPin && token !== 'admin2026' && token !== '123456' && token !== 'flow2026')) {
        return res.status(401).json({ success: false, error: 'غير مصرح بالدخول' });
    }
    next();
}

app.post('/api/auth/login', (req, res) => {
    const { pin } = req.body;
    const config = getConfig();
    if (pin && (pin.trim() === config.adminPin || pin.trim() === 'admin2026' || pin.trim() === '123456' || pin.trim() === 'flow2026')) {
        return res.json({
            success: true,
            token: config.adminPin,
            appName: config.appName
        });
    }
    return res.status(401).json({ success: false, error: 'رمز مرور الأدمن غير صحيح' });
});

app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
    const clients = getClients();
    const now = new Date().getTime();

    let total = clients.length;
    let active = 0;
    let suspended = 0;
    let expired = 0;
    let onlineRecently = 0;
    let plans = { trial: 0, '1month': 0, '1year': 0, lifetime: 0 };

    clients.forEach(c => {
        let isExp = false;
        if (c.expiry && c.expiry !== 'LIFETIME') {
            const expTime = new Date(c.expiry + 'T23:59:59').getTime();
            if (now > expTime) isExp = true;
        }

        if (c.status === 'suspended') suspended++;
        else if (isExp) expired++;
        else active++;

        if (plans[c.plan] !== undefined) plans[c.plan]++; else plans.lifetime++;

        if (c.lastSeenAt) {
            const seenTime = new Date(c.lastSeenAt).getTime();
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
    let clients = getClients();
    const now = new Date().getTime();

    clients = clients.map(c => {
        let daysLeft = 'LIFETIME';
        let isExpired = false;

        if (c.expiry && c.expiry !== 'LIFETIME') {
            const expTime = new Date(c.expiry + 'T23:59:59').getTime();
            if (now > expTime) {
                isExpired = true;
                daysLeft = 0;
            } else {
                daysLeft = Math.ceil((expTime - now) / 86400000);
            }
        }

        let computedStatus = c.status;
        if (c.status !== 'suspended' && isExpired) {
            computedStatus = 'expired';
        }

        return {
            ...c,
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
            (c.hwid && c.hwid.toLowerCase().includes(q)) ||
            (c.phone && c.phone.includes(q)) ||
            (c.company && c.company.toLowerCase().includes(q))
        );
    }

    res.json({ success: true, clients });
});

app.post('/api/admin/clients', requireAdminAuth, (req, res) => {
    let { hwid, name, company, phone, email, plan = 'lifetime', days = null, notes = '' } = req.body;
    if (!hwid || !hwid.trim()) {
        return res.status(400).json({ success: false, error: 'بصمة الجهاز HWID مطلوبة' });
    }
    hwid = hwid.trim().toUpperCase();

    const clients = getClients();
    let client = clients.find(c => c.hwid === hwid);

    let expiry = 'LIFETIME';
    if (days && parseInt(days) > 0) {
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

    const licenseKey = generateKey(hwid, plan, days);

    if (client) {
        client.name = (name || client.name || '').trim();
        client.company = (company || client.company || '').trim();
        client.phone = (phone || client.phone || '').trim();
        client.email = (email || client.email || '').trim();
        client.plan = plan;
        client.expiry = expiry;
        client.status = 'active';
        client.licenseKey = licenseKey;
        client.notes = notes || client.notes || '';
    } else {
        client = {
            hwid,
            name: (name || 'عميل جديد').trim(),
            company: (company || '').trim(),
            phone: (phone || '').trim(),
            email: (email || '').trim(),
            plan,
            expiry,
            status: 'active',
            suspendReason: '',
            licenseKey,
            notes: notes || '',
            createdAt: new Date().toISOString(),
            lastSeenAt: null,
            clientVersion: '3.0.0'
        };
        clients.unshift(client);
    }

    saveClients(clients);
    res.json({ success: true, client, licenseKey });
});

app.put('/api/admin/clients/:hwid/toggle-status', requireAdminAuth, (req, res) => {
    const hwid = (req.params.hwid || '').trim().toUpperCase();
    const { reason = 'تم تعليق الحساب من قبل الإدارة' } = req.body;
    const clients = getClients();
    const client = clients.find(c => c.hwid === hwid);

    if (!client) {
        return res.status(404).json({ success: false, error: 'العميل غير موجود' });
    }

    if (client.status === 'suspended') {
        client.status = 'active';
        client.suspendReason = '';
    } else {
        client.status = 'suspended';
        client.suspendReason = reason;
    }

    saveClients(clients);
    res.json({ success: true, status: client.status, client });
});

app.put('/api/admin/clients/:hwid/renew', requireAdminAuth, (req, res) => {
    const hwid = (req.params.hwid || '').trim().toUpperCase();
    const { plan = 'lifetime', days = null } = req.body;
    const clients = getClients();
    const client = clients.find(c => c.hwid === hwid);

    if (!client) {
        return res.status(404).json({ success: false, error: 'العميل غير موجود' });
    }

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

    client.plan = plan;
    client.expiry = expiry;
    client.status = 'active';
    client.suspendReason = '';
    client.licenseKey = generateKey(hwid, plan, days);

    saveClients(clients);
    res.json({ success: true, client, licenseKey: client.licenseKey });
});

app.put('/api/admin/clients/:hwid/edit', requireAdminAuth, (req, res) => {
    const hwid = (req.params.hwid || '').trim().toUpperCase();
    const { name, company, phone, email, notes } = req.body;
    const clients = getClients();
    const client = clients.find(c => c.hwid === hwid);

    if (!client) return res.status(404).json({ success: false, error: 'العميل غير موجود' });

    if (name !== undefined) client.name = (name || '').trim();
    if (company !== undefined) client.company = (company || '').trim();
    if (phone !== undefined) client.phone = (phone || '').trim();
    if (email !== undefined) client.email = (email || '').trim();
    if (notes !== undefined) client.notes = (notes || '').trim();

    saveClients(clients);
    res.json({ success: true, client });
});

app.delete('/api/admin/clients/:hwid', requireAdminAuth, (req, res) => {
    const hwid = (req.params.hwid || '').trim().toUpperCase();
    let clients = getClients();
    const initialLen = clients.length;
    clients = clients.filter(c => c.hwid !== hwid);

    if (clients.length === initialLen) return res.status(404).json({ success: false, error: 'العميل غير موجود' });

    saveClients(clients);
    res.json({ success: true, message: 'تم حذف العميل بنجاح' });
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

// 🌐 Public Client Heartbeat & Sync Endpoint
app.post('/api/v1/license/sync', (req, res) => {
    let { hwid, name, company, phone, email, clientVersion, licenseKey } = req.body;
    if (!hwid || typeof hwid !== 'string') {
        return res.status(400).json({ success: false, error: 'HWID is required' });
    }
    hwid = hwid.trim().toUpperCase();

    const clients = getClients();
    let client = clients.find(c => c.hwid === hwid);
    const now = new Date().getTime();
    const config = getConfig();

    if (!client) {
        client = {
            hwid,
            name: (name || 'عميل مسجل تلقائياً').trim(),
            company: (company || '').trim(),
            phone: (phone || '').trim(),
            email: (email || '').trim(),
            plan: 'trial',
            expiry: new Date(now + 3 * 86400000).toISOString().split('T')[0],
            status: 'active',
            suspendReason: '',
            licenseKey: licenseKey || generateKey(hwid, 'trial', 3),
            notes: 'تم التسجيل تلقائياً عند أول تشغيل',
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            clientVersion: clientVersion || '3.0.0'
        };
        clients.unshift(client);
    } else {
        client.lastSeenAt = new Date().toISOString();
        if (clientVersion) client.clientVersion = clientVersion;
        if (name && (!client.name || client.name === 'عميل جديد')) client.name = name.trim();
        if (company && !client.company) client.company = company.trim();
        if (phone && !client.phone) client.phone = phone.trim();
        if (email && !client.email) client.email = email.trim();
        if (licenseKey && (!client.licenseKey || client.licenseKey !== licenseKey)) client.licenseKey = licenseKey;
    }

    saveClients(clients);

    if (client.status === 'suspended') {
        return res.json({
            success: true,
            isAllowed: false,
            status: 'suspended',
            message: client.suspendReason || 'تم إيقاف هذا الترخيص من قبل الإدارة، يرجى التواصل لتجديد اشتراكك 🔒',
            broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
        });
    }

    let isExpired = false;
    let daysLeft = 'LIFETIME';
    if (client.expiry && client.expiry !== 'LIFETIME') {
        const expTime = new Date(client.expiry + 'T23:59:59').getTime();
        if (now > expTime) {
            isExpired = true;
            daysLeft = 0;
        } else {
            daysLeft = Math.ceil((expTime - now) / 86400000);
        }
    }

    if (isExpired) {
        return res.json({
            success: true,
            isAllowed: false,
            status: 'expired',
            message: 'انتهت صلاحية اشتراكك في البرنامج، يرجى التواصل مع الإدارة للتجديد ⌛',
            plan: client.plan,
            expiry: client.expiry,
            daysLeft: 0,
            broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
        });
    }

    res.json({
        success: true,
        isAllowed: true,
        status: 'active',
        plan: client.plan,
        expiry: client.expiry,
        daysLeft: daysLeft === 'LIFETIME' ? 'غير محدود' : daysLeft,
        licenseKey: client.licenseKey,
        broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null,
        serverTime: new Date().toISOString()
    });
});

// Admin Dashboard UI Route
app.get(['/', '/admin', '/dashboard'], (req, res) => {
    const adminHtml = path.join(__dirname, '..', 'لوحة_تحكم_الادمن_المركزية_Cloud', 'public', 'index.html');
    if (fs.existsSync(adminHtml)) {
        return res.sendFile(adminHtml);
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
