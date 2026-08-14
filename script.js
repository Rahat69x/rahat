// =========================
// Theme toggle (desktop + mobile buttons)
// =========================

const themeColorMeta = document.querySelector('meta[name="theme-color"]');

function applyThemeState() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";

    themeColorMeta.setAttribute("content", dark ? "#030303" : "#fafafa");

    document.querySelectorAll(".theme-toggle").forEach(b => {
        b.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
        b.setAttribute("aria-pressed", dark ? "false" : "true");
    });
}

applyThemeState();

document.querySelectorAll(".theme-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
        const root = document.documentElement;
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";

        root.setAttribute("data-theme", next);
        applyThemeState();

        try {
            localStorage.setItem("theme", next);
        } catch (e) { }
    });
});

// =========================
// Mobile menu
// =========================

const menuToggle = document.getElementById("menu-toggle");
const mobileMenu = document.getElementById("mobile-menu");

function closeMobileMenu() {
    if (!mobileMenu.classList.contains("open")) return;

    mobileMenu.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open menu");
}

menuToggle.addEventListener("click", () => {
    const open = mobileMenu.classList.toggle("open");

    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});

mobileMenu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMobileMenu);
});

// close on Escape and when the page scrolls away beneath it
window.addEventListener("keydown", e => {
    if (e.key === "Escape") closeMobileMenu();
});

window.addEventListener("scroll", closeMobileMenu, { passive: true });

// =========================
// Header background on scroll
// =========================

const siteHeader = document.querySelector(".site-header");

function updateHeader() {
    siteHeader.classList.toggle("scrolled", window.scrollY > 24);
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

// =========================
// Typing effect (hero)
// =========================

const typedEl = document.getElementById("typed");

const sentences = [
    "I'm a CSE student at East West University, passionate about building for the web.",
    "I create modern, responsive websites with HTML, CSS and JavaScript.",
    "And I'm diving into cybersecurity — learning how things break, to build them safer."
];

let sIndex = 0;
let cIndex = 0;
let deleting = false;

function typeLoop() {
    const current = sentences[sIndex];

    if (!deleting) {
        typedEl.textContent = current.substring(0, ++cIndex);

        if (cIndex === current.length) {
            deleting = true;
            setTimeout(typeLoop, 2200);
            return;
        }
    } else {
        typedEl.textContent = current.substring(0, --cIndex);

        if (cIndex === 0) {
            deleting = false;
            sIndex = (sIndex + 1) % sentences.length;
        }
    }

    setTimeout(typeLoop, deleting ? 18 : 45);
}

// started by the boot sequence (or its skip path) so the first sentence
// isn't half-typed behind the intro overlay
let typingStarted = false;

function startTyping() {
    if (typingStarted) return;
    typingStarted = true;

    // reduced motion: show the first sentence statically
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        typedEl.textContent = sentences[0];
        return;
    }

    typeLoop();
}

// =========================
// Background grid cells (stack section)
// =========================

const gridBg = document.getElementById("grid-bg");

for (let i = 0; i < 64; i++) {
    gridBg.appendChild(document.createElement("div"));
}

// =========================
// Scroll-driven animation:
// tool cards spread out from center + parallax blobs
// =========================

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const stackSection = document.querySelector(".stack");
const stackSticky = document.getElementById("stack-sticky");
const parallaxEls = document.querySelectorAll("[data-parallax]");

let ticking = false;

// geometry is cached once per layout change so the per-frame path is pure
// math — no getBoundingClientRect during the inertia glide
let stackTop = 0;
let stackTotal = 1;
let parallaxCache = [];

function cacheScrollFXGeometry() {
    const y = window.scrollY;

    stackTop = stackSection.getBoundingClientRect().top + y;
    stackTotal = Math.max(1, stackSection.offsetHeight - window.innerHeight);

    parallaxCache = Array.from(parallaxEls, el => {
        const parent = el.parentElement.getBoundingClientRect();
        return {
            el,
            speed: parseFloat(el.dataset.parallax) || 0,
            top: parent.top + y,
            half: parent.height / 2
        };
    });
}

