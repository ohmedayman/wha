const readline = require('readline');
const { generateKey, getHWID } = require('./licensing');

console.log('\n======================================================');
console.log('       [WhatsApp Flow Pro] Admin License Key Generator');
console.log('======================================================\n');

const args = process.argv.slice(2);

// Direct CLI arguments: node keygen.js <HWID> <PLAN> [DAYS]
if (args.length >= 2) {
    const hwid = args[0];
    const plan = args[1].toLowerCase();
    const days = args[2] ? parseInt(args[2]) : null;

    const key = generateKey(hwid, plan, days);
    console.log(`[Target HWID]: ${hwid}`);
    console.log(`[Plan Type]  : ${plan} ${days ? '(' + days + ' days)' : '(Lifetime)'}`);
    console.log(`\n>>> Client License Key:\n`);
    console.log(`------------------------------------------------------`);
    console.log(key);
    console.log(`------------------------------------------------------\n`);
    process.exit(0);
}

// Interactive Mode
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const currentHWID = getHWID();
console.log(`[Your Machine HWID]: ${currentHWID}\n`);

rl.question('1. Enter Client HWID (or press Enter for this PC): ', (inputHwid) => {
    const targetHwid = (inputHwid && inputHwid.trim()) ? inputHwid.trim() : currentHWID;

    console.log('\n2. Select License Plan:');
    console.log('   [1] Trial (3 Days)');
    console.log('   [2] 1 Month (30 Days)');
    console.log('   [3] 1 Year (365 Days)');
    console.log('   [4] Lifetime (Unlimited)');
    console.log('   [5] Custom Days');

    rl.question('\nSelect Plan (1-5): ', (choice) => {
        let plan = 'lifetime';
        let days = null;

        if (choice.trim() === '1') {
            plan = 'trial';
            days = 3;
        } else if (choice.trim() === '2') {
            plan = '1month';
            days = 30;
        } else if (choice.trim() === '3') {
            plan = '1year';
            days = 365;
        } else if (choice.trim() === '5') {
            rl.question('Enter number of days: ', (customDays) => {
                days = parseInt(customDays) || 30;
                plan = 'custom';
                finishGeneration(targetHwid, plan, days);
            });
            return;
        } else {
            plan = 'lifetime';
            days = null;
        }

        finishGeneration(targetHwid, plan, days);
    });
});

function finishGeneration(hwid, plan, days) {
    const key = generateKey(hwid, plan, days);
    console.log('\n======================================================');
    console.log('>>> License Key Generated Successfully!');
    console.log('======================================================');
    console.log(`[Target HWID]: ${hwid}`);
    console.log(`[Plan Type]  : ${plan} ${days ? '(' + days + ' days)' : '(Lifetime)'}`);
    console.log(`\n>>> Copy and send this key to your client:\n`);
    console.log(key);
    console.log('\n======================================================\n');
    rl.close();
}
