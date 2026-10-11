import {SecurityError} from './security-common.js';
export function sendExport(req,res,rows,columns,name){
 const format=req.query.format||'csv';
 if(!['csv','json'].includes(format))throw new SecurityError(400,'INVALID_EXPORT_FORMAT','Use csv or json.');
 res.setHeader('Content-Disposition','attachment; filename="'+name+'.'+format+'"');
 if(format==='json')return res.json(rows);
 const escape=value=>{let s=value instanceof Date?value.toISOString():value&&typeof value==='object'?JSON.stringify(value):String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 res.type('text/csv').send([columns.map(escape).join(','),...rows.map(row=>columns.map(k=>escape(row[k])).join(','))].join('\r\n'));
}
