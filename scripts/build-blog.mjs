#!/usr/bin/env node
/**
 * Build script to compile Markdown blog posts to HTML with Sätteri.
 */

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { markdownToHtml } from "satteri";
import { parse as parseYaml } from "yaml";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(rootDir, "posts", "source");
const templatesDir = path.join(rootDir, "templates");

const ASSETS = ["styles.css", "js/views.js", "js/cal-init.js"];

const ASSET = /((?:\.\.\/)*)(styles\.css|js\/[\w.-]+\.js)(?:\?v=[0-9a-f]+)?/g;

const escapeHtml = (value) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttribute = (value) => escapeHtml(value).replace(/"/g, "&quot;");

const fillTemplate = (template, values) =>
    template.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? "");

const SITE_URL = "https://karthihegde.dev";

const xml = (value) =>
    String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

// Feed readers see the HTML out of context, so relative asset URLs must be absolute
const absolutize = (html) =>
    html.replace(
        /(src|href)="(?!https?:|mailto:|#|\/\/)([^"]+)"/g,
        (_match, attr, url) => `${attr}="${SITE_URL}/posts/${url}"`,
    );

const cdata = (html) => `<![CDATA[${html.split("]]>").join("]]]]><![CDATA[>")}]]>`;

const rfc822 = (isoDate) => new Date(`${isoDate}T00:00:00Z`).toUTCString();

async function renderMarkdown(file) {
    const source = await readFile(file, "utf8");

    const { html, frontmatter } = markdownToHtml(source, {
        features: { gfm: true, frontmatter: true },
        fileURL: pathToFileURL(file),
    });

    const metadata = frontmatter?.value ? parseYaml(frontmatter.value) : {};

    return { html, metadata };
}

async function buildPost(file, template) {
    const name = path.basename(file, ".md");
    const { html, metadata } = await renderMarkdown(file);

    if (metadata.draft) {
        console.log(`Skipping ${path.basename(file)}: draft`);
        return null;
    }

    const output = fillTemplate(template, {
        TITLE: escapeHtml(metadata.title ?? "Untitled"),
        SLUG: escapeAttribute(metadata.slug ?? name),
        DATE_DISPLAY: escapeHtml(metadata.date_display ?? ""),
        DATE_ISO: escapeAttribute(metadata.date_iso ?? ""),
        DESCRIPTION: escapeAttribute(metadata.description ?? ""),
        KEYWORDS: escapeAttribute(metadata.keywords ?? ""),
        CONTENT: html,
    });

    const outputFile = path.join(rootDir, "posts", `${name}.html`);
    await writeFile(outputFile, output);

    console.log(`Building ${path.basename(file)}...`);
    console.log(`  → ${outputFile}`);

    return { ...metadata, name, html };
}

const feedCategories = (keywords) =>
    String(keywords ?? "")
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .map((keyword) => `            <category>${xml(keyword)}</category>`);

function feedItem(post) {
    const link = `${SITE_URL}/posts/${post.name}`;

    return [
        "        <item>",
        `            <title>${xml(post.title ?? post.name)}</title>`,
        `            <link>${xml(link)}</link>`,
        `            <guid isPermaLink="true">${xml(link)}</guid>`,
        `            <pubDate>${rfc822(post.date_iso)}</pubDate>`,
        ...feedCategories(post.keywords),
        `            <description>${xml(post.description ?? "")}</description>`,
        `            <content:encoded>${cdata(absolutize(post.html))}</content:encoded>`,
        "        </item>",
    ].join("\n");
}

