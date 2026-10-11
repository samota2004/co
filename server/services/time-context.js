export const securityTimezone=()=>process.env.SECURITY_TIMEZONE||'UTC';
export const localHour=date=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:securityTimezone(),hour:'2-digit',hourCycle:'h23'}).format(date));