function updateScrollFX() {
    ticking = false;

    const y = window.scrollY;

    // progress through the tall stack section: 0 = just pinned, 1 = fully spread
    const raw = Math.min(1, Math.max(0, (y - stackTop) / stackTotal));
    // smoothstep: gentle start and settle instead of a linear march
    const p = raw * raw * (3 - 2 * raw);

    stackSticky.style.setProperty("--p", p.toFixed(4));

    // parallax: elements drift relative to how far their section is through the viewport
    for (const item of parallaxCache) {
        const offset = (window.innerHeight - (item.top - y) - item.half) * item.speed;
        item.el.style.setProperty("--py", offset.toFixed(1) + "px");
    }
}

function onScrollFX() {
    if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateScrollFX);
    }
}

if (!reduceMotion) {
    cacheScrollFXGeometry();

    window.addEventListener("scroll", onScrollFX, { passive: true });
    window.addEventListener("resize", () => {
        cacheScrollFXGeometry();
        onScrollFX();
    }, { passive: true });

    // fonts and images shift layout after first paint — re-measure when settled
    window.addEventListener("load", () => {
        cacheScrollFXGeometry();
        updateScrollFX();
    });

    updateScrollFX();
}

// =========================
// Reveal on scroll (fade / slide-in from sides)
// =========================

const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal, .reveal-left, .reveal-right")
    .forEach(el => revealObserver.observe(el));

// =========================
// Project counter (00 → 02)
// =========================

const counterEl = document.getElementById("proj-counter");
const PROJECT_COUNT = 5;

const counterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        counterObserver.unobserve(entry.target);

        let value = 0;
        const tick = setInterval(() => {
            counterEl.textContent = String(value).padStart(2, "0");

            if (value === PROJECT_COUNT) clearInterval(tick);
            value++;
        }, 350);
    });
}, { threshold: 0.4 });

counterObserver.observe(counterEl);

// =========================
// Footer year
// =========================

document.getElementById("year").textContent = new Date().getFullYear();

// ============================================================
// AWARD-CRAFT LAYER
// ============================================================

const finePointer = window.matchMedia("(pointer: fine)").matches;
const fxOn = !reduceMotion;

// =========================
// Boot intro
// =========================

const boot = document.getElementById("boot");
const bootText = document.getElementById("boot-text");
let bootEnded = false;

function bootKeySkip(e) {
    if (e.key === "Enter" || e.key === "Escape" || e.key === " ") endBoot();
}

function endBoot() {
    if (bootEnded) return;
    bootEnded = true;

    document.documentElement.classList.remove("boot-pending");
    window.removeEventListener("keydown", bootKeySkip);

    if (boot) {
        boot.classList.add("done");
        setTimeout(() => boot.remove(), 700);
    }

    startTyping();
}

// play the intro once per session — returning visitors get straight in
let seenBoot = false;
try { seenBoot = sessionStorage.getItem("booted") === "1"; } catch (e) { }

if (fxOn && boot && !seenBoot) {
    try { sessionStorage.setItem("booted", "1"); } catch (e) { }

    boot.hidden = false;

    const lines = [
        { t: "> initializing rahat.dev", c: "" },
        { t: "> loading modules: [web] [security] [coffee]", c: "b-dim" },
        { t: "> connection secured ✔", c: "b-cyan" },
        { t: "> welcome.", c: "" }
    ];

    let li = 0;
    let ci = 0;
    let done = "";

    function typeBoot() {
        if (bootEnded) return;

        if (li >= lines.length) {
            setTimeout(endBoot, 300);
            return;
        }

        const line = lines[li];
        ci++;

        bootText.innerHTML =
            done +
            '<span class="' + line.c + '">' + line.t.slice(0, ci) + "</span>" +
            '<span class="b-cursor">█</span>';

        if (ci >= line.t.length) {
            done += '<span class="' + line.c + '">' + line.t + "</span>\n";
            li++;
            ci = 0;
            setTimeout(typeBoot, 110);
        } else {
            setTimeout(typeBoot, 10);
        }
    }

    typeBoot();
    boot.addEventListener("click", endBoot);
    window.addEventListener("keydown", bootKeySkip);
    setTimeout(endBoot, 2600);
} else {
    endBoot();
}

// =========================
// Inertia smooth scroll (wheel, fine pointers)
// =========================

