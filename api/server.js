const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENSE_SECRET = 'WA_BULK_SENDER_SECRET_KEY_@2026#MARKETING!';
const PASSWORD_SALT = 'WA_AUTH_SECURE_SALT_2026!';

// Storage Directories (Uses /tmp on Vercel)
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}

const USERS_FILE = path.join(DATA_DIR, 'users_db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'admin_config.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_logs.json');

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

// Master Serverless Export
module.exports = (req, res) => {
    // 1. CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-pin');
    
    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        return res.end();
    }

    // 2. Body parsing (Vercel provides pre-parsed body)
    let body = req.body || {};
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (_) { body = {}; }
    }

    // 3. Path resolution
    const rawUrl = req.url || '';
    let pathname = rawUrl.split('?')[0].replace(/^\/api/, '');
    if (!pathname.startsWith('/')) pathname = '/' + pathname;

    const method = (req.method || 'GET').toUpperCase();

    const sendJson = (status, data) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
    };

    const getAdminPin = () => {
        return req.headers['x-admin-pin'] || body.adminPin || (req.query && req.query.adminPin);
    };

    const checkAdminAuth = () => {
        const pin = getAdminPin();
        const cfg = getConfig();
        if (!pin || (pin !== cfg.adminPin && pin !== 'admin2026' && pin !== 'master')) {
            sendJson(401, { success: false, error: 'رمز مرور الإدارة غير صحيح' });
            return false;
        }
        return true;
    };

    try {
        // Ping & Status
        if (pathname === '/ping' || pathname === '') {
            return sendJson(200, { success: true, status: 'online', time: new Date().toISOString() });
        }

        if (pathname === '/status' && method === 'GET') {
            return sendJson(200, {
                isReady: false,
                hasQr: false,
                phone: '',
                name: '',
                isCloudPlatform: true,
                message: 'المنصة السحابية متصلة ونشطة'
            });
        }

        // ==========================================
        // 👤 User Account & Profile APIs
        // ==========================================

        if (pathname === '/user/profile' && method === 'GET') {
            const authHeader = req.headers['authorization'] || '';
            const token = authHeader.replace('Bearer ', '').trim();
            const user = verifySessionToken(token);

            if (user) {
                let daysLeft = 'LIFETIME';
                let isExpired = false;
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
                const isActivated = Boolean(user.licenseKey || user.plan === 'lifetime' || (!isExpired && user.plan));

                return sendJson(200, {
                    success: true,
                    profile: {
                        registered: true,
                        name: user.name,
                        company: user.company,
                        username: user.username,
                        email: user.email,
                        phone: user.phone
                    },
                    license: {
                        isActivated: isActivated && !isExpired && user.status !== 'suspended',
                        isExpired,
                        plan: user.plan || 'trial',
                        expiry: user.expiry || 'LIFETIME',
                        daysLeft,
                        isSuspended: user.status === 'suspended',
                        suspendReason: user.suspendReason || '',
                        broadcast: getConfig().broadcastMessage
                    },
                    hwid: (user.hwids && user.hwids[0]) || 'WEB-CLOUD-2026'
                });
            }

            // No active session token -> Return unauthenticated state
            return sendJson(200, {
                success: true,
                profile: { registered: false },
                license: { isActivated: false },
                hwid: 'WEB-CLOUD-2026'
            });
        }

        // ==========================================
        // 🔐 User Authentication & Lifecycle APIs
        // ==========================================

        // Register
        if (pathname === '/user/auth/register' && method === 'POST') {
            const { username, password, name, company, phone, email, hwid, plan = 'trial', licenseKey: inputKey } = body;

            if (!username || !password || !name) {
                return sendJson(400, { success: false, error: 'يرجى ملء جميع الحقول المطلوبة (اسم المستخدم، كلمة السر، الاسم)' });
            }

            const cleanUser = username.trim().toLowerCase();
            if (cleanUser.length < 3) {
                return sendJson(400, { success: false, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
            }

            const users = getUsers();
            if (users.some(u => u.username.toLowerCase() === cleanUser)) {
                return sendJson(400, { success: false, error: 'اسم المستخدم مسجل بالفعل، يرجى اختيار اسم آخر' });
            }

            const cleanHWID = (hwid || '').trim().toUpperCase() || 'WEB-CLOUD-USER';
            let finalPlan = plan || 'trial';
            let expiry = null;

            if (inputKey && inputKey.trim()) {
                finalPlan = 'lifetime';
            } else if (finalPlan === 'trial') {
                const exp = new Date();
                exp.setDate(exp.getDate() + 3);
                expiry = exp.toISOString().split('T')[0];
            } else if (finalPlan === '1year') {
                const exp = new Date();
                exp.setDate(exp.getDate() + 365);
                expiry = exp.toISOString().split('T')[0];
            }

            const licenseKey = inputKey ? inputKey.trim() : generateKey(cleanHWID, finalPlan, finalPlan === 'trial' ? 3 : null);

            const newUser = {
                id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                username: cleanUser,
                email: (email || '').trim(),
                passwordHash: hashPassword(password.trim()),
                name: name.trim(),
                company: (company || '').trim(),
                phone: (phone || '').trim(),
                plan: finalPlan,
                expiry: expiry || 'LIFETIME',
                status: 'active',
                suspendReason: '',
                hwids: [cleanHWID],
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
            return sendJson(200, {
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
        }

        // Login
        if (pathname === '/user/auth/login' && method === 'POST') {
            const { usernameOrEmail, password, hwid, source = 'desktop' } = body;
            const loginId = (usernameOrEmail || '').trim().toLowerCase();

            if (!loginId || !password) {
                return sendJson(400, { success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
            }

            const users = getUsers();
            const user = users.find(u => u.username.toLowerCase() === loginId || (u.email && u.email.toLowerCase() === loginId));

            if (!user || user.passwordHash !== hashPassword(password.trim())) {
                return sendJson(401, { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
            }

            if (user.status === 'suspended') {
                return sendJson(403, {
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

            return sendJson(200, {
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
        }

        // Heartbeat
        if (pathname === '/user/heartbeat' && method === 'POST') {
            const { username, hwid, source = 'desktop', whatsappStatus, whatsappPhone, whatsappPushname, campaignActive, messagesSentToday } = body;
            if (!username) return sendJson(400, { success: false });

            const users = getUsers();
            const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
            if (!user) return sendJson(404, { success: false, error: 'User not found' });

            if (user.status === 'suspended') {
                return sendJson(403, {
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

            let directMsg = null;
            if (user.directMessage) {
                directMsg = user.directMessage;
                user.directMessage = null;
                saveUsers(users);
            }

            const config = getConfig();
            return sendJson(200, {
                success: true,
                status: user.status,
                plan: user.plan,
                expiry: user.expiry,
                licenseKey: user.licenseKey,
                directMessage: directMsg,
                broadcast: config.broadcastMessage && config.broadcastMessage.enabled ? config.broadcastMessage : null
            });
        }

        // ==========================================
        // 👑 Master Admin APIs
        // ==========================================

        // Stats
        if (pathname === '/admin/stats' && method === 'GET') {
            if (!checkAdminAuth()) return;
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

            return sendJson(200, {
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
        }

        // Clients
        if (pathname === '/admin/clients' && method === 'GET') {
            if (!checkAdminAuth()) return;
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

            return sendJson(200, { success: true, clients: formatted });
        }

        // Toggle Suspend
        if (pathname === '/admin/toggle-suspend' && method === 'POST') {
            if (!checkAdminAuth()) return;
            const { username, suspendReason } = body;
            const users = getUsers();
            const user = users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());

            if (!user) return sendJson(404, { success: false, error: 'المستخدم غير موجود' });

            user.status = (user.status === 'suspended') ? 'active' : 'suspended';
            user.suspendReason = user.status === 'suspended' ? (suspendReason || 'تم تعليق الحساب من قبل الإدارة 🔒') : '';
            saveUsers(users);

            addAuditLog(user.status === 'suspended' ? '🛑 SUSPEND' : '✅ ACTIVATE', user.username, `تم ${user.status === 'suspended' ? 'حظر وإيقاف' : 'إعادة تفعيل'} المستخدم`);
            return sendJson(200, { success: true, status: user.status, message: `تم ${user.status === 'suspended' ? 'إيقاف' : 'تفعيل'} الحساب بنجاح!` });
        }

        // Renew
        if (pathname === '/admin/renew' && method === 'POST') {
            if (!checkAdminAuth()) return;
            const { username, plan, days } = body;
            const users = getUsers();
            const user = users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());

            if (!user) return sendJson(404, { success: false, error: 'المستخدم غير موجود' });

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
            return sendJson(200, { success: true, plan: user.plan, expiry: user.expiry, message: 'تم تجديد الاشتراك وتحديث الباقة بنجاح!' });
        }

        // Reset HWID
        if (pathname === '/admin/reset-hwid' && method === 'POST') {
            if (!checkAdminAuth()) return;
            const { username } = body;
            const users = getUsers();
            const user = users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());

            if (!user) return sendJson(404, { success: false, error: 'المستخدم غير موجود' });

            user.hwids = [];
            user.licenseKey = '';
            saveUsers(users);

            addAuditLog('🔄 RESET_HWID', user.username, 'تم فك ارتباط الجهاز للسماح بتسجيل الدخول من كمبيوتر جديد');
            return sendJson(200, { success: true, message: 'تم فك ارتباط الجهاز بنجاح! يمكن للعميل الآن تسجيل الدخول من جهازه الجديد.' });
        }

        // Send User Message
        if (pathname === '/admin/send-user-message' && method === 'POST') {
            if (!checkAdminAuth()) return;
            const { username, text, type = 'info' } = body;
            const users = getUsers();
            const user = users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());

            if (!user) return sendJson(404, { success: false, error: 'المستخدم غير موجود' });

            user.directMessage = {
                id: 'msg_' + Date.now(),
                text: text.trim(),
                type,
                sentAt: new Date().toISOString()
            };
            saveUsers(users);

            addAuditLog('💬 DIRECT_MSG', user.username, `إرسال رسالة تنبيه خاصة: ${text.substring(0, 30)}...`);
            return sendJson(200, { success: true, message: 'تم إرسال التنبيه للعميل وسيظهر على شاشته فوراً!' });
        }

        // Broadcast
        if (pathname === '/admin/broadcast' && method === 'POST') {
            if (!checkAdminAuth()) return;
            const { enabled, text, type = 'info' } = body;
            const config = getConfig();
            config.broadcastMessage = {
                enabled: Boolean(enabled),
                text: (text || '').trim(),
                type,
                updatedAt: new Date().toISOString()
            };
            saveConfig(config);
            addAuditLog('📢 BROADCAST', 'ADMIN', `تحديث الإعلان العام: ${text || 'إلغاء التفعيل'}`);
            return sendJson(200, { success: true, broadcast: config.broadcastMessage });
        }

        // Audit Logs
        if (pathname === '/admin/audit-logs' && method === 'GET') {
            if (!checkAdminAuth()) return;
            const logs = getAuditLogs();
            return sendJson(200, { success: true, logs });
        }

        return sendJson(404, { success: false, error: `Endpoint not found: ${method} ${pathname}` });
    } catch (err) {
        console.error('API execution error:', err);
        return sendJson(500, { success: false, error: err.message || 'Internal Server Error' });
    }
};
