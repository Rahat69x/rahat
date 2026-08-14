/* ============================================================
   Rahat — Project Lab · shared runtime
   Theme sync with the portfolio, toast helper, small utils.
   Exposed on window.Lab so each project can build on it.
   ============================================================ */
(function () {
    "use strict";

    var root = document.documentElement;

    /* ---- Theme (shares the portfolio's localStorage "theme" key) ---- */
    function readTheme() {
        try { return localStorage.getItem("theme") || "dark"; }
        catch (e) { return "dark"; }
    }

    function applyTheme(theme) {
        root.setAttribute("data-theme", theme);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", theme === "dark" ? "#030303" : "#f6f7f9");
        document.querySelectorAll(".theme-toggle").forEach(function (b) {
            b.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
            b.setAttribute("aria-pressed", theme === "dark" ? "false" : "true");
        });
    }

    // apply before wiring so there's no flash
    applyTheme(readTheme());

    function toggleTheme() {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
        try { localStorage.setItem("theme", next); } catch (e) {}
        window.dispatchEvent(new CustomEvent("lab:theme", { detail: { theme: next } }));
    }

    // keep tabs / the portfolio in sync
    window.addEventListener("storage", function (e) {
        if (e.key === "theme" && e.newValue) applyTheme(e.newValue);
    });

    /* ---- Toast ---- */
    var host = null;
    var ICONS = {
        ok: '<path d="M20 6 9 17l-5-5"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
        warn: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
        err: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'
    };

    function toast(message, kind, ms) {
        kind = kind || "info";
        if (!host) {
            host = document.createElement("div");
            host.className = "toast-host";
            host.setAttribute("aria-live", "polite");
            document.body.appendChild(host);
        }
        var el = document.createElement("div");
        el.className = "toast " + kind;
        el.innerHTML =
            '<svg class="t-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            (ICONS[kind] || ICONS.info) + "</svg><span></span>";
        el.querySelector("span").textContent = message;
        host.appendChild(el);
        requestAnimationFrame(function () { el.classList.add("show"); });
        setTimeout(function () {
            el.classList.remove("show");
            setTimeout(function () { el.remove(); }, 400);
        }, ms || 2600);
    }

    /* ---- Copy helper (clipboard with a legacy fallback) ---- */
    function copy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
        }
        return Promise.resolve(legacyCopy(text));
    }

    function legacyCopy(text) {
        try {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            return true;
        } catch (e) { return false; }
    }

    /* ---- Reveal-on-scroll for [data-reveal] ---- */
    function initReveal() {
        var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var els = document.querySelectorAll("[data-reveal]");
        if (reduce || !("IntersectionObserver" in window)) {
            els.forEach(function (el) { el.classList.add("in"); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) {
                    en.target.classList.add("in");
                    io.unobserve(en.target);
                }
            });
        }, { threshold: .14 });
        els.forEach(function (el) { io.observe(el); });
    }

    function ready(fn) {
        if (document.readyState !== "loading") fn();
        else document.addEventListener("DOMContentLoaded", fn);
    }

    ready(function () {
        applyTheme(readTheme());
        document.querySelectorAll(".theme-toggle").forEach(function (btn) {
            btn.addEventListener("click", toggleTheme);
        });
        var yr = document.getElementById("year");
        if (yr) yr.textContent = new Date().getFullYear();
        initReveal();
    });

    window.Lab = {
        toast: toast,
        copy: copy,
        applyTheme: applyTheme,
        toggleTheme: toggleTheme,
        reduceMotion: function () {
            return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        },
        clamp: function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
        fmt: function (n) { return n.toLocaleString(); }
    };
})();
