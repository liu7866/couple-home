import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { HomeError } from './home-domain.mjs';
export const PASSWORD_ITERATIONS=600000;
// Workers native PBKDF2 rejects >100,000 iterations. Use the portable RFC 8018
// implementation to preserve 600,000 iterations and existing stored hashes.
async function derive(password,salt){return Buffer.from(await pbkdf2Async(sha256,new TextEncoder().encode(password),Buffer.from(salt,'hex'),{c:PASSWORD_ITERATIONS,dkLen:32,asyncTick:10}))}
export async function createPassword(password){
  if(typeof password!=='string'||password.length<6||password.length>128)throw new HomeError('密码请设置为 6 至 128 个字符。');
  const salt=randomBytes(32).toString('hex');
  return{salt,passwordHash:(await derive(password,salt)).toString('hex'),version:randomBytes(32).toString('hex')};
}
export async function verifyPassword(password,record){
  if(typeof password!=='string'||password.length<1||password.length>128)return false;
  const key=await derive(password,record?.salt||'0'.repeat(64));
  const expected=Buffer.from(record?.password_hash||'0'.repeat(64),'hex');
  return expected.length===key.length&&timingSafeEqual(key,expected)&&!!record;
}
