import {chooseLocale} from './locale.mjs';
export const config={matcher:['/','/shoppers','/businesses','/docs','/roadmap','/locale']};
export default function middleware(request){
 const url=new URL(request.url);
 const country=request.headers.get('x-vercel-ip-country');
 if(url.pathname==='/locale')return Response.json({language:chooseLocale(country)},{headers:{'Cache-Control':'private, no-store',Vary:'x-vercel-ip-country'}});
 const lang=chooseLocale(country,request.headers.get('cookie')||'');
 url.pathname='/'+lang+(url.pathname==='/'?'/':url.pathname);
 return new Response(null,{status:307,headers:{Location:url.href,'Cache-Control':'private, no-store',Vary:'Cookie, x-vercel-ip-country'}});
}
