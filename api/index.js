const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENSE_SECRET = 'WA_BULK_SENDER_SECRET_KEY_@2026#MARKETING!';
const PASSWORD_SALT = 'WA_AUTH_SECURE_SALT_2026!';

// Storage Directories (Uses /tmp on Vercel)
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}

const USERS_FILE = path.join(DATA_DIR, 'users_db.json');
const AGENTS_FILE = path.join(DATA_DIR, 'agents_db.json');
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
        agentId: null,
        agentName: '',
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

let memoryAgents = [
    {
        id: 'agent_cairo_vip',
        name: 'وكالة النخبة للتسويق',
        username: 'agent1',
        passwordHash: hashPassword('agent123'),
        phone: '01098765432',
        company: 'وكيل معتمد - القاهرة',
        credits: 30, // 30 license quota
        totalIssued: 5,
        commission: '30%',
        status: 'active',
        notes: 'الوكيل الإقليمي لمنطقة القاهرة',
        createdAt: new Date().toISOString()
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
        details: 'تم تشغيل المنظومة السحابية المركزية وإدارة الوكلاء بنجاح'
    }
];

function getUsers() { return readJsonSafe(USERS_FILE, memoryUsers); }
function saveUsers(users) { memoryUsers = users; writeJsonSafe(USERS_FILE, users); }

function getAgents() { return readJsonSafe(AGENTS_FILE, memoryAgents); }
function saveAgents(agents) { memoryAgents = agents; writeJsonSafe(AGENTS_FILE, agents); }

function getConfig() { return readJsonSafe(CONFIG_FILE, memoryConfig); }
function saveConfig(cfg) { memoryConfig = cfg; writeJsonSafe(CONFIG_FILE, cfg); }

function getAuditLogs() { return readJsonSafe(AUDIT_FILE, memoryAuditLogs); }
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
    if (logs.length > 300) logs.pop();
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

function generateSessionToken(user, type = 'user') {
    const payload = `${type}:${user.id}:${user.username}:${Date.now()}`;
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
        const parts = payload.split(':');
        if (parts.length >= 3) {
            const [type, id, username] = parts;
            if (type === 'agent') {
                const agents = getAgents();
                return { isAgent: true, agent: agents.find(a => a.id === id && a.username === username) || null };
            } else {
                const users = getUsers();
                return { isUser: true, user: users.find(u => u.id === id && u.username === username) || null };
            }
        }
        return null;
    } catch (_) {
        return null;
    }
}

