(() => {
    const targets = [...document.querySelectorAll("[data-views]")];
    if (!targets.length) return;

    const formatter = new Intl.NumberFormat("en-US");
    const hide = (element) => {
        element.hidden = true;
    };

    const render = (element, views) => {
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

        element.replaceChildren(dot, value, label);
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
            .then(({ views }) =>
                listTargets.forEach((el) =>
                    render(el, views[el.dataset.slug] ?? 0),
                ),
            )
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
