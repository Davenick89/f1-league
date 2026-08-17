import fs from 'node:fs';
import { loadEnv } from 'vite';

const swPath = 'dist/firebase-messaging-sw.js';
if (!fs.existsSync(swPath)) {
  throw new Error(`Service worker not found: ${swPath}`);
}

const env = loadEnv('production', process.cwd(), '');
const vars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];
const missingVars = vars.filter(key => !env[key]?.trim());
if (missingVars.length > 0) {
  throw new Error(`Missing required Firebase environment variable(s): ${missingVars.join(', ')}`);
}

let sw = fs.readFileSync(swPath, 'utf8');
for (const key of vars) sw = sw.replaceAll(`__${key}__`, env[key]);
fs.writeFileSync(swPath, sw);