if (fxOn && finePointer) {
    document.documentElement.style.scrollBehavior = "auto";

    let target = window.scrollY;
    let current = window.scrollY;
    let rafId = null;

    const maxScroll = () =>
        document.documentElement.scrollHeight - window.innerHeight;

    function stopGlide() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        target = current = window.scrollY;
    }

    function glide() {
        // an external scroll (find-in-page, focus jump…) took over — yield
        if (Math.abs(window.scrollY - current) > 3) {
            stopGlide();
            return;
        }

        target = Math.max(0, Math.min(maxScroll(), target));
        current += (target - current) * 0.1;

        if (Math.abs(target - current) < 0.5) {
            current = target;
            window.scrollTo(0, current);
            rafId = null;
            return;
        }

        window.scrollTo(0, current);
        rafId = requestAnimationFrame(glide);
    }

    function kick() {
        if (!rafId) rafId = requestAnimationFrame(glide);
    }

    window.addEventListener("wheel", e => {
        if (e.ctrlKey) return;

        e.preventDefault();

        // the boot intro owns the screen — don't scroll behind it
        if (!bootEnded) return;

        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        target = Math.max(0, Math.min(maxScroll(), target + delta));
        kick();
    }, { passive: false });

    // keyboard scrolling and scrollbar drags take priority over the glide
    window.addEventListener("keydown", e => {
        const scrollKeys = ["PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp", " "];
        if (scrollKeys.includes(e.key)) stopGlide();
    });

    window.addEventListener("mousedown", () => {
        if (rafId) stopGlide();
    });

    // re-sync when the user scrolls by other means while idle
    window.addEventListener("scroll", () => {
        if (rafId === null) {
            target = current = window.scrollY;
        }
    }, { passive: true });

    // glide to anchors too
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        if (a.classList.contains("skip-link")) return;

        a.addEventListener("click", e => {
            const el = document.querySelector(a.getAttribute("href"));
            if (!el) return;

            e.preventDefault();
            target = Math.max(0, Math.min(maxScroll(),
                el.getBoundingClientRect().top + window.scrollY - 70));
            kick();
        });
    });
}

// =========================
// Custom cursor + magnetic buttons
// =========================

if (fxOn && finePointer) {
    document.documentElement.classList.add("fx");

    const dot = document.querySelector(".cursor-dot");
    const ring = document.querySelector(".cursor-ring");
    let mx = -100, my = -100;
    let rx = -100, ry = -100;
    let seen = false;

    window.addEventListener("mousemove", e => {
        mx = e.clientX;
        my = e.clientY;

        if (!seen) {
            seen = true;
            rx = mx;
            ry = my;
            dot.style.opacity = "1";
            ring.style.opacity = "1";
        }

        dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
    }, { passive: true });

    (function ringLoop() {
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
        requestAnimationFrame(ringLoop);
    })();

    document.documentElement.addEventListener("mouseleave", () => {
        dot.style.opacity = "0";
        ring.style.opacity = "0";
        seen = false;
    });

    document.querySelectorAll("a, button, .side-card").forEach(el => {
        el.addEventListener("mouseenter", () => ring.classList.add("is-active"));
        el.addEventListener("mouseleave", () => ring.classList.remove("is-active"));
    });

    // magnetic pull toward the cursor — via CSS vars so :hover growth and
    // :active press feedback keep working on the same transform
    document.querySelectorAll(".btn-dark, .btn-outline, .btn-explore, .btn-square, .nav-cta, .ec-copy").forEach(el => {
        el.addEventListener("mousemove", e => {
            const r = el.getBoundingClientRect();
            const dx = (e.clientX - (r.left + r.width / 2)) * 0.22;
            const dy = (e.clientY - (r.top + r.height / 2)) * 0.22;

            el.style.setProperty("--mx", dx.toFixed(1) + "px");
            el.style.setProperty("--my", dy.toFixed(1) + "px");
        });

        el.addEventListener("mouseleave", () => {
            el.style.removeProperty("--mx");
            el.style.removeProperty("--my");
        });
    });
}

// =========================
// 3D tilt on showcase media
// =========================

if (fxOn && finePointer) {
    document.querySelectorAll("[data-tilt] .proj-shot, .hero-photo-wrap").forEach(el => {
        const host = el.closest("[data-tilt]") || el;

        host.addEventListener("mousemove", e => {
            const r = el.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;

            el.style.transition = "transform .1s linear";
            el.style.transform =
                "perspective(900px) rotateX(" + (-py * 7).toFixed(2) + "deg)" +
                " rotateY(" + (px * 9).toFixed(2) + "deg)";
        });

        host.addEventListener("mouseleave", () => {
            el.style.transition = "transform .6s cubic-bezier(.22,1,.36,1)";
            el.style.transform = "";
        });
    });
}

