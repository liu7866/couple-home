declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OWNER_LOGIN_EMAIL?: string;
    PAGES_ORIGIN?: string;
    ALBUM_AI_BASE_URL?: string;
    ALBUM_AI_API_KEY?: string;
    ALBUM_AI_VISION_MODEL?: string;
    ALBUM_AI_EMBEDDING_MODEL?: string;
  }
}
