import crypto from 'node:crypto';

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/generate-auth-hash.mjs "your-password"');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
const sessionSecret = crypto.randomBytes(32).toString('base64url');

console.log(`MONDAY_AUTH_PASSWORD_SALT=${salt}`);
console.log(`MONDAY_AUTH_PASSWORD_HASH=${hash}`);
console.log(`MONDAY_SESSION_SECRET=${sessionSecret}`);
