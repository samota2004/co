import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendOtpEmail, sendPasswordResetEmail, EmailDeliveryError} from '../services/email-service.js';

test('Mailjet payloads, acceptance validation and sanitized failures', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  const keys = ['MAILJET_API_KEY','MAILJET_SECRET_KEY','MAILJET_FROM_EMAIL','MAILJET_FROM_NAME','APP_URL'];
  const previous = Object.fromEntries(keys.map(key => [key,process.env[key]]));
  t.after(() => { for(const key of keys) if(previous[key]===undefined) delete process.env[key]; else process.env[key]=previous[key]; });
  Object.assign(process.env,{MAILJET_API_KEY:'test-key',MAILJET_SECRET_KEY:'test-secret',MAILJET_FROM_EMAIL:'sender@example.com',MAILJET_FROM_NAME:'CyberOrbit Security',APP_URL:'https://cyberorbit-backend.onrender.com'});
  const calls=[];
  const accepted=to=>({Messages:[{Status:'success',To:[{Email:to,MessageUUID:'test-message'}]}]});
  globalThis.fetch.mock.mockImplementation(async(url,options)=>{
    assert.equal(url,'https://api.mailjet.com/v3.1/send');
    assert.equal(options.redirect,'error');assert.ok(options.signal);
    assert.equal(options.headers.Authorization,'Basic '+Buffer.from('test-key:test-secret').toString('base64'));
    const body=JSON.parse(options.body);calls.push(body.Messages[0]);
    return Response.json(accepted(body.Messages[0].To[0].Email));
  });
  for(const to of ['main@example.com','second-admin@example.com']) {
    assert.equal(await sendOtpEmail({to,name:'<Admin>',otp:'123456'}),true);
    const message=calls.at(-1);
    assert.equal(message.To[0].Email,to);assert.equal(message.From.Email,'sender@example.com');
    assert.ok(message.TextPart.includes('123456'));assert.ok(message.HTMLPart.includes('&lt;Admin&gt;'));
    assert.ok(message.TextPart.includes('5 minutes'));assert.ok(!message.HTMLPart.includes('<Admin>'));
  }
  await sendPasswordResetEmail({to:'second-admin@example.com',name:'Admin',resetToken:'test-reset-token'});
  assert.ok(calls.at(-1).TextPart.includes('https://cyberorbit-backend.onrender.com/reset-password?token=test-reset-token'));
  assert.ok(calls.at(-1).HTMLPart.includes('15 minutes'));
  const attempt=()=>sendOtpEmail({to:'main@example.com',otp:'123456'});
  for(const status of [400,401,403,429,500]) {
    globalThis.fetch.mock.mockImplementation(async()=>new Response('private provider details',{status}));
    await assert.rejects(attempt,error=>error instanceof EmailDeliveryError && !error.message.includes('private') && !error.cause);
  }
  for(const body of [{},{Messages:[{Status:'error',Errors:[{ErrorMessage:'private'}]}]},accepted('wrong@example.com'),{Messages:[{Status:'success',To:[{Email:'main@example.com'}]}]}]) {
    globalThis.fetch.mock.mockImplementation(async()=>Response.json(body));
    await assert.rejects(attempt,{code:'EMAIL_MESSAGE_REJECTED'});
  }
  globalThis.fetch.mock.mockImplementation(async()=>new Response('not json'));
  await assert.rejects(attempt,{code:'EMAIL_NETWORK_OR_RESPONSE'});
  globalThis.fetch.mock.mockImplementation(async()=>{throw new Error('private network details');});
  await assert.rejects(attempt,{code:'EMAIL_NETWORK_OR_RESPONSE'});
  globalThis.fetch.mock.mockImplementation(async()=>{throw new DOMException('Request timed out','TimeoutError');});
  await assert.rejects(attempt,{code:'EMAIL_NETWORK_OR_RESPONSE'});
  await assert.rejects(()=>sendOtpEmail({to:'bad\r\naddress',otp:'123456'}),{code:'EMAIL_RECIPIENT'});
  process.env.MAILJET_FROM_EMAIL='not-an-address';
  await assert.rejects(attempt,{code:'EMAIL_CONFIGURATION'});
  process.env.MAILJET_FROM_EMAIL='sender@example.com';
  delete process.env.MAILJET_SECRET_KEY;
  await assert.rejects(attempt,{code:'EMAIL_CONFIGURATION'});
});