// =========================
// Ambient music — real lo-fi track, WebAudio synth as fallback
// =========================

const musicToggles = document.querySelectorAll(".music-toggle");
let musicOn = false;
let ambientEl = null;
let ambientBroken = false;
let fadeTimer = null;
let synthCtx = null;
let synthGain = null;

function buildSynth() {
    synthCtx = new (window.AudioContext || window.webkitAudioContext)();

    synthGain = synthCtx.createGain();
    synthGain.gain.value = 0;
    synthGain.connect(synthCtx.destination);

    const filter = synthCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 620;
    filter.Q.value = 0.4;
    filter.connect(synthGain);

    const lfo = synthCtx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = synthCtx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // soft A-minor pad: A2 · E3 · A3 · C4
    [110, 164.81, 220, 261.63].forEach((freq, i) => {
        const osc = synthCtx.createOscillator();
        osc.type = i < 2 ? "triangle" : "sine";
        osc.frequency.value = freq;
        osc.detune.value = (i - 1.5) * 5;

        const g = synthCtx.createGain();
        g.gain.value = i < 2 ? 0.05 : 0.03;
        osc.connect(g);
        g.connect(filter);
        osc.start();
    });
}

function startSynth() {
    if (!synthCtx) buildSynth();
    if (synthCtx.state === "suspended") synthCtx.resume();
    synthGain.gain.setTargetAtTime(0.5, synthCtx.currentTime, 0.4);
}

function stopSynth() {
    if (synthCtx) {
        synthGain.gain.setTargetAtTime(0, synthCtx.currentTime, 0.4);
    }
}

function fadeAmbient(to) {
    clearInterval(fadeTimer);
    fadeTimer = setInterval(() => {
        const diff = to - ambientEl.volume;

        if (Math.abs(diff) < 0.04) {
            ambientEl.volume = to;
            if (to === 0) ambientEl.pause();
            clearInterval(fadeTimer);
            return;
        }

        ambientEl.volume += diff * 0.15;
    }, 50);
}

