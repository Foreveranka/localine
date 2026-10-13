const supported=new Set(['en','tr','fr','es','de']);
const spanish=new Set(['ES','AR','BO','CL','CO','CR','CU','DO','EC','GT','HN','MX','NI','PA','PE','PR','PY','SV','UY','VE','GQ']);
const french=new Set(['FR','MC','BE','LU','SN','CI','BF','BJ','TG','GA','CG','CD','NE','ML','GN']);
export function chooseLocale(country,cookie=''){
 const saved=cookie.match(/(?:^|;\s*)localine_lang=(en|tr|fr|es|de)(?:;|$)/)?.[1];
 if(supported.has(saved))return saved;
 const code=(country||'').toUpperCase();
 if(code==='TR')return 'tr';
 if(['DE','AT','LI','CH'].includes(code))return 'de';
 if(french.has(code))return 'fr';
 if(spanish.has(code))return 'es';
 return 'en';
}
