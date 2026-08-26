const fs = require('fs');
const path = require('path');

/**
 * Auto-detect Google Chrome or Microsoft Edge browser path on Windows
 */
function findBrowserPath() {
    const possiblePaths = [
        // 1. Google Chrome (64-bit & Default)
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        // 2. Google Chrome (32-bit)
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        // 3. Google Chrome (User AppData)
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        // 4. Microsoft Edge (64-bit & 32-bit)
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        // 5. Brave Browser
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    ];

    for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
            console.log(`[Browser] Found browser at: ${p}`);
            return p;
        }
    }

    console.log('[Browser] Using default bundled browser engine.');
    return undefined;
}

module.exports = {
    findBrowserPath
};
