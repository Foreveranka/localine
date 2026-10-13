import {chooseLocale} from './locale.mjs';
export const config={matcher:['/','/shoppers','/businesses','/docs','/roadmap']};
export default function middleware(request){
 const url=new URL(request.url);
 const lang=chooseLocale(request.headers.get('x-vercel-ip-country'),request.headers.get('cookie')||'');
 url.pathname='/'+lang+(url.pathname==='/'?'/':url.pathname);
 return new Response(null,{status:307,headers:{Location:url.href,'Cache-Control':'private, no-store',Vary:'Cookie, x-vercel-ip-country'}});
}
