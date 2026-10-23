import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { matchesPagesOrigin, corsHeaders } from '../lib/pages-origin';

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const api=new URL(request.url).pathname.startsWith('/api/');
    const origin=request.headers.get('origin');
    const pages=api&&matchesPagesOrigin(origin,env.PAGES_ORIGIN);
    if(api&&request.method==='OPTIONS')return new Response(null,{status:pages?204:403,headers:pages?corsHeaders(origin!):{}});
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response=await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    if(!pages)return response;
    const h=new Headers(response.headers),vary=h.get('Vary');
    for(const [key,value]of Object.entries(corsHeaders(origin!)))if(key!=='Vary')h.set(key,value);
    h.set('Vary',vary?`${vary}, Origin`:'Origin');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
  },
};

export default worker;
