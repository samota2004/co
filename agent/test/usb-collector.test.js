import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isNewUsbConnection} from '../src/collectors/index.js';

test('USB inventory baseline is not reported as a fresh insertion; later additions are',()=>{
  assert.equal(isNewUsbConnection(null,'usb-1'),false,'startup inventory cannot prove insertion time');
  const baseline=new Map([['usb-1',{}]]);
  assert.equal(isNewUsbConnection(baseline,'usb-1'),false,'already-present device is not a new connection');
  assert.equal(isNewUsbConnection(baseline,'usb-2'),true,'newly observed device produces a connection event');
});
