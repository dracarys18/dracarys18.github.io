# View counter

Cloudflare Worker + a SQLite-backed Durable Object that counts article pageviews
and serves them back to the site. No analytics API key is involved and nothing is
exposed to visitors beyond a number.

## Routes

| Request | Effect |
| --- | --- |
| `POST /views/:slug` | Increment once per IP per 30 minutes, return `{ slug, views }` |
| `GET /views/:slug` | Return `{ slug, views }` without incrementing |
| `GET /views?slugs=a,b,c` | Return `{ views: { a: 1, b: 0 } }` for up to 50 slugs |

Only `karthihegde.dev` and `www.karthihegde.dev` origins are accepted; requests
carrying another `Origin` get `403`.

## Why a Durable Object

The first version used Workers KV, where every counted view cost two writes
(the count plus a per-IP throttle key) against a **1,000 write/day** free tier —
roughly 500 views/day before the counter started failing.

Now a single `ViewCounter` Durable Object holds every count in memory, writes the
new number straight through to its SQLite table (one row write per counted view),
and serves reads from memory. Free-plan budget:

| Resource | Free plan | What it buys here |
| --- | --- | --- |
| Worker requests | 100,000/day | ~100k pageviews/day |
| Durable Object requests | 100,000/day | one per pageview |
| SQLite rows written | 100,000/day | one per counted view |

That is ~200× the old ceiling, still $0. Batching the writes behind a timer was
tried and rejected: a Durable Object that hibernates before its alarm fires loses
the in-memory delta, which silently dropped counts.

## Setup

```sh
npx wrangler deploy
```

`wrangler.toml` carries the routes, the `COUNTER` binding and the `v1` migration
that creates the SQLite-backed class. `VIEWS` (KV) is bound only so the Durable
Object can import the numbers the KV-era counter recorded — it runs once, when
the `counts` table is empty. After that the KV namespace can be deleted and the
binding removed.

## Verify

```sh
curl -X POST https://www.karthihegde.dev/views/sieve    # {"slug":"sieve","views":41}
curl "https://www.karthihegde.dev/views?slugs=sieve,hyperloglog"
npm test                                                # boots wrangler dev, asserts the API
```

## Notes

- Counts are pageviews, not unique readers, and one IP counts once per article
  per 30 minutes so refreshing does not inflate them. The throttle lives in
  memory; an eviction can let the same IP count twice, which is acceptable noise.
- The in-memory read cache is rebuilt from SQLite on every cold start, so counts
  survive restarts, redeploys and hibernation.
- The site hides the count entirely when `/views` does not answer, so pages work
  before the Worker is deployed and if it ever goes down.
