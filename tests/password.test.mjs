import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { createPassword, verifyPassword, PASSWORD_ITERATIONS } from '../lib/password.mjs';
test('portable password hashing matches native PBKDF2 including Unicode and existing records',async()=>{
 const password='一起回家♡abcdefghijkl';
 const record=await createPassword(password);
 const expected=pbkdf2Sync(password,Buffer.from(record.salt,'hex'),PASSWORD_ITERATIONS,32,'sha256').toString('hex');
 assert.equal(record.passwordHash,expected);
 assert.equal(await verifyPassword(password,{salt:record.salt,password_hash:expected}),true);
 assert.equal(await verifyPassword(password+'x',{salt:record.salt,password_hash:expected}),false);
});
