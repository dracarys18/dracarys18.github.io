#!/usr/bin/env node
/**
 * Exercises the view counter through `wrangler dev` (Miniflare), so the
 * Durable Object, its SQLite storage and the throttling are all real.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A throwaway state directory keeps each run independent of the last one.
const persistTo = await mkdtemp(path.join(os.tmpdir(), "views-test-"));

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

const stop = () => {
    try {
        process.kill(-dev.pid, "SIGTERM");
    } catch {
        dev.kill("SIGTERM");
    }
};

const get = (path, options) =>
    fetch(`${BASE}${path}`, options).then(async (response) => ({
        status: response.status,
        body: await response.json(),
    }));

try {
    for (let attempt = 0; ; attempt += 1) {
        try {
            await fetch(`${BASE}/views/warmup`);
            break;
        } catch (error) {
            if (attempt > 120) throw error;
            await sleep(500);
        }
    }

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

    result = await get("/views/fresh");
    assert.deepEqual(result.body, { slug: "fresh", views: 1 });

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

    console.log("worker: all assertions passed");
} finally {
    stop();
    await rm(persistTo, { recursive: true, force: true });
}
