declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OWNER_LOGIN_EMAIL?: string;
    PAGES_ORIGIN?: string;
  }
}
