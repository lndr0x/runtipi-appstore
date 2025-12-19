const fs = require('fs');
const path = require('path');

const appsDir = path.join(__dirname, '..', 'apps');

if (!fs.existsSync(appsDir)) {
    console.error('Apps directory not found!');
    process.exit(1);
}

const apps = fs.readdirSync(appsDir);
let hasError = false;

apps.forEach(app => {
    const appPath = path.join(appsDir, app);
    if (!fs.statSync(appPath).isDirectory()) return;

    // Check config.json
    try {
        const configPath = path.join(appPath, 'config.json');
        if (fs.existsSync(configPath)) {
            JSON.parse(fs.readFileSync(configPath, 'utf8'));
            // console.log(`[PASS] ${app} config.json`);
        } else {
            console.error(`[FAIL] ${app} missing config.json`);
            hasError = true;
        }
    } catch (e) {
        console.error(`[FAIL] ${app} config.json invalid: ${e.message}`);
        hasError = true;
    }

    // Check docker-compose.json
    try {
        const dcPath = path.join(appPath, 'docker-compose.json');
        if (fs.existsSync(dcPath)) {
            JSON.parse(fs.readFileSync(dcPath, 'utf8'));
            // console.log(`[PASS] ${app} docker-compose.json`);
        } else {
            // Some apps might not have docker-compose.json if they are just categories? No, all runtipi apps need it.
            console.error(`[FAIL] ${app} missing docker-compose.json`);
            hasError = true;
        }
    } catch (e) {
        console.error(`[FAIL] ${app} docker-compose.json invalid: ${e.message}`);
        hasError = true;
    }
});

if (hasError) {
    console.error('Verification failed for some apps.');
    process.exit(1);
} else {
    console.log('All apps verified successfully.');
}
