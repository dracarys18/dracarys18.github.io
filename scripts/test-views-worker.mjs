#!/usr/bin/env node
/**
 * Exercises the view counter through `wrangler dev` (Miniflare), so the
 * Durable Object, its SQLite storage and the throttling are all real.
 *
 * The second phase restarts the runtime against the same state directory,
 * which is what happens when the object hibernates between visits.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const persistTo = await mkdtemp(path.join(os.tmpdir(), "views-test-"));

const get = (path, options) =>
    fetch(`${BASE}${path}`, options).then(async (response) => ({
        status: response.status,
        body: await response.json(),
    }));

const start = async () => {
    const dev = spawn(
        "npx",
        [
            "--yes",
            "wrangler@latest",
            "dev",
            "--port",
            String(PORT),
            "--ip",
            "127.0.0.1",
            "--persist-to",
            persistTo,
        ],
        { stdio: "ignore", detached: true },
    );

    for (let attempt = 0; ; attempt += 1) {
        try {
            await fetch(`${BASE}/views/warmup`);
            break;
        } catch (error) {
            if (attempt > 120) throw error;
            await sleep(500);
        }
    }

    return () => {
        try {
            process.kill(-dev.pid, "SIGTERM");
        } catch {
            dev.kill("SIGTERM");
        }
    };
};

try {
    let stop = await start();

    try {
        let result = await get("/views/fresh");
        assert.equal(result.status, 200);
        assert.deepEqual(result.body, { slug: "fresh", views: 0 });

        result = await get("/views/fresh", { method: "POST" });
        assert.deepEqual(result.body, { slug: "fresh", views: 1 });

        // same IP inside the window is not counted twice
        result = await get("/views/fresh", { method: "POST" });
        assert.deepEqual(result.body, { slug: "fresh", views: 1 });

        // a different slug from the same IP still counts
        result = await get("/views/another", { method: "POST" });
        assert.deepEqual(result.body, { slug: "another", views: 1 });

        result = await get("/views?slugs=fresh,another,missing");
        assert.deepEqual(result.body, {
            views: { fresh: 1, another: 1, missing: 0 },
        });

        // rejections
        result = await get("/views/fresh", {
            method: "POST",
            headers: { origin: "https://evil.example" },
        });
        assert.equal(result.status, 403);

        result = await get("/views/Bad%20Slug", { method: "POST" });
        assert.equal(result.status, 400);

        result = await get("/views", { method: "POST" });
        assert.equal(result.status, 405);

        result = await get("/views/fresh", { method: "DELETE" });
        assert.equal(result.status, 405);

        result = await get("/nope");
        assert.equal(result.status, 404);
    } finally {
        stop();
    }

    await sleep(1000);
    stop = await start();

    try {
        // after a full restart the count and the 30 minute window both survive
        let result = await get("/views/fresh", { method: "POST" });
        assert.deepEqual(result.body, { slug: "fresh", views: 1 });

        result = await get("/views/fresh");
        assert.deepEqual(result.body, { slug: "fresh", views: 1 });
    } finally {
        stop();
    }

    console.log("worker: all assertions passed");
} finally {
    await rm(persistTo, { recursive: true, force: true });
}
