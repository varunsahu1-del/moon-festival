#!/usr/bin/env node
// Run: npm run setup
// Sets your admin username and password in .env

const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

async function main() {
  console.log('\n── Moon Festival Admin Setup ──────────────────\n');
  const username = await ask('Admin username: ');
  const password = await ask('Admin password: ');
  const hash = await bcrypt.hash(password, 12);

  const envPath = path.join(__dirname, '..', '.env');
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : fs.readFileSync(envPath + '.example', 'utf8');

  env = env.replace(/^ADMIN_USERNAME=.*/m, `ADMIN_USERNAME=${username}`);
  env = env.replace(/^ADMIN_PASSWORD_HASH=.*/m, `ADMIN_PASSWORD_HASH=${hash}`);

  fs.writeFileSync(envPath, env);
  console.log('\n✓ Credentials saved to .env');
  console.log('  Username:', username);
  console.log('  Password: [hashed]\n');
  rl.close();
}

main().catch(err => { console.error(err); process.exit(1); });
