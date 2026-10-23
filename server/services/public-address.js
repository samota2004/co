import {BlockList,isIP} from 'node:net';
const excluded=new BlockList(),globalV6=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])excluded.addSubnet(ip,bits,'ipv4');
for(const [ip,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]])excluded.addSubnet(ip,bits,'ipv6');
globalV6.addSubnet('2000::',3,'ipv6');
export function publicAddress(value) {
  if(typeof value!=='string'||value.includes('%')||!isIP(value))return null;
  let ip=value;
  if(isIP(ip)===6) {
    ip=new URL(`http://[${ip}]/`).hostname.slice(1,-1);
    const mapped=/^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(ip);
    if(mapped){const n=parseInt(mapped[1],16)*65536+parseInt(mapped[2],16);ip=[n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.');}
  }
  const family=isIP(ip)===4?'ipv4':'ipv6';
  return excluded.check(ip,family)||(family==='ipv6'&&!globalV6.check(ip,family))?null:ip;
}
