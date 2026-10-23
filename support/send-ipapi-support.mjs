// One-time support request explicitly requested by the project owner.
// Uses the existing verified Mailjet sender; never alters application mail/auth.
import {readFile,writeFile,access} from 'node:fs/promises';
import dotenv from 'dotenv';
dotenv.config({path:new URL('../.env',import.meta.url),quiet:true});

const requestFile=new URL('./ipapi-is-render-request.json',import.meta.url);
const receiptFile=new URL('./ipapi-is-render-receipt.json',import.meta.url);
const attemptFile=new URL('./ipapi-is-render-attempt.json',import.meta.url);
const email=JSON.parse(await readFile(requestFile,'utf8'));
if(email.to!=='info@ipapi.is'||typeof email.subject!=='string'||/[\r\n]/.test(email.subject)||typeof email.text!=='string')throw new Error('Unexpected support request');
if(!process.argv.includes('--send')) {
  console.log(JSON.stringify({mode:'preview',...email},null,2));
}else if(await access(receiptFile).then(()=>true).catch(()=>false)) {
  console.log(JSON.stringify({status:'already-accepted',recipient:email.to,receipt:'support/ipapi-is-render-receipt.json'}));
}else if(await access(attemptFile).then(()=>true).catch(()=>false)) {
  console.error('A previous send was attempted. Check the attempt record and Mailjet before retrying to avoid a duplicate.');process.exitCode=1;
}else {
  const apiKey=process.env.MAILJET_API_KEY?.trim(),secret=process.env.MAILJET_SECRET_KEY?.trim(),sender=process.env.MAILJET_FROM_EMAIL?.trim();
  const senderName=process.env.MAILJET_FROM_NAME?.trim()||'CYBERORBIT';
  if(!apiKey||!secret||!sender||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender)||/[\r\n]/.test(senderName))throw new Error('Configured Mailjet sender is unavailable');
  const attempt={attemptedAt:new Date().toISOString(),recipient:email.to,subject:email.subject,status:'attempted'};
  await writeFile(attemptFile,JSON.stringify(attempt,null,2)+'\n',{flag:'wx'});
  let response;
  try {
    response=await fetch('https://api.mailjet.com/v3.1/send',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:'Basic '+Buffer.from(apiKey+':'+secret).toString('base64'),'Content-Type':'application/json'},
      body:JSON.stringify({Messages:[{From:{Email:sender,Name:senderName},To:[{Email:email.to}],Subject:email.subject,TextPart:email.text}]})
    });
    const data=await response.json().catch(()=>null),message=data?.Messages?.[0],recipient=message?.To?.[0];
    if(!response.ok||data?.Messages?.length!==1||message?.Status!=='success'||message?.Errors?.length||message?.To?.length!==1||recipient?.Email!==email.to||!recipient.MessageUUID&&!recipient.MessageID) {
      const result={...attempt,status:response.ok?'message-not-accepted':'http-error',httpStatus:response.status};
      await writeFile(attemptFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=1;
    }else {
      const receipt={acceptedAt:new Date().toISOString(),recipient:email.to,subject:email.subject,status:'accepted-by-mailjet',messageUuid:recipient.MessageUUID||null,messageId:recipient.MessageID?String(recipient.MessageID):null};
      await writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
      await writeFile(attemptFile,JSON.stringify({...attempt,status:'accepted-by-mailjet'},null,2)+'\n');
      console.log(JSON.stringify({status:receipt.status,recipient:receipt.recipient,receipt:'support/ipapi-is-render-receipt.json',note:'Accepted for processing; inbox delivery and provider response are not yet confirmed.'}));
    }
  }catch {
    // A timeout/reset after submission can leave delivery uncertain. Do not
    // automatically retry or log the raw error/request credentials.
    await writeFile(attemptFile,JSON.stringify({...attempt,status:'delivery-uncertain'},null,2)+'\n');
    console.error('Support email delivery is uncertain. Check Mailjet activity before any resend.');process.exitCode=1;
  }
}
