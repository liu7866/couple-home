import {randomBytes} from 'node:crypto';

const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function createRecoveryCode(){
  return Array.from(randomBytes(12),byte=>alphabet[byte&31]).join('');
}
export function normalizeRecoveryCode(value){
  if(typeof value!=='string'||value.length>128)return null;
  const code=value.replace(/[\s-]/g,'');
  if(/^[a-f0-9]{64}$/i.test(code))return code.toLowerCase();
  const short=code.toUpperCase();
  return /^[2-9A-HJ-NP-Z]{12}$/.test(short)?short:null;
}
