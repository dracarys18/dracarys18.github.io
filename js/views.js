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
        element.textContent = `${formatter.format(views)} view${views === 1 ? "" : "s"}`;
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
                    render(el, views[el.dataset.slug]),
                ),
            )
            .catch(() => listTargets.forEach(hide));
    }

    counterTargets.forEach((element) => {
        if (!element.dataset.slug) return;
        getJson(`/views/${encodeURIComponent(element.dataset.slug)}`, {
            method: "POST",
        })
            .then(({ views }) => render(element, views))
            .catch(() => hide(element));
    });
})();
