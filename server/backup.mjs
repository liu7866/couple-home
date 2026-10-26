import { DatabaseSync, backup } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { photoPath } from './storage.mjs';

const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
export async function createSnapshot(dataDir, backupDir) {
  dataDir = resolve(dataDir); backupDir = resolve(backupDir);
  if (backupDir === dataDir || backupDir.startsWith(dataDir + sep)) throw new Error('备份目录必须放在数据目录之外。');
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const output = resolve(backupDir, new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID().slice(0, 8));
  const file = resolve(dataDir, 'home.sqlite');
  // Holding a write reservation prevents metadata deletes/updates while the
  // referenced photo files are copied; uploads not committed yet are excluded.
  const guard = new DatabaseSync(file, { readOnly: false });
  let source, locked = false;
  try {
    guard.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE'); locked = true;
    const photos = guard.prepare('SELECT object_key FROM photos ORDER BY object_key').all();
    await mkdir(output, { recursive: false, mode: 0o700 });
    source = new DatabaseSync(file, { readOnly: true });
    await backup(source, resolve(output, 'home.sqlite'));
    const files = { 'home.sqlite': await digest(resolve(output, 'home.sqlite')) };
    for (const photo of photos) {
      const destination = photoPath(output, photo.object_key);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await copyFile(photoPath(dataDir, photo.object_key), destination);
      files[photo.object_key] = await digest(destination);
    }
    await writeFile(resolve(output, 'complete.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files }, null, 2), { flag: 'wx', mode: 0o600 });
    return output;
  } finally { source?.close(); if (locked) guard.exec('ROLLBACK'); guard.close(); }
}

export async function verifySnapshot(directory) {
  directory = resolve(directory);
  const manifest = JSON.parse(await readFile(resolve(directory, 'complete.json'), 'utf8'));
  if (manifest.version !== 1 || !manifest.files || !manifest.files['home.sqlite']) throw new Error('备份清单不完整。');
  for (const [key, expected] of Object.entries(manifest.files)) {
    const file = key === 'home.sqlite' ? resolve(directory, key) : photoPath(directory, key);
    if (!/^[a-f0-9]{64}$/.test(expected) || await digest(file) !== expected) throw new Error('备份文件校验失败。');
  }
  const db = new DatabaseSync(resolve(directory, 'home.sqlite'), { readOnly: true });
  try {
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('备份数据库完整性检查失败。');
    const photos = db.prepare('SELECT object_key FROM photos').all();
    if (Object.keys(manifest.files).length !== photos.length + 1 || photos.some(photo => !manifest.files[photo.object_key])) throw new Error('备份照片清单不完整。');
    return { photos: photos.length, files: Object.keys(manifest.files).length };
  } finally { db.close(); }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.umask(0o077);
  const root = fileURLToPath(new URL('./', import.meta.url));
  try {
    if (process.argv[2] === '--verify' && process.argv[3]) {
      const result = await verifySnapshot(process.argv[3]); console.log(`备份校验通过：${result.photos} 张照片，${result.files} 个文件。`);
    } else {
      if (process.argv.length > 2) throw new Error('用法：node backup.mjs，或 node backup.mjs --verify 备份目录');
      const output = await createSnapshot(resolve(process.env.DATA_DIR || resolve(root, 'data')), resolve(process.env.BACKUP_DIR || resolve(root, 'backups')));
      await verifySnapshot(output); console.log('备份完成并通过校验：' + output);
    }
  } catch (error) { console.error('备份未完成：' + error.message); process.exitCode = 1; }
}
