/**
 * Pageview counter for karthihegde.dev.
 *
 * Counts live in one SQLite-backed Durable Object: the number is written straight
 * through on each counted view (one row write), and reads are served from memory.
 * That keeps us inside the free plan's 100k row writes and 100k requests per day
 * instead of KV's 1,000 writes per day.
 *
 * POST /views/:slug  -> increment (throttled per IP) and return the count
 * GET  /views/:slug  -> read the count
 * GET  /views?slugs=a,b,c -> read several counts at once
 */

const ALLOWED_ORIGINS = ["https://karthihegde.dev", "https://www.karthihegde.dev"];
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_BATCH = 50;
const VIEW_WINDOW_MS = 30 * 60 * 1000;

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
    });

const normalizePath = (pathname) => pathname.replace(/\/+$/, "") || "/";

export class ViewCounter {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.counts = new Map();

        this.state.blockConcurrencyWhile(async () => {
            const sql = this.state.storage.sql;
            sql.exec(
                "CREATE TABLE IF NOT EXISTS counts (slug TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0)",
            );
            sql.exec(
                "CREATE TABLE IF NOT EXISTS seen (slug TEXT NOT NULL, ip TEXT NOT NULL, until INTEGER NOT NULL, PRIMARY KEY (slug, ip))",
            );

            for (const row of sql.exec("SELECT slug, views FROM counts").toArray()) {
                this.counts.set(row.slug, row.views);
            }

            if (this.counts.size === 0) await this.seedFromKv();
        });
    }

    // One-time import of the numbers the KV-based counter recorded.
    async seedFromKv() {
        if (!this.env.VIEWS) return;

        const { keys } = await this.env.VIEWS.list({ limit: 100 });

        for (const { name } of keys) {
            if (!SLUG.test(name)) continue;
            const views = Number(await this.env.VIEWS.get(name));
            if (!Number.isFinite(views) || views <= 0) continue;
            this.counts.set(name, views);
            this.write(name, views);
        }
    }

    write(slug, views) {
        this.state.storage.sql.exec(
            "INSERT INTO counts (slug, views) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET views = excluded.views",
            slug,
            views,
        );
    }

    // The window lives in SQLite, not memory: the object hibernates between
    // visits on a quiet blog, and an in-memory map would forget it.
    throttled(slug, ip) {
        const sql = this.state.storage.sql;
        const now = Date.now();
        const row = sql
            .exec("SELECT until FROM seen WHERE slug = ? AND ip = ?", slug, ip)
            .toArray()[0];

        if (row && row.until > now) return true;

        sql.exec(
            "INSERT INTO seen (slug, ip, until) VALUES (?, ?, ?) ON CONFLICT(slug, ip) DO UPDATE SET until = excluded.until",
            slug,
            ip,
            now + VIEW_WINDOW_MS,
        );

        this.pruneSeen(now);

        return false;
    }

    pruneSeen(now) {
        this.increments = (this.increments ?? 0) + 1;
        if (this.increments % 500 !== 0) return;

        this.state.storage.sql.exec(
            "DELETE FROM seen WHERE rowid IN (SELECT rowid FROM seen WHERE until < ? LIMIT 200)",
            now,
        );
    }

    async fetch(request) {
        const url = new URL(request.url);
        const path = normalizePath(url.pathname);

        if (path === "/views") {
            const slugs = [
                ...new Set((url.searchParams.get("slugs") ?? "").split(",")),
            ]
                .filter((slug) => SLUG.test(slug))
                .slice(0, MAX_BATCH);

            return json({
                views: Object.fromEntries(
                    slugs.map((slug) => [slug, this.counts.get(slug) ?? 0]),
                ),
            });
        }

        const slug = path.slice("/views/".length);

        if (request.method === "GET") {
            return json({ slug, views: this.counts.get(slug) ?? 0 });
        }

        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

        if (!this.throttled(slug, ip)) {
            const views = (this.counts.get(slug) ?? 0) + 1;
            this.counts.set(slug, views);
            this.write(slug, views);
        }

        return json({ slug, views: this.counts.get(slug) ?? 0 });
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = normalizePath(url.pathname);
        const origin = request.headers.get("origin");

        if (origin && !ALLOWED_ORIGINS.includes(origin)) {
            return json({ error: "forbidden" }, 403);
        }

        if (path === "/views") {
            if (request.method !== "GET") {
                return json({ error: "method not allowed" }, 405);
            }
            return env.COUNTER.get(env.COUNTER.idFromName("global")).fetch(request);
        }

        const match = path.match(/^\/views\/([^/]+)$/);
        if (!match) return json({ error: "not found" }, 404);
        if (!SLUG.test(match[1])) return json({ error: "bad slug" }, 400);
        if (request.method !== "GET" && request.method !== "POST") {
            return json({ error: "method not allowed" }, 405);
        }

        return env.COUNTER.get(env.COUNTER.idFromName("global")).fetch(request);
    },
};
