import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { normalizeIdentity, normalizePhone, latinDigits } from '../src/lib/auth/identity';
import { pathRole, HOME } from '../src/lib/auth/constants';
import { signSession, verifySession } from '../src/lib/auth/jwt';
import { hashPin, verifyPin } from '../src/lib/auth/pin';
import { hashAdminPassword, isValidAdminPassword, verifyAdminPassword } from '../src/lib/auth/password';
import { createRecoveryCode, hashRecoveryCode, normalizeRecoveryEmail, recoveryCodeExpiresAt, recoveryCodeMatches } from '../src/lib/auth/admin-recovery';
import { createStudentQrToken, verifyStudentQrToken } from '../src/lib/access/qr';
process.env.AUTH_SECRET = 'test-only-'.repeat(8);
test('Moroccan phone variants resolve to the same account key', () => {
  for (const phone of ['0612345678', '+212 612-345-678', '00212612345678', '٠٦١٢٣٤٥٦٧٨']) {
    assert.equal(normalizePhone(phone), '+212612345678');
  }
  assert.equal(normalizePhone('hello 0612345678'), null);
  assert.equal(normalizeIdentity(' nour-1042 ')?.value, 'NOUR-1042');
  assert.equal(normalizeIdentity({}), null);
  assert.equal(normalizeIdentity('x'.repeat(100)), null);
});
test('PIN normalization preserves leading zeroes', () => {
  assert.equal(latinDigits('٠۰١۱'), '0011');
});
test('role route boundaries do not match unrelated prefixes', () => {
  assert.equal(pathRole('/admin/dashboard'), 'ADMIN');
  assert.equal(pathRole('/api/student/resources'), 'STUDENT');
  assert.equal(pathRole('/administrator'), null);
  assert.equal(HOME.TEACHER, '/teacher/space');
});
test('signed JWT verifies; tampered, expired, invalid role and wrong algorithm fail', async () => {
  const uid = randomUUID(), sid = randomUUID();
  const token = await signSession(uid, sid, 'STUDENT');
  assert.deepEqual(await verifySession(token), { userId: uid, sessionId: sid, role: 'STUDENT' });
  const parts = token.split('.');
  parts[1] = Buffer.from(JSON.stringify({ sub: uid, jti: sid, role: 'ADMIN' })).toString('base64url');
  assert.equal(await verifySession(parts.join('.')), null);
  const key = new TextEncoder().encode(process.env.AUTH_SECRET);
  for (const [alg, role, expires] of [['HS256', 'STUDENT', 'expired'], ['HS256', 'OWNER', 'valid'], ['HS384', 'ADMIN', 'valid']]) {
    const forged = await new SignJWT({ role }).setProtectedHeader({ alg }).setSubject(uid).setJti(sid).setIssuer('nour-centre').setAudience('nour-web').setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000) + (expires === 'expired' ? -60 : 60)).sign(key);
    assert.equal(await verifySession(forged), null);
  }
  assert.equal(await verifySession('bad-token'), null);
});
test('PIN hashes are salted and never accept plain-text storage', async () => {
  const a = await hashPin('0123'), b = await hashPin('0123');
  assert.notEqual(a, b);
  assert.equal(await verifyPin(a, '0123'), true);
  assert.equal(await verifyPin(a, '9999'), false);
  assert.equal(await verifyPin('0123', '0123'), false);
  assert.equal(await verifyPin(undefined, '0123'), false);
});
test('administrator passwords require at least 12 characters and are verified as Argon2id hashes', async () => {
  assert.equal(isValidAdminPassword('short'), false);
  assert.equal(isValidAdminPassword('a-password-longer-than-twelve'), true);
  await assert.rejects(() => hashAdminPassword('1234'), /12-128 characters/);
  const hash = await hashAdminPassword('a-password-longer-than-twelve');
  assert.notEqual(hash, 'a-password-longer-than-twelve');
  assert.equal(await verifyAdminPassword(hash, 'a-password-longer-than-twelve'), true);
  assert.equal(await verifyAdminPassword(hash, 'a-different-long-password'), false);
  assert.equal(await verifyAdminPassword(undefined, 'a-password-longer-than-twelve'), false);
  assert.equal(await verifyAdminPassword(hash, '1234'), false);
});
test('administrator recovery codes are six digits, expire, and are bound to account and purpose', () => {
  const code = createRecoveryCode();
  assert.match(code, /^\d{6}$/);
  const hash = hashRecoveryCode('admin-id', 'RESET_PASSWORD', code);
  assert.equal(recoveryCodeMatches(hash, hashRecoveryCode('admin-id', 'RESET_PASSWORD', code)), true);
  assert.equal(recoveryCodeMatches(hash, hashRecoveryCode('other-admin', 'RESET_PASSWORD', code)), false);
  assert.equal(recoveryCodeMatches(hash, hashRecoveryCode('admin-id', 'VERIFY_EMAIL', code)), false);
  assert.equal(recoveryCodeMatches(hash, 'not-a-hash'), false);
  assert.equal(normalizeRecoveryEmail('  ADMIN@Example.ma '), 'admin@example.ma');
  assert.equal(normalizeRecoveryEmail('not-an-email'), null);
  assert.equal(recoveryCodeExpiresAt(1000).getTime(), 601000);
});
test('student QR tokens are signed and reject modification, bad versions, and legacy plain Code IDs', () => {
  const token = createStudentQrToken('NOUR-1042', 7);
  assert.match(token, /^NOUR1\.NOUR-1042\.7\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(verifyStudentQrToken(token), { codeId: 'NOUR-1042', version: 7 });
  assert.equal(verifyStudentQrToken(token.replace('NOUR-1042', 'NOUR-1043')), null);
  assert.equal(verifyStudentQrToken(token.replace('.7.', '.8.')), null);
  assert.equal(verifyStudentQrToken('NOUR-1042'), null);
  assert.equal(verifyStudentQrToken('NOUR1.NOUR-1042.0.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), null);
});
