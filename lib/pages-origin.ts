export function matchesPagesOrigin(origin:string|null, configured:string|undefined){
  return !!origin&&!!configured&&configured.startsWith('https://')&&origin===configured;
}
export function bearerToken(value:string|null){const match=value?.match(/^Bearer ([a-f0-9]{64})$/);return match?.[1]||null}
export function corsHeaders(origin:string){return{
  'Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':'Authorization, Content-Type',
  'Access-Control-Max-Age':'600',
  'Vary':'Origin',
}}