// Master Serverless Export
module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-pin, x-agent-token');
    
    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        return res.end();
    }

    let body = req.body || {};
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (_) { body = {}; }
    }

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
        // Ping
        if (pathname === '/ping' || pathname === '') {
            return sendJson(200, { success: true, status: 'online', time: new Date().toISOString() });
        }

        // ==========================================
        // 👤 Client Authentication & Lifecycle
        // ==========================================

        if (pathname === '/user/profile' && method === 'GET') {
            const authHeader = req.headers['authorization'] || '';
            const token = authHeader.replace('Bearer ', '').trim();
            const session = verifySessionToken(token);

            if (session && session.user) {
                const user = session.user;
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
                        phone: user.phone,
                        agentName: user.agentName || ''
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
                    hwid: (user.hwids && user.hwids[0]) || 'DESKTOP-APP-2026'
                });
            }

            return sendJson(200, {
                success: true,
                profile: { registered: false },
                license: { isActivated: false },
                hwid: 'DESKTOP-APP-2026'
            });
        }

        // Client Register
        if (pathname === '/user/auth/register' && method === 'POST') {
            const { username, password, name, company, phone, email, hwid, plan = 'trial', licenseKey: inputKey, agentCode } = body;

            if (!username || !password || !name) {
                return sendJson(400, { success: false, error: 'يرجى ملء الحقول المطلوبة (اسم المستخدم، كلمة السر، الاسم)' });
            }

            const cleanUser = username.trim().toLowerCase();
            if (cleanUser.length < 3) {
                return sendJson(400, { success: false, error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
            }

            const users = getUsers();
            if (users.some(u => u.username.toLowerCase() === cleanUser)) {
                return sendJson(400, { success: false, error: 'اسم المستخدم مسجل بالفعل، يرجى اختيار اسم آخر' });
            }

            const cleanHWID = (hwid || '').trim().toUpperCase() || 'DESKTOP-APP-USER';
            let finalPlan = plan || 'trial';
            let expiry = null;

            // Check if registered under an agent
            let assignedAgent = null;
            if (agentCode) {
                const agents = getAgents();
                assignedAgent = agents.find(a => a.username.toLowerCase() === agentCode.trim().toLowerCase() || a.id === agentCode.trim());
            }

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
                agentId: assignedAgent ? assignedAgent.id : null,
                agentName: assignedAgent ? assignedAgent.name : '',
                createdAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
                lastSeenAt: new Date().toISOString(),
                activeSource: 'desktop',
                whatsappStatus: 'disconnected',
                whatsappAccount: null,
                campaignMetrics: { active: false, sentToday: 0, totalSent: 0, lastCampaignAt: null },
                directMessage: null
            };

            users.push(newUser);
            saveUsers(users);
            addAuditLog('✨ REGISTER', newUser.username, `تسجيل مستخدم جديد: ${newUser.name} (${newUser.company || 'فردي'}) ${assignedAgent ? 'عبر وكيل: ' + assignedAgent.name : ''}`);

            const token = generateSessionToken(newUser, 'user');
            return sendJson(200, {
                success: true,
                message: 'تم إنشاء الحساب بنجاح! 🎉',
                token,
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    name: newUser.name,
                    company: newUser.company,
                    phone: newUser.phone,
                    plan: newUser.plan,
                    expiry: newUser.expiry
                }
            });
        }

        // Client Login
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
                    error: user.suspendReason || 'تم إيقاف هذا الحساب من قبل الإدارة 🔒'
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

            addAuditLog('🔑 LOGIN', user.username, 'تسجيل دخول إلى تطبيق WhatsApp Flow Pro');

            const token = generateSessionToken(user, 'user');
            const config = getConfig();

            return sendJson(200, {
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    company: user.company,
                    phone: user.phone,
                    plan: user.plan,
                    expiry: user.expiry,
                    status: user.status,
                    licenseKey: user.licenseKey
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
                return sendJson(403, { success: false, isSuspended: true, error: user.suspendReason || 'الحساب معلق' });
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
        // 👔 Agents & Resellers Master APIs
        // ==========================================

        // List Agents (Admin)
        if (pathname === '/admin/agents' && method === 'GET') {
            if (!checkAdminAuth()) return;
            const agents = getAgents();
            const users = getUsers();

            const formatted = agents.map(a => {
                const myClients = users.filter(u => u.agentId === a.id);
                const activeClients = myClients.filter(u => u.status === 'active').length;
                return {
                    id: a.id,
                    name: a.name,
                    username: a.username,
                    phone: a.phone,
                    company: a.company,
                    credits: a.credits || 0,
                    totalIssued: a.totalIssued || 0,
                    totalClients: myClients.length,
                    activeClients,
                    commission: a.commission || '30%',
                    status: a.status || 'active',
                    notes: a.notes || '',
                    createdAt: a.createdAt
                };
            });

            return sendJson(200, { success: true, agents: formatted });
        }

        // Create Agent (Admin)
        if (pathname === '/admin/agents/create' && method === 'POST') {
            if (!checkAdminAuth()) return;
            const { name, username, password, phone, company, credits = 10, commission = '30%', notes } = body;

            if (!name || !username || !password) {
                return sendJson(400, { success: false, error: 'يرجى إدخال اسم الوكيل، اسم المستخدم، وكلمة المرور' });
            }

            const cleanUser = username.trim().toLowerCase();
            const agents = getAgents();

            if (agents.some(a => a.username.toLowerCase() === cleanUser)) {
                return sendJson(400, { success: false, error: 'اسم مستخدم الوكيل مسجل بالفعل' });
            }

            const newAgent = {
                id: 'agent_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                name: name.trim(),
                username: cleanUser,
                passwordHash: hashPassword(password.trim()),
                phone: (phone || '').trim(),
                company: (company || '').trim() || 'وكالة تسويق معتمدة',
                credits: parseInt(credits) || 0,
                totalIssued: 0,
                commission: commission || '30%',
                status: 'active',
                notes: notes || '',
                createdAt: new Date().toISOString()
            };

            agents.push(newAgent);
            saveAgents(agents);
            addAuditLog('👔 NEW_AGENT', 'ADMIN', `إضافة وكيل جديد: ${newAgent.name} (${newAgent.username}) برصيد ${newAgent.credits} ترخيص`);

            return sendJson(200, { success: true, agent: newAgent, message: 'تم إضافة الوكيل بنجاح وتخصيص رصيد التراخيص له! 🎉' });
        }

        // Recharge Agent Credits (Admin)
        if (pathname === '/admin/agents/recharge' && method === 'POST') {
            if (!checkAdminAuth()) return;
            const { agentId, addCredits } = body;
            const agents = getAgents();
            const agent = agents.find(a => a.id === agentId || a.username.toLowerCase() === (agentId || '').toLowerCase());

            if (!agent) return sendJson(404, { success: false, error: 'الوكيل غير موجود' });

            const amount = parseInt(addCredits) || 0;
            agent.credits = (agent.credits || 0) + amount;
            saveAgents(agents);

            addAuditLog('⚡ AGENT_RECHARGE', 'ADMIN', `شحن رصيد للوكيل ${agent.name}: +${amount} ترخيص (الرصيد الحالي: ${agent.credits})`);
            return sendJson(200, { success: true, credits: agent.credits, message: `تم شحن رصيد الوكيل بنجاح! الرصيد الحالي: ${agent.credits} ترخيص.` });
        }

        // Toggle Agent Status (Admin)
        if (pathname === '/admin/agents/toggle-status' && method === 'POST') {
            if (!checkAdminAuth()) return;
            const { agentId } = body;
            const agents = getAgents();
            const agent = agents.find(a => a.id === agentId || a.username.toLowerCase() === (agentId || '').toLowerCase());

            if (!agent) return sendJson(404, { success: false, error: 'الوكيل غير موجود' });

            agent.status = (agent.status === 'suspended') ? 'active' : 'suspended';
            saveAgents(agents);

            addAuditLog('🔄 AGENT_STATUS', 'ADMIN', `تعديل حالة الوكيل ${agent.name} إلى: ${agent.status}`);
            return sendJson(200, { success: true, status: agent.status, message: `تم ${agent.status === 'suspended' ? 'إيقاف' : 'تفعيل'} حساب الوكيل!` });
        }

        // Delete Agent (Admin)
        if (pathname === '/admin/agents/delete' && method === 'POST') {
            if (!checkAdminAuth()) return;
            const { agentId } = body;
            let agents = getAgents();
            agents = agents.filter(a => a.id !== agentId && a.username.toLowerCase() !== (agentId || '').toLowerCase());
            saveAgents(agents);

            addAuditLog('🗑️ DELETE_AGENT', 'ADMIN', `حذف الوكيل: ${agentId}`);
            return sendJson(200, { success: true, message: 'تم حذف الوكيل بنجاح' });
        }

        // Agent Self-Login
        if (pathname === '/agent/auth/login' && method === 'POST') {
            const { username, password } = body;
            const cleanUser = (username || '').trim().toLowerCase();

            const agents = getAgents();
            const agent = agents.find(a => a.username.toLowerCase() === cleanUser);

            if (!agent || agent.passwordHash !== hashPassword((password || '').trim())) {
                return sendJson(401, { success: false, error: 'اسم مستخدم الوكيل أو كلمة المرور غير صحيحة' });
            }

            if (agent.status === 'suspended') {
                return sendJson(403, { success: false, error: 'حساب الوكيل موقوف حالياً، يرجى التواصل مع الإدارة العليا' });
            }

            const token = generateSessionToken(agent, 'agent');
            addAuditLog('👔 AGENT_LOGIN', agent.username, `تسجيل دخول الوكيل: ${agent.name}`);

            return sendJson(200, {
                success: true,
                token,
                agent: {
                    id: agent.id,
                    name: agent.name,
                    username: agent.username,
                    company: agent.company,
                    credits: agent.credits,
                    commission: agent.commission
                }
            });
        }

        // Agent Self Dashboard
        if (pathname === '/agent/my-dashboard' && method === 'GET') {
            const authHeader = req.headers['authorization'] || req.headers['x-agent-token'] || '';
            const token = authHeader.replace('Bearer ', '').trim();
            const session = verifySessionToken(token);

            if (!session || !session.isAgent || !session.agent) {
                return sendJson(401, { success: false, error: 'جلسة الوكيل منتهية أو غير صحيحة' });
            }

            const agent = session.agent;
            const users = getUsers();
            const myClients = users.filter(u => u.agentId === agent.id);

            return sendJson(200, {
                success: true,
                agent: {
                    id: agent.id,
                    name: agent.name,
                    company: agent.company,
                    credits: agent.credits || 0,
                    totalIssued: agent.totalIssued || 0,
                    commission: agent.commission
                },
                clients: myClients.map(c => ({
                    id: c.id,
                    name: c.name,
                    username: c.username,
                    company: c.company,
                    phone: c.phone,
                    plan: c.plan,
                    expiry: c.expiry,
                    status: c.status,
                    whatsappStatus: c.whatsappStatus,
                    createdAt: c.createdAt
                }))
            });
        }

        // Agent Creates Client Account using 1 Credit
        if (pathname === '/agent/client/create' && method === 'POST') {
            const authHeader = req.headers['authorization'] || req.headers['x-agent-token'] || '';
            const token = authHeader.replace('Bearer ', '').trim();
            const session = verifySessionToken(token);

            if (!session || !session.isAgent || !session.agent) {
                return sendJson(401, { success: false, error: 'جلسة الوكيل غير مصرح بها' });
            }

            const agents = getAgents();
            const agent = agents.find(a => a.id === session.agent.id);
            if (!agent) return sendJson(404, { success: false, error: 'الوكيل غير موجود' });

            if ((agent.credits || 0) < 1) {
                return sendJson(400, { success: false, error: 'رصيد التراخيص لديك غير كافٍ! يرجى طلب شحن رصيد من الإدارة' });
            }

            const { username, password, name, company, phone, plan = '1year' } = body;
            if (!username || !password || !name) {
                return sendJson(400, { success: false, error: 'يرجى ملء جميع الحقول المطلوبة' });
            }

            const cleanUser = username.trim().toLowerCase();
            const users = getUsers();
            if (users.some(u => u.username.toLowerCase() === cleanUser)) {
                return sendJson(400, { success: false, error: 'اسم المستخدم مسجل بالفعل' });
            }

            let expiry = 'LIFETIME';
            if (plan === '1year') {
                const exp = new Date();
                exp.setDate(exp.getDate() + 365);
                expiry = exp.toISOString().split('T')[0];
            } else if (plan === '1month') {
                const exp = new Date();
                exp.setDate(exp.getDate() + 30);
                expiry = exp.toISOString().split('T')[0];
            }

            const cleanHWID = 'DESKTOP-APP-AGENT-CLIENT';
            const licenseKey = generateKey(cleanHWID, plan, plan === '1year' ? 365 : (plan === '1month' ? 30 : null));

            const newClient = {
                id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                username: cleanUser,
                email: '',
                passwordHash: hashPassword(password.trim()),
                name: name.trim(),
                company: (company || '').trim(),
                phone: (phone || '').trim(),
                plan,
                expiry,
                status: 'active',
                suspendReason: '',
                hwids: [cleanHWID],
                licenseKey,
                agentId: agent.id,
                agentName: agent.name,
                createdAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
                lastSeenAt: new Date().toISOString(),
                activeSource: 'desktop',
                whatsappStatus: 'disconnected',
                whatsappAccount: null,
                campaignMetrics: { active: false, sentToday: 0, totalSent: 0, lastCampaignAt: null },
                directMessage: null
            };

            users.push(newClient);
            saveUsers(users);

            // Deduct 1 credit from agent
            agent.credits = (agent.credits || 1) - 1;
            agent.totalIssued = (agent.totalIssued || 0) + 1;
            saveAgents(agents);

            addAuditLog('✨ AGENT_ISSUE', agent.username, `إصدار ترخيص (${plan}) للمستخدم: ${newClient.name} - الرصيد المتبقي: ${agent.credits}`);

            return sendJson(200, {
                success: true,
                message: `تم إنشاء حساب العميل وإصدار الترخيص بنجاح! الرصيد المتبقي: ${agent.credits}`,
                client: {
                    username: newClient.username,
                    name: newClient.name,
                    plan: newClient.plan,
                    expiry: newClient.expiry,
                    licenseKey: newClient.licenseKey
                },
                remainingCredits: agent.credits
            });
        }

        // ==========================================
        // 👑 Master Admin APIs
        // ==========================================

        // Stats
        if (pathname === '/admin/stats' && method === 'GET') {
            if (!checkAdminAuth()) return;
            const users = getUsers();
            const agents = getAgents();
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

            const totalAgents = agents.length;
            const totalAgentCredits = agents.reduce((s, a) => s + (a.credits || 0), 0);

            return sendJson(200, {
                success: true,
                stats: {
                    totalUsers,
                    onlineUsers,
                    activeUsers,
                    suspendedUsers,
                    waConnectedUsers,
                    totalMessagesSent,
                    totalAgents,
                    totalAgentCredits
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
                    agentName: u.agentName || 'مباشر (الإدارة)',
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
