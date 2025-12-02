(function () {
  let calLoaded = false;

  function loadCalScript() {
    if (calLoaded) return;
    calLoaded = true;

    (function (C, A, L) {
      let p = function (a, ar) {
        a.q.push(ar);
      };
      let d = C.document;
      C.Cal =
        C.Cal ||
        function () {
          let cal = C.Cal;
          let ar = arguments;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            d.head.appendChild(d.createElement("script")).src = A;
            cal.loaded = true;
          }
          if (ar[0] === L) {
            const api = function () {
              p(api, arguments);
            };
            const namespace = ar[1];
            api.q = api.q || [];
            if (typeof namespace === "string") {
              cal.ns[namespace] = cal.ns[namespace] || api;
              p(cal.ns[namespace], ar);
              p(cal, ["initNamespace", namespace]);
            } else p(cal, ar);
            return;
          }
          p(cal, ar);
        };
    })(window, "https://app.cal.com/embed/embed.js", "init");

    Cal("init", "15min", { origin: "https://cal.com" });
    Cal.ns["15min"]("ui", {
      theme: "dark",
      cssVarsPerTheme: {
        light: { "cal-brand": "#000000" },
        dark: { "cal-brand": "#000000" },
      },
      hideEventTypeDetails: false,
      layout: "month_view",
    });
  }

  function initCalLazy() {
    const calLinks = document.querySelectorAll("[data-cal-link]");

    if (calLinks.length === 0) return;

    const loadOnInteraction = () => {
      loadCalScript();
      calLinks.forEach((link) => {
        link.removeEventListener("mouseenter", loadOnInteraction);
        link.removeEventListener("touchstart", loadOnInteraction);
        link.removeEventListener("focus", loadOnInteraction);
      });
    };

    calLinks.forEach((link) => {
      link.addEventListener("mouseenter", loadOnInteraction, {
        once: true,
        passive: true,
      });
      link.addEventListener("touchstart", loadOnInteraction, {
        once: true,
        passive: true,
      });
      link.addEventListener("focus", loadOnInteraction, { once: true });
    });

    const footer = document.querySelector(".footer");
    if (footer && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              loadCalScript();
              observer.disconnect();
            }
          });
        },
        { rootMargin: "50px" },
      );

      observer.observe(footer);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCalLazy);
  } else {
    initCalLazy();
  }
})();
