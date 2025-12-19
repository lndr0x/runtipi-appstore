import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TARGET_DIR = path.join(__dirname, '..', 'apps');
const BASE_URL = 'https://raw.githubusercontent.com/runtipi/runtipi-appstore/master/apps';

// Helper to download content
const downloadContent = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            if (res.statusCode !== 200) {
                res.resume();
                return resolve(null); // Return null if not found
            }
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
};

// Helper to write file
const writeFile = (filePath, content) => {
    fs.writeFileSync(filePath, content, 'utf8');
};

const main = async () => {
    console.log('Starting app update process...');

    if (!fs.existsSync(TARGET_DIR)) {
        console.error('Apps directory not found!');
        return;
    }

    const apps = fs.readdirSync(TARGET_DIR).filter(file => {
        return fs.statSync(path.join(TARGET_DIR, file)).isDirectory();
    });

    console.log(`Found ${apps.length} installed apps.`);

    for (const appName of apps) {
        console.log(`Checking ${appName}...`);
        const localConfigPath = path.join(TARGET_DIR, appName, 'config.json');

        if (!fs.existsSync(localConfigPath)) {
            console.warn(`Skipping ${appName}: No config.json found.`);
            continue;
        }

        let localConfig;
        try {
            localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
        } catch (e) {
            console.warn(`Skipping ${appName}: Invalid local config.json.`);
            continue;
        }

        // Try to fetch upstream config
        // NOTE: We assume the folder name matches the upstream name. 
        // If there are mapping differences (e.g. n8n-1 vs n8n), this simple check might fail 
        // unless we built a sophisticated reverse-lookup. 
        // However, for most apps, and for the ones properly renamed, this works.
        // For 'n8n-1', upstream is 'n8n', so this lookup will fail (404) and skip, which is SAFE.
        // To support mapped apps, we would need the original mapping. 
        // For now, we will try the directory name. If it fails, we warn.

        let upstreamConfigContent = await downloadContent(`${BASE_URL}/${appName}/config.json`);

        // Handle mapped names by trying common patterns if direct lookup fails
        if (!upstreamConfigContent) {
            // Try removing -1 suffix
            const cleanName = appName.replace(/-1$/, '');
            if (cleanName !== appName) {
                upstreamConfigContent = await downloadContent(`${BASE_URL}/${cleanName}/config.json`);
            }
        }

        // Additional manual mappings if needed
        if (!upstreamConfigContent) {
            if (appName === 'pairdrop') upstreamConfigContent = await downloadContent(`${BASE_URL}/pairdrop/config.json`); // pairdrop is pairdrop in repo? yes.
            if (appName === 'uptime-kuma') upstreamConfigContent = await downloadContent(`${BASE_URL}/uptime-kuma/config.json`);
        }

        if (!upstreamConfigContent) {
            console.warn(`[SKIP] Could not find upstream config for ${appName} (or it is a custom app).`);
            continue;
        }

        let upstreamConfig;
        try {
            upstreamConfig = JSON.parse(upstreamConfigContent);
        } catch (e) {
            console.warn(`[SKIP] Upstream config for ${appName} is invalid JSON.`);
            continue;
        }

        // VERSION CHECK
        // If local version is technically "greater" or equal, we skip.
        // We do a simple string comparison or use semver if available.
        // Runtipi versions are often strings like "v1.2.3" or "1.2.3".

        const localVer = localConfig.version || '0.0.0';
        const upstreamVer = upstreamConfig.version || '0.0.0';

        if (localVer === upstreamVer) {
            console.log(`[OK] ${appName} is up to date (${localVer}).`);
            continue;
        }

        // Very basic semantic version check (handling major versions only for safety)
        // If local starts with 32 and upstream starts with 26...
        const parseMajor = (v) => parseInt(v.replace(/[^0-9.]/g, '').split('.')[0]);
        const localMajor = parseMajor(localVer);
        const upstreamMajor = parseMajor(upstreamVer);

        if (localMajor > upstreamMajor) {
            console.log(`[SKIP] ${appName} local version (${localVer}) is NEWER than upstream (${upstreamVer}). Keeping local.`);
            continue;
        }

        console.log(`[UPDATE] Updating ${appName} from ${localVer} to ${upstreamVer}...`);

        // Download and overwrite files
        // 1. config.json
        writeFile(localConfigPath, upstreamConfigContent);

        // 2. docker-compose.json
        const upstreamComposeContent = await downloadContent(`${BASE_URL}/${appName}/docker-compose.json`) ||
            await downloadContent(`${BASE_URL}/${appName.replace(/-1$/, '')}/docker-compose.json`);

        if (upstreamComposeContent) {
            writeFile(path.join(TARGET_DIR, appName, 'docker-compose.json'), upstreamComposeContent);
        }

        // 3. Metadata (optional but good)
        // We skip exact metadata syncing for speed, unless needed. 
        // The user asked to "adapt all files", so we should ideally do it.
        const metadataDir = path.join(TARGET_DIR, appName, 'metadata');
        if (!fs.existsSync(metadataDir)) fs.mkdirSync(metadataDir, { recursive: true });

        const desc = await downloadContent(`${BASE_URL}/${appName}/metadata/description.md`) ||
            await downloadContent(`${BASE_URL}/${appName.replace(/-1$/, '')}/metadata/description.md`);
        if (desc) writeFile(path.join(metadataDir, 'description.md'), desc);

        console.log(`[SUCCESS] Updated ${appName}.`);
    }

    console.log('Update process finished.');
};

main();
