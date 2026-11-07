(() => {
    const targets = [...document.querySelectorAll("[data-views]")];
    if (!targets.length) return;

    const formatter = new Intl.NumberFormat("en-US");
    const hide = (element) => {
        element.hidden = true;
    };

    const render = (element, views, fill) => {
        if (!views) {
            hide(element);
            return;
        }

        const dot = document.createElement("span");
        dot.className = "views-dot";
        dot.setAttribute("aria-hidden", "true");

        const value = document.createElement("span");
        value.className = "views-value";
        value.textContent = formatter.format(views);

        const label = document.createElement("span");
        label.className = "views-label";
        label.textContent = views === 1 ? "view" : "views";

        const children = [dot, value, label];

        if (fill !== undefined) {
            const track = document.createElement("span");
            track.className = "views-track";
            track.setAttribute("aria-hidden", "true");

            const bar = document.createElement("span");
            bar.className = "views-fill";
            bar.style.setProperty("--fill", `${fill}%`);

            track.append(bar);
            children.push(track);
        }

        element.replaceChildren(...children);
        element.hidden = false;
    };

    const getJson = (url, options = {}) =>
        fetch(url, { headers: { accept: "application/json" }, ...options }).then(
            (response) =>
                response.ok
                    ? response.json()
                    : Promise.reject(new Error(String(response.status))),
        );

    const listTargets = targets.filter((el) => el.dataset.views === "list");
    const counterTargets = targets.filter((el) => el.dataset.views === "count");

    const slugs = listTargets.map((el) => el.dataset.slug).filter(Boolean);

    if (slugs.length) {
        getJson(`/views?slugs=${encodeURIComponent(slugs.join(","))}`)
            .then(({ views }) => {
                const counts = listTargets.map(
                    (el) => views[el.dataset.slug] ?? 0,
                );
                const busiest = Math.max(...counts, 0);

                // Log scale keeps low-traffic posts visible next to a viral one.
                const scale = Math.log1p(busiest);

                listTargets.forEach((el, index) => {
                    const count = counts[index];
                    const fill = scale
                        ? Math.max(8, Math.round((Math.log1p(count) / scale) * 100))
                        : 0;
                    render(el, count, fill);
                });
            })
            .catch(() => listTargets.forEach(hide));
    }

    // A reader counts once per article per day, so reloading does not inflate it.
    const VIEW_TTL_MS = 24 * 60 * 60 * 1000;
    const storageKey = (slug) => `viewed:${slug}`;

    const alreadyViewed = (slug) => {
        try {
            const seen = Number(localStorage.getItem(storageKey(slug)));
            return Number.isFinite(seen) && Date.now() - seen < VIEW_TTL_MS;
        } catch {
            return false;
        }
    };

    const markViewed = (slug) => {
        try {
            localStorage.setItem(storageKey(slug), String(Date.now()));
        } catch {
            // private mode or storage disabled: the server throttle still applies
        }
    };

    counterTargets.forEach((element) => {
        const slug = element.dataset.slug;
        if (!slug) return;

        const counted = !alreadyViewed(slug);

        getJson(
            `/views/${encodeURIComponent(slug)}`,
            counted ? { method: "POST" } : {},
        )
            .then(({ views }) => {
                if (counted) markViewed(slug);
                render(element, views);
            })
            .catch(() => hide(element));
    });
})();
