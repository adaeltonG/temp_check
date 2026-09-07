import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const data = path.join(root, '.local-postgres');
const env = dotenv.parse(fs.readFileSync(path.join(root, 'Api/.env')));
const url = new URL(env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '5433' || url.pathname !== '/cbredb') throw new Error('Local PostgreSQL expects cbredb on localhost:5433 in Api/.env.');
const bin = process.env.POSTGRES_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const executable = name => path.join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const run = (name, args) => {
  const result = spawnSync(executable(name), args, { windowsHide: true, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${name} failed`);
};
const command = process.argv[2] || 'start';
if (command === 'stop') {
  run('pg_ctl', ['-D', data, '-m', 'fast', 'stop']);
  console.log('Local cbredb PostgreSQL stopped.');
} else if (command === 'start') {
  fs.mkdirSync(data, { recursive: true });
  if (!fs.existsSync(path.join(data, 'PG_VERSION'))) {
    const passwordFile = path.join(root, 'Api/.env.pg-init');
    try {
      fs.writeFileSync(passwordFile, decodeURIComponent(url.password), { mode: 0o600, flag: 'wx' });
      run('initdb', ['-D', data, '-U', decodeURIComponent(url.username), '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--pwfile', passwordFile, '--encoding=UTF8', '--no-locale']);
    } finally { if (fs.existsSync(passwordFile)) fs.unlinkSync(passwordFile); }
  }
  const occupied = await new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: 5433 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
  if (!occupied) {
    const log = fs.openSync(path.join(data, 'server.log'), 'a');
    try {
      const child = spawn(executable('postgres'), ['-D', data, '-h', '127.0.0.1', '-p', '5433'], { detached: true, windowsHide: true, stdio: ['ignore', log, log] });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
    } finally { fs.closeSync(log); }
  }
  const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
  let connection;
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = new pg.Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 1000 });
    try { await candidate.connect(); connection = candidate; break; }
    catch (error) { await candidate.end(); if (occupied || attempt === 29) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  try {
    const directory = (await connection.query('SHOW data_directory')).rows[0].data_directory;
    if (path.resolve(directory).toLowerCase() !== path.resolve(data).toLowerCase()) throw new Error('Port 5433 belongs to another PostgreSQL cluster; no changes made.');
    const exists = await connection.query('SELECT 1 FROM pg_database WHERE datname = $1', ['cbredb']);
    if (!exists.rowCount) await connection.query('CREATE DATABASE cbredb');
    console.log('cbredb is ready at 127.0.0.1:5433. Data is stored in .local-postgres.');
  } finally { await connection.end(); }
} else { throw new Error('Usage: npm run db:local -- [start|stop]'); }
