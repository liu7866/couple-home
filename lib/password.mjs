import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { HomeError } from './home-domain.mjs';
export const PASSWORD_ITERATIONS=600000;
async function derive(password,salt){return new Promise((resolve,reject)=>pbkdf2(password,Buffer.from(salt,'hex'),PASSWORD_ITERATIONS,32,'sha256',(error,key)=>error?reject(error):resolve(key)))}
export async function createPassword(password){
  if(typeof password!=='string'||password.length<12||password.length>128)throw new HomeError('密码请设置为 12 至 128 个字符，可以用一句好记的短语。');
  const salt=randomBytes(32).toString('hex');
  return{salt,passwordHash:(await derive(password,salt)).toString('hex'),version:randomBytes(32).toString('hex')};
}
export async function verifyPassword(password,record){
  if(typeof password!=='string'||password.length<1||password.length>128)return false;
  const key=await derive(password,record?.salt||'0'.repeat(64));
  const expected=Buffer.from(record?.password_hash||'0'.repeat(64),'hex');
  return expected.length===key.length&&timingSafeEqual(key,expected)&&!!record;
}
