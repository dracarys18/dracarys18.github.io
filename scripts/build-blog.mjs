#!/usr/bin/env node
/**
 * Build script to compile Markdown blog posts to HTML with Sätteri.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { markdownToHtml } from "satteri";
import { parse as parseYaml } from "yaml";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(rootDir, "posts", "source");
const templatesDir = path.join(rootDir, "templates");

const escapeHtml = (value) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttribute = (value) => escapeHtml(value).replace(/"/g, "&quot;");

const fillTemplate = (template, values) =>
    template.replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] ?? "");

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

    return { ...metadata, name };
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
}

await main();