async function buildFeed(posts) {
    const published = posts
        .filter((post) => post.date_iso)
        .sort(
            (a, b) =>
                b.date_iso.localeCompare(a.date_iso) ||
                (b.title ?? "").localeCompare(a.title ?? ""),
        );

    const newest = published[0]?.date_iso;

    const feed = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
        "    <channel>",
        "        <title>Karthikey Hegde</title>",
        `        <link>${SITE_URL}/posts</link>`,
        "        <description>Technical blog posts on distributed systems, databases, and systems programming.</description>",
        "        <language>en</language>",
        `        <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>`,
        ...(newest ? [`        <lastBuildDate>${rfc822(newest)}</lastBuildDate>`] : []),
        ...published.map(feedItem),
        "    </channel>",
        "</rss>",
        "",
    ].join("\n");

    const outputFile = path.join(rootDir, "feed.xml");
    await writeFile(outputFile, feed);

    console.log(`Building RSS feed (${published.length} posts)...`);
    console.log(`  → ${outputFile}`);
}

function renderPostLink(href, title) {
    const indent = " ".repeat(20);
    const oneLine = `${indent}<span class="post-title"><a href="${href}">${title}</a></span>`;

    if (oneLine.length <= 80) {
        return oneLine;
    }

    const inner = indent + " ".repeat(4);
    return [
        `${indent}<span class="post-title"`,
        `${inner}><a href="${href}"`,
        `${inner}    >${title}</a`,
        `${inner}></span`,
        `${indent}>`,
    ].join("\n");
}

function renderPostList(posts) {
    return posts
        .map((post) => {
            const date = escapeHtml(post.date_display ?? post.date_iso);
            const title = escapeHtml(post.title ?? post.name);

            return [
                `${" ".repeat(16)}<li>`,
                `${" ".repeat(20)}<span class="date">[ ${date} ] </span>`,
                renderPostLink(`posts/${post.name}`, title),
                `${" ".repeat(20)}<span class="views" data-views="list" data-slug="${escapeAttribute(post.name)}" hidden></span>`,
                `${" ".repeat(16)}</li>`,
            ].join("\n");
        })
        .join("\n");
}

async function buildIndex(posts, template) {
    // date_iso is YYYY-MM-DD, so a string sort is chronological
    const published = posts
        .filter((post) => {
            if (post.date_iso) return true;
            console.error(`Skipping ${post.name} in the index: no date_iso`);
            return false;
        })
        .sort(
            (a, b) =>
                b.date_iso.localeCompare(a.date_iso) ||
                (b.title ?? "").localeCompare(a.title ?? ""),
        );

    const output = fillTemplate(template, {
        POST_LIST: renderPostList(published),
    });

    const outputFile = path.join(rootDir, "posts.html");
    await writeFile(outputFile, output);

    console.log(`Building posts index (${published.length} posts)...`);
    console.log(`  → ${outputFile}`);
}

async function stampAssets() {
    const hashes = {};

    for (const asset of ASSETS) {
        hashes[asset] = createHash("sha256")
            .update(await readFile(path.join(rootDir, asset)))
            .digest("hex")
            .slice(0, 10);
    }

    const postsDir = path.join(rootDir, "posts");
    const pages = [
        path.join(rootDir, "index.html"),
        path.join(rootDir, "contact.html"),
        path.join(rootDir, "posts.html"),
        ...(await readdir(postsDir))
            .filter((file) => file.endsWith(".html"))
            .map((file) => path.join(postsDir, file)),
    ];

    for (const page of pages) {
        const source = await readFile(page, "utf8");
        const stamped = source.replace(
            ASSET,
            (_match, prefix, asset) => `${prefix}${asset}?v=${hashes[asset]}`,
        );
        if (stamped !== source) await writeFile(page, stamped);
    }

    for (const [asset, hash] of Object.entries(hashes)) {
        console.log(`Stamped ${asset} as ?v=${hash}`);
    }
}

async function main() {
    const postTemplate = await readFile(path.join(templatesDir, "blog-post.html"), "utf8");
    const indexTemplate = await readFile(path.join(templatesDir, "posts-index.html"), "utf8");

    const sources = (await readdir(sourceDir))
        .filter((file) => file.endsWith(".md"))
        .sort();

    const posts = [];

    for (const file of sources) {
        const post = await buildPost(path.join(sourceDir, file), postTemplate);
        if (post) posts.push(post);
    }

    await buildIndex(posts, indexTemplate);
    await buildFeed(posts);
    await stampAssets();
}

await main();
