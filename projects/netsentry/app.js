/* ============================================================
   NetSentry — synthetic network operations console.
   Everything here is generated locally in the browser. No real
   hosts are contacted; this is a UI/UX study of a SOC dashboard.
   ============================================================ */
(function () {
    "use strict";

    var Lab = window.Lab || { toast: function () {}, reduceMotion: function () { return false; } };
    var reduce = Lab.reduceMotion();
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var rint = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
    var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    var pad2 = function (n) { return String(n).padStart(2, "0"); };

    /* ---------- Service catalogue ---------- */
    // tier: 0 = benign, 1 = worth noting, 2 = high-risk when exposed
    var SERVICES = {
        21:   { name: "ftp", tier: 2 },
        22:   { name: "ssh", tier: 1 },
        23:   { name: "telnet", tier: 2 },
        25:   { name: "smtp", tier: 1 },
        53:   { name: "dns", tier: 0 },
        80:   { name: "http", tier: 0 },
        110:  { name: "pop3", tier: 1 },
        111:  { name: "rpcbind", tier: 1 },
        135:  { name: "msrpc", tier: 1 },
        139:  { name: "netbios", tier: 2 },
        143:  { name: "imap", tier: 1 },
        161:  { name: "snmp", tier: 1 },
        389:  { name: "ldap", tier: 1 },
        443:  { name: "https", tier: 0 },
        445:  { name: "smb", tier: 2 },
        1433: { name: "mssql", tier: 2 },
        1521: { name: "oracle", tier: 2 },
        3306: { name: "mysql", tier: 1 },
        3389: { name: "rdp", tier: 2 },
        5432: { name: "postgres", tier: 1 },
        5900: { name: "vnc", tier: 2 },
        6379: { name: "redis", tier: 2 },
        8080: { name: "http-alt", tier: 0 },
        8443: { name: "https-alt", tier: 0 },
        9200: { name: "elastic", tier: 2 },
        11211:{ name: "memcached", tier: 2 },
        27017:{ name: "mongodb", tier: 2 }
    };
    var ALL_PORTS = Object.keys(SERVICES).map(Number).sort(function (a, b) { return a - b; });

    var OS_LIST = ["Ubuntu 22.04", "Debian 12", "Alpine 3.19", "Windows 11", "Windows Server 2019",
        "macOS 14", "FreeBSD 13", "RouterOS 7", "pfSense 2.7", "Linux 6.6"];

    // curated device archetypes so the fleet reads like a real segment
    var ARCHETYPES = [
        { name: "gw-edge",       os: "pfSense 2.7",         ports: [53, 80, 443], role: "Edge gateway" },
        { name: "web-01",        os: "Ubuntu 22.04",        ports: [22, 80, 443], role: "Web server" },
        { name: "web-02",        os: "Debian 12",           ports: [80, 443], role: "Web server" },
        { name: "db-primary",    os: "Ubuntu 22.04",        ports: [22, 5432], role: "Database" },
        { name: "cache-01",      os: "Alpine 3.19",         ports: [6379], role: "Cache node" },
        { name: "mail-relay",    os: "Debian 12",           ports: [25, 143, 443], role: "Mail relay" },
        { name: "nas-vault",     os: "Linux 6.6",           ports: [22, 445, 111], role: "Storage" },
        { name: "dev-box",       os: "macOS 14",            ports: [22, 3000, 8080], role: "Workstation" },
        { name: "win-fs",        os: "Windows Server 2019", ports: [135, 139, 445, 3389], role: "File server" },
        { name: "cam-lobby",     os: "Linux 6.6",           ports: [80, 554], role: "IP camera" },
        { name: "printer-3f",    os: "Linux 6.6",           ports: [80, 631, 161], role: "Printer" },
        { name: "k8s-node-2",    os: "Ubuntu 22.04",        ports: [22, 6443, 10250], role: "K8s node" },
        { name: "iot-thermostat",os: "Alpine 3.19",         ports: [80, 23], role: "IoT sensor" },
        { name: "legacy-app",    os: "Windows Server 2019", ports: [21, 23, 445, 3389], role: "Legacy host" },
        { name: "search-01",     os: "Ubuntu 22.04",        ports: [22, 9200], role: "Search index" },
        { name: "vpn-hub",       os: "RouterOS 7",          ports: [443, 1194], role: "VPN concentrator" }
    ];

    var SUBNET = "10.10.42.";
    var MAX_HOSTS = ARCHETYPES.length;

    /* ---------- State ---------- */
    var state = {
        hosts: [],
        usedIps: {},
        archIdx: 0,
        paused: false,
        filter: "all",
        highlight: null,
        scanning: false
    };
    var seq = 0;

    function svcName(p) { return SERVICES[p] ? SERVICES[p].name : "unknown"; }
    function svcTier(p) { return SERVICES[p] ? SERVICES[p].tier : 1; }

    function riskOf(host) {
        var t2 = 0, t1 = 0;
        host.ports.forEach(function (p) {
            var tier = svcTier(p.port);
            if (tier === 2) t2++;
            else if (tier === 1) t1++;
        });
        if (host.forcedCritical || t2 >= 2) return "critical";
        if (t2 === 1 || t1 >= 3) return "elevated";
        return "safe";
    }

    function riskRank(r) { return r === "critical" ? 2 : r === "elevated" ? 1 : 0; }

    function makeMac() {
        var h = "0123456789ABCDEF", s = [];
        for (var i = 0; i < 6; i++) s.push(h[rint(0, 15)] + h[rint(0, 15)]);
        return s.join(":");
    }

    function makeHost(arch) {
        var last;
        do { last = rint(2, 250); } while (state.usedIps[last]);
        state.usedIps[last] = true;

        // topology-ish angle from ip so the radar layout is stable
        var angle = (last / 255) * Math.PI * 2;

        var ports = arch.ports.map(function (p) {
            return { port: p, service: SERVICES[p] ? SERVICES[p].name : "svc-" + p, banner: bannerFor(p, arch.os) };
        });

        var host = {
            id: "h" + (++seq),
            ip: SUBNET + last,
            octet: last,
            name: arch.name,
            role: arch.role,
            os: arch.os,
            mac: makeMac(),
            ports: ports,
            latency: rint(2, 40) + Math.random(),
            firstSeen: Date.now(),
            up: true,
            angle: angle,
            radius: 0,
            forcedCritical: false,
            ping: 0
        };
        host.risk = riskOf(host);
        // radius: riskier hosts drawn nearer the center (closer to "us")
        host.radius = host.risk === "critical" ? 0.32 + Math.random() * 0.12
            : host.risk === "elevated" ? 0.5 + Math.random() * 0.14
            : 0.66 + Math.random() * 0.2;
        return host;
    }

    function bannerFor(port, os) {
        var b = {
            22: "OpenSSH 9.3", 80: "nginx 1.25", 443: "nginx 1.25 (TLS1.3)", 21: "vsftpd 3.0.3",
            23: "Linux telnetd", 3306: "MySQL 8.0.36", 5432: "PostgreSQL 16.1", 3389: "MS-RDP",
            6379: "Redis 7.2 (no auth)", 445: "Samba 4.17", 9200: "Elasticsearch 8.12",
            27017: "MongoDB 7.0", 25: "Postfix", 53: "dnsmasq 2.90", 8080: "Jetty 11",
            161: "net-snmp", 5900: "RFB 003.008"
        };
        return b[port] || (svcName(port) + " service");
    }

    /* ---------- KPI tiles ---------- */
    var kpiEls = {
        hosts: $("#kpi-hosts"), ports: $("#kpi-ports"),
        threats: $("#kpi-threats"), latency: $("#kpi-latency"), tput: $("#kpi-tput")
    };
    var kpiPrev = { hosts: 0, ports: 0, threats: 0, latency: 0, tput: 0 };

    function setKpi(key, value, suffix) {
        var el = kpiEls[key];
        if (!el) return;
        if (value !== kpiPrev[key]) {
            el.classList.remove("flash");
            void el.offsetWidth;
            el.classList.add("flash");
            kpiPrev[key] = value;
        }
        el.innerHTML = value + (suffix ? "<small>" + suffix + "</small>" : "");
    }

    /* ---------- Sparklines ---------- */
    var sparkDefs = {
        hosts: { color: "#22d3ee", hist: [] },
        ports: { color: "#818cf8", hist: [] },
        threats: { color: "#fbbf24", hist: [] },
        latency: { color: "#67e8f9", hist: [] },
        tput: { color: "#34d399", hist: [] }
    };
    var sparkCanvases = {};
    document.querySelectorAll("canvas[data-spark]").forEach(function (c) {
        sparkCanvases[c.getAttribute("data-spark")] = c;
    });
    var SPARK_LEN = 44;

    function pushSpark(key, v) {
        var d = sparkDefs[key];
        if (!d) return;
        d.hist.push(v);
        if (d.hist.length > SPARK_LEN) d.hist.shift();
    }

    function drawSpark(key) {
        var c = sparkCanvases[key], d = sparkDefs[key];
        if (!c || !d) return;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = c.clientWidth || 120, h = c.clientHeight || 34;
        c.width = w * dpr; c.height = h * dpr;
        var ctx = c.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        var hist = d.hist;
        if (hist.length < 2) return;
        var min = Math.min.apply(null, hist), max = Math.max.apply(null, hist);
        var range = max - min || 1;
        var step = w / (SPARK_LEN - 1);
        var pts = hist.map(function (v, i) {
            var x = w - (hist.length - 1 - i) * step;
            var y = h - 4 - ((v - min) / range) * (h - 8);
            return [x, y];
        });
        // area fill
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, hex(d.color, .28));
        grad.addColorStop(1, hex(d.color, 0));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], h);
        pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
        ctx.lineTo(pts[pts.length - 1][0], h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        // line
        ctx.beginPath();
        pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = "round";
        ctx.stroke();
        // head dot
        var last = pts[pts.length - 1];
        ctx.beginPath();
        ctx.arc(last[0], last[1], 2.2, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.fill();
    }

    function hex(h, a) {
        var n = parseInt(h.slice(1), 16);
        return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
    }

    function drawAllSparks() { Object.keys(sparkDefs).forEach(drawSpark); }

    /* ---------- Host table ---------- */
    var tbody = $("#ns-tbody");
    var emptyMsg = $("#ns-empty");
    var hostCountEl = $("#ns-host-count");
    var datalist = $("#ns-hostlist");

    function riskLabel(r) { return r === "critical" ? "Critical" : r === "elevated" ? "Elevated" : "Safe"; }

    function topService(host) {
        // surface the riskiest exposed port
        var sorted = host.ports.slice().sort(function (a, b) { return svcTier(b.port) - svcTier(a.port); });
        return sorted[0] ? sorted[0].service : "—";
    }

    function rowHtml(host) {
        return '<td><div class="ns-host-cell ' + (host.up ? "" : "down") + '"><span class="sd"></span>' +
            '<span><span class="ns-ip">' + host.ip + '</span>' +
            '<span class="ns-hostname">' + host.name + '</span></span></div></td>' +
            '<td class="col-os">' + host.os + '</td>' +
            '<td class="col-ports"><span class="ns-portn">' + host.ports.length + '</span></td>' +
            '<td class="col-svc"><span class="ns-svc">' + topService(host) + '</span></td>' +
            '<td><span class="risk ' + host.risk + '">' + riskLabel(host.risk) + '</span></td>';
    }

    function matchesFilter(host) {
        return state.filter === "all" || host.risk === state.filter;
    }

    function renderTable() {
        var shown = state.hosts.filter(matchesFilter)
            .sort(function (a, b) { return riskRank(b.risk) - riskRank(a.risk) || a.octet - b.octet; });
        // reconcile: rebuild is cheap here and keeps sort stable
        tbody.innerHTML = "";
        shown.forEach(function (host) {
            var tr = document.createElement("tr");
            tr.dataset.id = host.id;
            tr.innerHTML = rowHtml(host);
            tr.addEventListener("click", function () { openDrawer(host.id); });
            tr.addEventListener("mouseenter", function () { setHighlight(host.id); });
            tr.addEventListener("mouseleave", function () { setHighlight(null); });
            tbody.appendChild(tr);
        });
        emptyMsg.hidden = shown.length > 0;
        hostCountEl.textContent = state.hosts.length;

        datalist.innerHTML = state.hosts.map(function (h) {
            return '<option value="' + h.ip + '">' + h.name + '</option>';
        }).join("");
    }

    function flashRow(id) {
        var tr = tbody.querySelector('tr[data-id="' + id + '"]');
        if (tr) { tr.classList.add("ns-row-appear"); }
    }

    function setHighlight(id) {
        state.highlight = id;
        tbody.querySelectorAll("tr").forEach(function (tr) {
            tr.classList.toggle("hot", tr.dataset.id === id);
        });
        var readout = $("#ns-radar-readout");
        var h = byId(id);
        readout.innerHTML = h
            ? '<b>' + h.ip + '</b> · ' + h.name + ' · ' + riskLabel(h.risk).toLowerCase()
            : '<span class="mono">hover a host</span>';
    }

    function byId(id) {
        for (var i = 0; i < state.hosts.length; i++) if (state.hosts[i].id === id) return state.hosts[i];
        return null;
    }

    /* ---------- Radar ---------- */
    var radar = $("#ns-radar");
    var rctx = radar.getContext("2d");
    var sweep = 0;

    function resizeRadar() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var size = radar.clientWidth || 320;
        radar.width = size * dpr;
        radar.height = size * dpr;
        rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        radar._size = size;
    }

    function accent() {
        return getComputedStyle(document.documentElement).getPropertyValue("--cyan-4").trim() || "#22d3ee";
    }

    function drawRadar() {
        var size = radar._size || radar.clientWidth || 320;
        var cx = size / 2, cy = size / 2, R = size / 2 - 6;
        rctx.clearRect(0, 0, size, size);

        var line = "rgba(34,211,238,0.16)";
        // rings
        rctx.strokeStyle = line;
        rctx.lineWidth = 1;
        for (var i = 1; i <= 4; i++) {
            rctx.beginPath();
            rctx.arc(cx, cy, R * i / 4, 0, Math.PI * 2);
            rctx.stroke();
        }
        // cross-hairs
        rctx.beginPath();
        rctx.moveTo(cx - R, cy); rctx.lineTo(cx + R, cy);
        rctx.moveTo(cx, cy - R); rctx.lineTo(cx, cy + R);
        rctx.stroke();

        // sweep wedge
        if (!reduce) sweep = (sweep + 0.016) % (Math.PI * 2);
        var grad = rctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        grad.addColorStop(0, "rgba(34,211,238,0.28)");
        grad.addColorStop(1, "rgba(34,211,238,0)");
        rctx.save();
        rctx.translate(cx, cy);
        rctx.rotate(sweep);
        rctx.beginPath();
        rctx.moveTo(0, 0);
        rctx.arc(0, 0, R, -0.42, 0);
        rctx.closePath();
        rctx.fillStyle = grad;
        rctx.fill();
        // leading edge
        rctx.beginPath();
        rctx.moveTo(0, 0);
        rctx.lineTo(R, 0);
        rctx.strokeStyle = "rgba(103,232,249,0.6)";
        rctx.lineWidth = 1.4;
        rctx.stroke();
        rctx.restore();

        // blips
        state.hosts.forEach(function (h) {
            var bx = cx + Math.cos(h.angle) * R * h.radius;
            var by = cy + Math.sin(h.angle) * R * h.radius;
            // radar persistence: bright right after the sweep passes, then fades
            var diff = (sweep - h.angle + Math.PI * 2) % (Math.PI * 2);
            var glow = reduce ? 0.75 : Math.max(0.12, 1 - diff / (Math.PI * 2));
            var col = h.risk === "critical" ? "248,113,113" : h.risk === "elevated" ? "251,191,36" : "52,211,153";
            var isHi = state.highlight === h.id;
            var r = (h.risk === "critical" ? 4 : 3) + (isHi ? 3 : 0);

            rctx.beginPath();
            rctx.arc(bx, by, r + glow * 4, 0, Math.PI * 2);
            rctx.fillStyle = "rgba(" + col + "," + (0.12 + glow * 0.25) + ")";
            rctx.fill();

            rctx.beginPath();
            rctx.arc(bx, by, r, 0, Math.PI * 2);
            rctx.fillStyle = "rgba(" + col + "," + (0.5 + glow * 0.5) + ")";
            rctx.fill();

            if (isHi) {
                rctx.beginPath();
                rctx.arc(bx, by, r + 6, 0, Math.PI * 2);
                rctx.strokeStyle = "rgba(" + col + ",0.9)";
                rctx.lineWidth = 1.5;
                rctx.stroke();
            }
        });

        // center node ("us")
        rctx.beginPath();
        rctx.arc(cx, cy, 3, 0, Math.PI * 2);
        rctx.fillStyle = accent();
        rctx.fill();
    }

    function radarLoop() {
        drawRadar();
        requestAnimationFrame(radarLoop);
    }

    /* ---------- Event log ---------- */
    var logList = $("#ns-log-list");
    var LOG_CAP = 80;

    function nowClock() {
        var d = new Date();
        return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
    }

    function log(level, text) {
        var li = document.createElement("li");
        li.className = "ns-log-item " + level;
        li.innerHTML = '<span class="ns-log-time">' + nowClock() + '</span>' +
            '<span class="ns-log-lvl">' + level.toUpperCase() + '</span>' +
            '<span class="ns-log-txt"></span>';
        li.querySelector(".ns-log-txt").textContent = text;
        logList.insertBefore(li, logList.firstChild);
        while (logList.children.length > LOG_CAP) logList.removeChild(logList.lastChild);
    }

    /* ---------- KPI + derived recompute ---------- */
    var tputBase = 220;

    function recompute(pushHistory) {
        var online = 0, ports = 0, threats = 0, latSum = 0;
        state.hosts.forEach(function (h) {
            if (h.up) online++;
            ports += h.ports.length;
            if (h.risk === "critical") threats++;
            latSum += h.latency;
        });
        var latAvg = state.hosts.length ? Math.round(latSum / state.hosts.length) : 0;
        // throughput wanders around a baseline that rises with host count
        tputBase += (Math.random() - 0.5) * 40;
        tputBase = Lab.clamp ? Lab.clamp(tputBase, 120, 940) : Math.max(120, Math.min(940, tputBase));
        var tput = Math.round(tputBase + online * 12);

        setKpi("hosts", online);
        setKpi("ports", ports);
        setKpi("threats", threats);
        setKpi("latency", latAvg, "ms");
        setKpi("tput", tput, "Mb/s");

        if (pushHistory) {
            pushSpark("hosts", online);
            pushSpark("ports", ports);
            pushSpark("threats", threats);
            pushSpark("latency", latAvg);
            pushSpark("tput", tput);
            drawAllSparks();
        }

        // threat level
        var tl = threats >= 3 ? "critical" : threats === 2 ? "high" : threats === 1 ? "elevated" : "guarded";
        var box = $("#ns-threatlevel");
        box.setAttribute("data-level", tl);
        $("#ns-threat-val").textContent = tl.charAt(0).toUpperCase() + tl.slice(1);
    }

    /* ---------- Feed loop ---------- */
    var feedTimer = null;
    var FEED_MS = 2100;

    function discover() {
        if (state.archIdx >= ARCHETYPES.length) return null;
        var host = makeHost(ARCHETYPES[state.archIdx++]);
        state.hosts.push(host);
        renderTable();
        flashRow(host.id);
        var lvl = host.risk === "critical" ? "crit" : host.risk === "elevated" ? "warn" : "info";
        log(lvl, "host discovered — " + host.ip + " (" + host.name + ") · " + host.ports.length + " ports open");
        if (host.risk === "critical") {
            log("crit", "exposure — " + host.ip + " running " + topService(host) + " on the segment");
        }
        return host;
    }

    function ambientEvent() {
        if (!state.hosts.length) return;
        var h = pick(state.hosts);
        h.latency = Math.max(1, h.latency + (Math.random() - 0.5) * 8);
        var roll = Math.random();
        if (roll < 0.18) {
            log("info", h.ip + " — TLS handshake ok · cert valid 89d");
        } else if (roll < 0.32) {
            log("ok", h.ip + " — health check passed (" + Math.round(h.latency) + "ms)");
        } else if (roll < 0.42) {
            log("warn", h.ip + " — " + rint(3, 40) + " failed auth attempts on " + topService(h));
        } else if (roll < 0.5) {
            log("info", "arp sweep — " + state.hosts.length + " live hosts on " + SUBNET + "0/24");
        }
    }

    function tick() {
        if (state.paused) return;
        // discover new hosts early, then settle into ambient chatter
        if (state.hosts.length < MAX_HOSTS && Math.random() < (state.hosts.length < 6 ? 0.9 : 0.4)) {
            discover();
        } else {
            ambientEvent();
        }
        recompute(true);
    }

    function startFeed() {
        stopFeed();
        if (!state.paused) feedTimer = setInterval(tick, FEED_MS);
    }
    function stopFeed() { if (feedTimer) { clearInterval(feedTimer); feedTimer = null; } }

    /* ---------- Pause ---------- */
    var pauseBtn = $("#ns-pause");
    pauseBtn.addEventListener("click", function () {
        state.paused = !state.paused;
        pauseBtn.setAttribute("aria-pressed", state.paused ? "true" : "false");
        $("#ns-pause-txt").textContent = state.paused ? "Resume feed" : "Pause feed";
        $("#ns-pause-ic").innerHTML = state.paused
            ? '<polygon points="6 3 20 12 6 21 6 3"></polygon>'
            : '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
        document.body.classList.toggle("ns-paused", state.paused);
        $("#ns-radar-chip").innerHTML = state.paused
            ? '<span class="ns-live-dot"></span>paused'
            : '<span class="ns-live-dot"></span>scanning';
        $("#ns-log-rate").innerHTML = state.paused
            ? '<span class="ns-live-dot"></span>paused'
            : '<span class="ns-live-dot"></span>live';
        if (state.paused) { stopFeed(); log("info", "operator paused the live feed"); }
        else { startFeed(); log("info", "operator resumed the live feed"); }
    });

    /* ---------- Filters ---------- */
    document.querySelectorAll(".ns-filter").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".ns-filter").forEach(function (b) { b.classList.remove("is-on"); });
            btn.classList.add("is-on");
            state.filter = btn.getAttribute("data-filter");
            renderTable();
        });
    });

    /* ---------- Incident injection ---------- */
    var CRITICAL_PORTS = [23, 3389, 445, 6379, 27017, 9200, 5900];
    $("#ns-incident").addEventListener("click", function () {
        if (!state.hosts.length) { discover(); }
        // prefer a host that isn't already critical
        var candidates = state.hosts.filter(function (h) { return h.risk !== "critical"; });
        var h = candidates.length ? pick(candidates) : pick(state.hosts);
        var newPort = pick(CRITICAL_PORTS.filter(function (p) {
            return !h.ports.some(function (pp) { return pp.port === p; });
        }) || CRITICAL_PORTS);
        if (!newPort) newPort = pick(CRITICAL_PORTS);
        h.ports.push({ port: newPort, service: svcName(newPort), banner: bannerFor(newPort, h.os) });
        h.forcedCritical = true;
        h.risk = riskOf(h);
        h.radius = 0.3 + Math.random() * 0.1;
        renderTable();
        flashRow(h.id);
        recompute(true);
        log("crit", "ALERT — " + svcName(newPort) + " (" + newPort + ") now exposed on " + h.ip + " (" + h.name + ")");
        log("crit", "anomaly — lateral scan pattern detected from " + h.ip);
        Lab.toast("Incident injected on " + h.ip + " — " + svcName(newPort) + " exposed", "err", 3200);
    });

    /* ---------- Port scanner ---------- */
    var scanForm = $("#ns-scan-form");
    var targetInput = $("#ns-target");
    var rangeInput = $("#ns-range");
    var rangeLbl = $("#ns-range-lbl");
    var scanBtn = $("#ns-scan-btn");
    var progWrap = $("#ns-scan-progress");
    var fill = $("#ns-scan-fill");
    var pctEl = $("#ns-scan-pct");
    var statusEl = $("#ns-scan-status");
    var curEl = $("#ns-scan-cur");
    var resultsEl = $("#ns-scan-results");

    function syncRange() {
        rangeLbl.textContent = "1–" + rangeInput.value;
        var pct = ((rangeInput.value - rangeInput.min) / (rangeInput.max - rangeInput.min)) * 100;
        rangeInput.style.setProperty("--fill", pct + "%");
    }
    rangeInput.addEventListener("input", syncRange);
    syncRange();

    function targetHost(ip) {
        for (var i = 0; i < state.hosts.length; i++) if (state.hosts[i].ip === ip) return state.hosts[i];
        return null;
    }

    function plausiblePorts(max) {
        // ad-hoc target: fabricate a believable open-port set within range
        var out = [];
        ALL_PORTS.forEach(function (p) {
            if (p > max) return;
            var base = svcTier(p) === 0 ? 0.4 : svcTier(p) === 1 ? 0.22 : 0.12;
            if (Math.random() < base) out.push(p);
        });
        if (!out.length) out.push(pick(ALL_PORTS.filter(function (p) { return p <= max; })));
        return out;
    }

    scanForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (state.scanning) return;
        var ip = (targetInput.value || "").trim();
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
            // default to the gateway if left blank / invalid
            ip = state.hosts.length ? state.hosts[0].ip : SUBNET + "1";
            targetInput.value = ip;
        }
        runScan(ip, parseInt(rangeInput.value, 10));
    });

    function runScan(ip, max) {
        state.scanning = true;
        scanBtn.setAttribute("aria-disabled", "true");
        scanBtn.querySelector("span").textContent = "Scanning…";
        progWrap.hidden = false;
        resultsEl.innerHTML = "";
        fill.style.width = "0%";
        pctEl.textContent = "0%";
        statusEl.textContent = "resolving " + ip + "…";

        var host = targetHost(ip);
        var openPorts = host ? host.ports.map(function (p) { return p.port; }) : plausiblePorts(max);
        var openSet = {};
        openPorts.forEach(function (p) { if (p <= max) openSet[p] = true; });

        var found = [];
        var cur = 1;
        var perFrame = Math.max(6, Math.round(max / 90)); // ~1.5s total
        log("info", "port scan started — " + ip + " (1–" + max + ")");

        function step() {
            var end = Math.min(max, cur + perFrame);
            for (; cur <= end; cur++) {
                if (openSet[cur]) {
                    found.push(cur);
                    addResultPort(cur);
                }
            }
            var pct = Math.round((cur / max) * 100);
            fill.style.width = pct + "%";
            pctEl.textContent = pct + "%";
            curEl.textContent = "probing port " + cur + " · " + found.length + " open";
            statusEl.textContent = "scanning " + ip;
            if (cur < max && !reduce) {
                requestAnimationFrame(step);
            } else {
                if (reduce) { found = openPorts.filter(function (p) { return p <= max; }); }
                finishScan(ip, host, found, max);
            }
        }

        // seed results container header
        resultsEl.innerHTML = '<ul class="ns-portlist" id="ns-scan-portlist"></ul>';
        if (reduce) {
            openPorts.filter(function (p) { return p <= max; }).forEach(addResultPort);
            fill.style.width = "100%"; pctEl.textContent = "100%";
            finishScan(ip, host, openPorts.filter(function (p) { return p <= max; }), max);
        } else {
            requestAnimationFrame(step);
        }
    }

    function addResultPort(p) {
        var list = $("#ns-scan-portlist");
        if (!list) return;
        var tier = svcTier(p);
        var li = document.createElement("li");
        li.style.animationDelay = (list.children.length * 0.03) + "s";
        li.innerHTML = '<span class="pn">' + p + '</span>' +
            '<span class="ps">' + svcName(p) + '</span>' +
            '<span class="pt ' + (tier === 2 ? "risky" : "") + '">' +
            (tier === 2 ? "high risk" : tier === 1 ? "review" : "open") + '</span>';
        list.appendChild(li);
    }

    function finishScan(ip, host, found, max) {
        state.scanning = false;
        scanBtn.removeAttribute("aria-disabled");
        scanBtn.querySelector("span").textContent = "Scan";
        statusEl.textContent = "done · " + found.length + " open of " + max;
        curEl.textContent = "scan complete";

        var risky = found.filter(function (p) { return svcTier(p) === 2; });
        var review = found.filter(function (p) { return svcTier(p) === 1; });
        var verdict, cls, note;
        if (risky.length) {
            verdict = "Critical exposure"; cls = "critical";
            note = risky.map(svcName).join(", ") + " reachable — close or firewall immediately.";
        } else if (review.length) {
            verdict = "Elevated"; cls = "elevated";
            note = review.length + " service(s) worth reviewing (" + review.map(svcName).join(", ") + ").";
        } else {
            verdict = "Looks clean"; cls = "safe";
            note = found.length ? "Only low-risk services exposed." : "No open ports in range.";
        }

        var vIcon = cls === "safe"
            ? '<path d="M20 6 9 17l-5-5"/>'
            : cls === "elevated"
                ? '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'
                : '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>';

        var verdictEl = document.createElement("div");
        verdictEl.className = "ns-verdict " + cls;
        verdictEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round">' + vIcon + '</svg>' +
            '<div><strong>' + verdict + '</strong><span>' + note + '</span></div>';
        resultsEl.insertBefore(verdictEl, resultsEl.firstChild);

        log(risky.length ? "crit" : review.length ? "warn" : "ok",
            "scan finished — " + ip + " · " + found.length + " open" + (risky.length ? " · " + risky.length + " high-risk" : ""));
    }

    /* ---------- Drawer ---------- */
    var drawer = $("#ns-drawer");
    var drawerBody = $("#ns-drawer-body");

    var RECS = {
        23: "Disable telnet; migrate to SSH with key auth.",
        21: "Replace FTP with SFTP/FTPS; disable anonymous access.",
        3389: "Restrict RDP to VPN; enforce NLA + MFA.",
        445: "Block SMB at the perimeter; patch to latest, disable SMBv1.",
        139: "Disable NetBIOS over TCP/IP where unused.",
        6379: "Bind Redis to localhost; require AUTH; never expose publicly.",
        27017: "Enable MongoDB auth; bind to private interface.",
        9200: "Put Elasticsearch behind auth + TLS; restrict by IP.",
        5900: "Tunnel VNC over SSH; require strong passwords.",
        161: "Use SNMPv3; rotate community strings.",
        3306: "Restrict MySQL to app subnet; require TLS.",
        5432: "Restrict Postgres by pg_hba; require TLS."
    };

    function openDrawer(id) {
        var h = byId(id);
        if (!h) return;
        $("#ns-drawer-ip").textContent = h.ip;
        $("#ns-drawer-title").textContent = h.name + " · " + h.role;

        var ports = h.ports.slice().sort(function (a, b) { return svcTier(b.port) - svcTier(a.port) || a.port - b.port; });
        var portHtml = ports.map(function (p) {
            var tier = svcTier(p.port);
            return '<li><span class="pn">' + p.port + '</span>' +
                '<span class="ps">' + p.service + (p.banner ? ' · ' + p.banner : '') + '</span>' +
                '<span class="pt ' + (tier === 2 ? "risky" : "") + '">' +
                (tier === 2 ? "high risk" : tier === 1 ? "review" : "open") + '</span></li>';
        }).join("");

        var recs = [];
        ports.forEach(function (p) { if (RECS[p.port]) recs.push(RECS[p.port]); });
        if (!recs.length) recs.push("No high-risk services exposed. Keep patch levels current and monitor.");
        var recHtml = recs.map(function (r) {
            return '<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
                'stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/>' +
                '<circle cx="12" cy="12" r="10"/></svg><span>' + r + '</span></li>';
        }).join("");

        var seen = Math.max(1, Math.round((Date.now() - h.firstSeen) / 1000));
        drawerBody.innerHTML =
            '<span class="risk ' + h.risk + '" style="margin-bottom:1rem">' + riskLabel(h.risk) + ' risk</span>' +
            '<dl class="ns-dl">' +
            '<dt>Hostname</dt><dd>' + h.name + '</dd>' +
            '<dt>OS guess</dt><dd>' + h.os + '</dd>' +
            '<dt>MAC</dt><dd>' + h.mac + '</dd>' +
            '<dt>Latency</dt><dd>' + Math.round(h.latency) + ' ms</dd>' +
            '<dt>Open ports</dt><dd>' + h.ports.length + '</dd>' +
            '<dt>First seen</dt><dd>' + seen + 's ago</dd>' +
            '</dl>' +
            '<h4>Open services</h4><ul class="ns-portlist">' + portHtml + '</ul>' +
            '<h4>Recommended actions</h4><ul class="ns-actions-list">' + recHtml + '</ul>';

        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
    }

    function closeDrawer() {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
    }
    drawer.querySelectorAll("[data-close]").forEach(function (el) {
        el.addEventListener("click", closeDrawer);
    });
    window.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

    /* ---------- Clock ---------- */
    var clockEl = $("#ns-clock");
    function tickClock() { clockEl.textContent = nowClock(); }
    setInterval(tickClock, 1000);
    tickClock();

    /* ---------- Boot ---------- */
    function boot() {
        resizeRadar();
        // seed a few hosts immediately so the console isn't empty on load
        for (var i = 0; i < 5; i++) {
            var host = makeHost(ARCHETYPES[state.archIdx++]);
            state.hosts.push(host);
        }
        renderTable();
        // seed sparkline history so lines have shape at once
        for (var s = 0; s < 12; s++) {
            pushSpark("hosts", state.hosts.length);
            pushSpark("ports", state.hosts.reduce(function (a, h) { return a + h.ports.length; }, 0));
            pushSpark("threats", state.hosts.filter(function (h) { return h.risk === "critical"; }).length);
            pushSpark("latency", rint(8, 26));
            pushSpark("tput", rint(260, 420));
        }
        recompute(false);
        drawAllSparks();
        log("ok", "NetSentry online — monitoring " + SUBNET + "0/24");
        log("info", "discovery sweep started");
        startFeed();
        if (!reduce) radarLoop(); else drawRadar();
    }

    window.addEventListener("resize", function () {
        resizeRadar();
        drawAllSparks();
        if (reduce) drawRadar();
    });
    window.addEventListener("lab:theme", function () { drawAllSparks(); drawRadar(); });

    // pause the loop when the tab is hidden (saves cycles, avoids event pile-up)
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) stopFeed();
        else if (!state.paused) startFeed();
    });

    if (document.readyState !== "loading") boot();
    else document.addEventListener("DOMContentLoaded", boot);
})();