function setMusic(on) {
    musicToggles.forEach(b => {
        b.classList.toggle("playing", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
    });

    if (on) {
        if (ambientBroken) {
            startSynth();
            return;
        }

        if (!ambientEl) {
            ambientEl = new Audio("assets/ambient.mp3");
            ambientEl.loop = true;
            ambientEl.volume = 0;
        }

        ambientEl.play()
            .then(() => fadeAmbient(musicOn ? 0.55 : 0))
            .catch(err => {
                // toggling off mid-load aborts play() — that's not a broken file
                if (err && err.name === "AbortError") return;

                ambientBroken = true;
                if (musicOn) startSynth();
            });
    } else {
        if (ambientEl && !ambientEl.paused) fadeAmbient(0);
        stopSynth();
    }
}

musicToggles.forEach(btn => {
    btn.addEventListener("click", () => {
        musicOn = !musicOn;
        setMusic(musicOn);
    });
});

// =========================
// Particle signature wordmark
// =========================

const sigCanvas = document.getElementById("sig-canvas");

if (sigCanvas) {
    const sigCtx = sigCanvas.getContext("2d");
    let groups = [];
    let sigColors = [];
    let sigW = 0;
    let sigH = 0;
    let mouseClientX = -1e4;
    let mouseClientY = -1e4;
    let running = false;
    let sigRaf = null;

    function buildSignature() {
        const rect = sigCanvas.parentElement.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        sigW = Math.max(1, Math.floor(rect.width));
        sigH = Math.max(1, Math.floor(rect.height));
        sigCanvas.width = sigW * dpr;
        sigCanvas.height = sigH * dpr;
        sigCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // rasterize the wordmark, then sample it into particle targets
        const off = document.createElement("canvas");
        off.width = sigW;
        off.height = sigH;
        const octx = off.getContext("2d");
        octx.fillStyle = "#fff";
        octx.font = "900 " + Math.min(sigW * 0.24, sigH * 0.85) + "px Geist, sans-serif";
        octx.textAlign = "center";
        octx.textBaseline = "middle";
        octx.fillText("RAHAT", sigW / 2, sigH / 2);
        const data = octx.getImageData(0, 0, sigW, sigH).data;

        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        sigColors = dark
            ? ["rgba(245,245,245,.95)", "rgba(34,211,238,.9)", "rgba(192,132,252,.85)"]
            : ["rgba(17,24,39,.92)", "rgba(8,145,178,.9)", "rgba(147,51,234,.8)"];

        const step = sigW < 700 ? 6 : 5;
        // particles grouped by color so each frame sets fillStyle only 3×
        groups = sigColors.map(() => []);

        for (let y = 0; y < sigH; y += step) {
            for (let x = 0; x < sigW; x += step) {
                if (data[(y * sigW + x) * 4 + 3] > 128) {
                    groups[(Math.random() * groups.length) | 0].push({
                        x: Math.random() * sigW,
                        y: Math.random() * sigH,
                        tx: x,
                        ty: y,
                        vx: 0,
                        vy: 0
                    });
                }
            }
        }
    }

    function drawSignature() {
        sigCtx.clearRect(0, 0, sigW, sigH);

        // rect is re-read each frame so repulsion stays accurate while the
        // inertia glide moves the section under a stationary cursor
        const r = sigCanvas.getBoundingClientRect();
        const mx = mouseClientX - r.left;
        const my = mouseClientY - r.top;

        for (let g = 0; g < groups.length; g++) {
            sigCtx.fillStyle = sigColors[g];

            for (const p of groups[g]) {
                p.vx += (p.tx - p.x) * 0.02;
                p.vy += (p.ty - p.y) * 0.02;

                const dx = p.x - mx;
                const dy = p.y - my;
                const d2 = dx * dx + dy * dy;

                if (d2 < 8100) {
                    const d = Math.sqrt(d2) || 1;
                    const f = ((90 - d) / 90) * 2.4;
                    p.vx += (dx / d) * f;
                    p.vy += (dy / d) * f;
                }

                p.vx *= 0.88;
                p.vy *= 0.88;
                p.x += p.vx;
                p.y += p.vy;

                sigCtx.fillRect(p.x, p.y, 1.7, 1.7);
            }
        }

        sigRaf = running ? requestAnimationFrame(drawSignature) : null;
    }

    function drawStatic() {
        sigCtx.clearRect(0, 0, sigW, sigH);

        for (let g = 0; g < groups.length; g++) {
            sigCtx.fillStyle = sigColors[g];

            for (const p of groups[g]) {
                sigCtx.fillRect(p.tx, p.ty, 1.7, 1.7);
            }
        }
    }

    function startSig() {
        if (reduceMotion) {
            drawStatic();
            return;
        }
        if (!running) {
            running = true;
            drawSignature();
        }
    }

    function stopSig() {
        running = false;
        if (sigRaf) {
            cancelAnimationFrame(sigRaf);
            sigRaf = null;
        }
    }

    const sigObserver = new IntersectionObserver(entries => {
        entries.forEach(en => (en.isIntersecting ? startSig() : stopSig()));
    }, { threshold: 0.05 });

    document.fonts.ready.then(() => {
        buildSignature();
        sigObserver.observe(sigCanvas);
        if (reduceMotion) drawStatic();
    });

    sigCanvas.parentElement.addEventListener("mousemove", e => {
        mouseClientX = e.clientX;
        mouseClientY = e.clientY;
    }, { passive: true });

    sigCanvas.parentElement.addEventListener("mouseleave", () => {
        mouseClientX = -1e4;
        mouseClientY = -1e4;
    });

    // rebuild only when the width actually changes — mobile URL-bar
    // show/hide fires height-only resizes that shouldn't scatter the wordmark
    let resizeTimer = null;
    let lastSigWidth = window.innerWidth;

    window.addEventListener("resize", () => {
        if (window.innerWidth === lastSigWidth) return;
        lastSigWidth = window.innerWidth;

        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            buildSignature();
            if (reduceMotion) drawStatic();
        }, 300);
    });

    // colors depend on theme — rebuild when it flips
    document.querySelectorAll(".theme-toggle").forEach(b => {
        b.addEventListener("click", () => {
            buildSignature();
            if (reduceMotion) drawStatic();
        });
    });
}
