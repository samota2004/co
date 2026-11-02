import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usbPolicyDisplayState,usbPolicyStatusDetail} from '../../client/src/services/usb-policy-status.js';

test('USB policy labels distinguish pending, unverified, failed and unsupported states',()=>{
  assert.equal(usbPolicyDisplayState(null),'UNVERIFIED');
  assert.equal(usbPolicyDisplayState({status:'PENDING'},{storage:'BLOCK',portable:'ALLOW',optical:'ALLOW'}),'BLOCK_PENDING');
  assert.equal(usbPolicyDisplayState({status:'PENDING_OFFLINE'},{storage:'ALLOW',portable:'ALLOW',optical:'ALLOW'}),'ALLOW_PENDING');
  assert.equal(usbPolicyDisplayState({status:'PENDING',expiresAt:'2026-01-01T00:00:00.000Z'},{storage:'BLOCK'},Date.parse('2026-01-01T00:00:01.000Z')),'POLICY_FAILED');
  assert.match(usbPolicyStatusDetail({status:'PENDING',expiresAt:'2026-01-01T00:00:00.000Z'},Date.parse('2026-01-01T00:00:01.000Z')),/expired/i);
  assert.equal(usbPolicyDisplayState({status:'UNVERIFIED',resultCode:'POLICY_APPLIED_UNVERIFIED'}),'UNVERIFIED');
  assert.equal(usbPolicyDisplayState({status:'FAILED',resultCode:'POLICY_FAILED'}),'POLICY_FAILED');
  assert.equal(usbPolicyDisplayState({status:'UNSUPPORTED',resultCode:'POLICY_UNSUPPORTED'}),'UNSUPPORTED');
  assert.equal(usbPolicyDisplayState({status:'EXPIRED'}),'POLICY_FAILED');
  assert.equal(usbPolicyDisplayState({status:'ACKNOWLEDGED',resultCode:'POLICY_APPLIED_UNVERIFIED'}),'UNVERIFIED');
});

test('USB policy never calls registry application a verified device result',()=>{
  assert.equal(usbPolicyDisplayState({status:'VERIFIED',resultCode:'POLICY_APPLIED_UNVERIFIED'}),'UNVERIFIED');
  assert.equal(usbPolicyDisplayState({status:'VERIFIED',resultCode:'DEVICE_ACCESS_BLOCKED_VERIFIED'}),'BLOCKED');
  assert.equal(usbPolicyDisplayState({status:'VERIFIED',resultCode:'DEVICE_ACCESS_ALLOWED_VERIFIED'}),'ALLOW');
  assert.match(usbPolicyStatusDetail({status:'UNVERIFIED',resultCode:'POLICY_APPLIED_UNVERIFIED'}),/remains UNVERIFIED/i);
});
