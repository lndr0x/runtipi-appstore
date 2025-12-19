import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appsToFetch = [
    'immich',
    'glances',
    'zipline',
    'crafty',
    'vaultwarden',
    'openwebui',
    'homeassistant',
    'convertx',
    'vert.cc',
    'forgejo',
    'gitlab',
    'libreddit',
    'n8n',
    'nextcloud',
    'ntfy',
    'sqlite database browser',
    'stirling pdf',
    'syncthing',
    'uptimekuma',
    'snapdrop'
];

const BASE_URL = 'https://raw.githubusercontent.com/runtipi/runtipi-appstore/master/apps';
const TARGET_DIR = path.join(__dirname, '..', 'apps');

if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR);
}

const fetchAppList = async () => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/runtipi/runtipi-appstore/contents/apps',
            headers: {
                'User-Agent': 'node.js'
            }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const files = JSON.parse(data);
                        const appFolders = files.filter(f => f.type === 'dir').map(f => f.name);
                        resolve(appFolders);
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error(`Failed to fetch app list: ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
};

const findBestMatch = (requested, available) => {
    // Special mappings/guesses (Overrides)
    if (requested === 'openwebui') return 'open-webui';
    if (requested === 'uptimekuma') return 'uptime-kuma';
    if (requested === 'snapdrop') return 'pairdrop';
    if (requested === 'sqlite database browser') return null; // Not found
    if (requested === 'convertx') return null; // Not found
    if (requested === 'vert.cc') return null; // Not found
    if (requested === 'gitlab') return null; // Not found
    if (requested === 'libreddit') return null; // Not found

    // Exact match
    if (available.includes(requested)) return requested;

    // Normalize requested (remove spaces, lowercase)
    const normalizedReq = requested.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '-');
    if (available.includes(normalizedReq)) return normalizedReq;

    // Try finding one that contains the name
    const partial = available.find(a => a.includes(normalizedReq));
    if (partial) return partial;

    return null;
};

const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            } else {
                fs.unlink(dest, () => { }); // Delete the file async
                reject(new Error(`Server responded with ${response.statusCode}: ${url}`));
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
};

const fetchApp = async (remoteName, localName) => {
    console.log(`Fetching ${remoteName} -> ${localName}`);
    const appDir = path.join(TARGET_DIR, localName);
    const metadataDir = path.join(appDir, 'metadata');

    try {
        if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });
        if (!fs.existsSync(metadataDir)) fs.mkdirSync(metadataDir, { recursive: true });

        await downloadFile(`${BASE_URL}/${remoteName}/config.json`, path.join(appDir, 'config.json'));
        await downloadFile(`${BASE_URL}/${remoteName}/docker-compose.json`, path.join(appDir, 'docker-compose.json'));

        try {
            await downloadFile(`${BASE_URL}/${remoteName}/metadata/description.md`, path.join(metadataDir, 'description.md'));
        } catch (e) { /* ignore */ }

        try {
            await downloadFile(`${BASE_URL}/${remoteName}/metadata/logo.jpg`, path.join(metadataDir, 'logo.jpg'));
        } catch (e) { /* ignore */ }

        console.log(`Successfully fetched ${remoteName}`);
    } catch (error) {
        console.error(`Failed to fetch ${remoteName}:`, error.message);
    }
};

const main = async () => {
    try {
        console.log('Fetching list of available apps from GitHub...');
        const availableApps = await fetchAppList();
        console.log(`Found ${availableApps.length} apps available.`);

        for (const app of appsToFetch) {
            const bestMatch = findBestMatch(app, availableApps);

            if (bestMatch) {
                console.log(`Matched "${app}" to "${bestMatch}"`);
                // Use the matched name for both to ensure consistency with Runtipi standards
                await fetchApp(bestMatch, bestMatch);
            } else {
                console.warn(`Could not find a match for "${app}"`);
            }
        }
    } catch (e) {
        console.error('Error in main:', e);
    }
};

main();
