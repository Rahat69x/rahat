/* ============================================================
   CipherNote — zero-knowledge encrypted notes.
   Real cryptography via the Web Crypto API:
     · key   = PBKDF2(passphrase, random salt, 210k, SHA-256)
     · cipher = AES-256-GCM with a fresh 96-bit IV per record
   The passphrase and derived key live only in memory. Only
   ciphertext is ever written to localStorage. No server, ever.
   ============================================================ */
(function () {
    "use strict";

    var Lab = window.Lab || { toast: function () {}, reduceMotion: function () { return false; } };
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var enc = new TextEncoder();
    var dec = new TextDecoder();

    var STORE_KEY = "ciphernote.vault.v1";
    var CHECK = "ciphernote::ok::v1";
    var ITER = 210000;

    /* in-memory only — wiped on lock */
    var vault = null;      // { v, kdf, check, notes:[{id,iv,ct,updated}] }
    var cryptoKey = null;  // CryptoKey (non-extractable)
    var notes = [];        // plaintext working set: [{id,title,body,updated}]
    var activeId = null;
    var saveTimer = null;
    var dirty = false;

    var hasCrypto = !!(window.crypto && window.crypto.subtle && window.isSecureContext !== false);

    /* ---------- base64 <-> bytes ---------- */
    function b64e(buf) {
        var b = new Uint8Array(buf), s = "";
        for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return btoa(s);
    }
    function b64d(str) {
        var s = atob(str), b = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
        return b;
    }

    /* ---------- crypto primitives ---------- */
    function deriveKey(pass, salt, iter) {
        return crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"])
            .then(function (base) {
                return crypto.subtle.deriveKey(
                    { name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" },
                    base,
                    { name: "AES-GCM", length: 256 },
                    false,
                    ["encrypt", "decrypt"]
                );
            });
    }
    function encryptObj(key, obj) {
        var iv = crypto.getRandomValues(new Uint8Array(12));
        return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(JSON.stringify(obj)))
            .then(function (ct) { return { iv: b64e(iv), ct: b64e(ct) }; });
    }
    function decryptRec(key, rec) {
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(rec.iv) }, key, b64d(rec.ct))
            .then(function (pt) { return JSON.parse(dec.decode(pt)); });
    }

    /* ---------- persistence ---------- */
    function loadVault() {
        try {
            var raw = localStorage.getItem(STORE_KEY);
            vault = raw ? JSON.parse(raw) : null;
        } catch (e) { vault = null; }
    }
    function saveVault() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(vault)); }
        catch (e) { Lab.toast("Could not save — storage unavailable", "err"); }
    }

    /* ---------- element refs ---------- */
    var gate = $("#cn-gate");
    var vaultScreen = $("#cn-vault");
    var unlockForm = $("#cn-unlock-form");
    var setupForm = $("#cn-setup-form");
    var navtag = $("#cn-navtag");

    /* ---------- gate ↔ vault ---------- */
    function showGate() {
        cryptoKey = null;
        notes = [];
        activeId = null;
        vaultScreen.hidden = true;
        gate.hidden = false;
        navtag.textContent = "locked";

        var setup = !vault;
        setupForm.hidden = !setup;
        unlockForm.hidden = setup;
        $("#cn-gate-title").textContent = setup ? "Create your vault" : "Unlock your vault";
        $("#cn-gate-desc").textContent = setup
            ? "Pick a strong passphrase. Your notes will be encrypted with it — and it's the only key that can ever open them."
            : "Enter your passphrase to decrypt your notes. Everything is decrypted locally — nothing leaves this device.";
        $("#cn-gate-badge").textContent = setup ? "New vault" : "AES-256-GCM";

        if (!hasCrypto) return; // handled in boot
        var focusEl = setup ? $("#cn-new-pass") : $("#cn-unlock-pass");
        setTimeout(function () { focusEl && focusEl.focus(); }, 60);
    }

    function showVault() {
        gate.hidden = true;
        vaultScreen.hidden = false;
        navtag.textContent = "unlocked";
        renderList();
        if (notes.length) selectNote(notes[0].id);
        else showEmpty();
    }

    /* ---------- setup ---------- */
    setupForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var pass = $("#cn-new-pass").value;
        var confirm = $("#cn-confirm-pass").value;
        var errEl = $("#cn-setup-error");
        errEl.hidden = true;

        if (pass.length < 8) { return showErr(errEl, "Use at least 8 characters."); }
        if (pass !== confirm) { return showErr(errEl, "Passphrases don't match."); }

        var btn = setupForm.querySelector('button[type="submit"]');
        btn.setAttribute("aria-disabled", "true");
        btn.querySelector("span").textContent = "Encrypting…";

        var salt = crypto.getRandomValues(new Uint8Array(16));
        deriveKey(pass, salt, ITER).then(function (key) {
            return encryptObj(key, CHECK).then(function (check) {
                vault = { v: 1, kdf: { salt: b64e(salt), iter: ITER, hash: "SHA-256" }, check: check, notes: [] };
                saveVault();
                cryptoKey = key;
                notes = [];
                pass = confirm = "";
                setupForm.reset();
                $("#cn-strength").hidden = true;
                Lab.toast("Vault created — you're the only one who can open it", "ok");
                showVault();
                newNote();
            });
        }).catch(function () {
            showErr(errEl, "Something went wrong deriving your key.");
        }).then(function () {
            btn.removeAttribute("aria-disabled");
            btn.querySelector("span").textContent = "Create encrypted vault";
        });
    });

    /* ---------- unlock ---------- */
    unlockForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var pass = $("#cn-unlock-pass").value;
        var errEl = $("#cn-unlock-error");
        errEl.hidden = true;
        if (!pass) return showErr(errEl, "Enter your passphrase.");

        var btn = $("#cn-unlock-btn");
        btn.setAttribute("aria-disabled", "true");
        btn.querySelector("span").textContent = "Decrypting…";

        var salt = b64d(vault.kdf.salt);
        deriveKey(pass, salt, vault.kdf.iter || ITER).then(function (key) {
            return decryptRec(key, vault.check).then(function (v) {
                if (v !== CHECK) throw new Error("bad");
                cryptoKey = key;
                // decrypt every note
                return Promise.all(vault.notes.map(function (rec) {
                    return decryptRec(key, rec).then(function (n) {
                        return { id: rec.id, title: n.title, body: n.body, updated: rec.updated };
                    });
                }));
            });
        }).then(function (list) {
            notes = list.sort(function (a, b) { return b.updated - a.updated; });
            pass = "";
            unlockForm.reset();
            showVault();
            revealList();
            Lab.toast("Vault unlocked · " + notes.length + " note" + (notes.length === 1 ? "" : "s") + " decrypted", "ok");
        }).catch(function () {
            showErr(errEl, "Wrong passphrase — decryption failed.");
            var card = $(".cn-gate-card");
            card.classList.remove("cn-shake"); void card.offsetWidth; card.classList.add("cn-shake");
        }).then(function () {
            btn.removeAttribute("aria-disabled");
            btn.querySelector("span").textContent = "Unlock vault";
        });
    });

    function showErr(el, msg) { el.textContent = msg; el.hidden = false; }

    /* ---------- lock ---------- */
    function lock() {
        if (dirty && activeId) flushSave();
        cryptoKey = null;
        notes = [];
        activeId = null;
        showGate();
        Lab.toast("Vault locked", "info");
    }
    $("#cn-lock").addEventListener("click", lock);

    /* ---------- notes list ---------- */
    var listEl = $("#cn-note-list");
    var searchEl = $("#cn-search");

    function notePreview(n) {
        var text = (n.body || "").replace(/\s+/g, " ").trim();
        return text || "No additional text";
    }
    function relTime(ts) {
        var s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return "just now";
        if (s < 3600) return Math.floor(s / 60) + "m ago";
        if (s < 86400) return Math.floor(s / 3600) + "h ago";
        return Math.floor(s / 86400) + "d ago";
    }

    function filteredNotes() {
        var q = (searchEl.value || "").toLowerCase().trim();
        if (!q) return notes;
        return notes.filter(function (n) {
            return (n.title || "").toLowerCase().indexOf(q) >= 0 ||
                (n.body || "").toLowerCase().indexOf(q) >= 0;
        });
    }

    var LOCK_ICON = '<svg class="lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';

    function renderList() {
        var items = filteredNotes();
        if (!items.length) {
            listEl.innerHTML = '<li class="cn-list-empty">' +
                (notes.length ? "No notes match your search." : "No notes yet. Hit + to write one.") + '</li>';
            return;
        }
        listEl.innerHTML = "";
        items.forEach(function (n) {
            var li = document.createElement("li");
            li.className = "cn-note-item" + (n.id === activeId ? " active" : "");
            li.dataset.id = n.id;
            li.innerHTML =
                '<div class="cn-note-title">' + LOCK_ICON + '<span class="cn-t">' + escapeHtml(n.title || "Untitled note") + '</span></div>' +
                '<div class="cn-note-preview">' + escapeHtml(notePreview(n)) + '</div>' +
                '<div class="cn-note-date">' + relTime(n.updated) + '</div>';
            li.addEventListener("click", function () { selectNote(n.id); collapseSidebarOnMobile(); });
            listEl.appendChild(li);
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
    }

    // scramble-reveal titles on unlock (the "decrypt in place" flourish)
    function revealList() {
        if (Lab.reduceMotion()) return;
        listEl.querySelectorAll(".cn-note-item .cn-t").forEach(function (span, i) {
            scramble(span, span.textContent, 420 + i * 60);
        });
    }
    var GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789/+=@#$%&";
    function scramble(el, finalText, duration) {
        var start = performance.now();
        el.classList.add("cn-scramble");
        function frame(now) {
            var p = Math.min(1, (now - start) / duration);
            var reveal = Math.floor(p * finalText.length);
            var out = finalText.slice(0, reveal);
            for (var i = reveal; i < finalText.length; i++) {
                out += finalText[i] === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            }
            el.textContent = out;
            if (p < 1) requestAnimationFrame(frame);
            else { el.textContent = finalText; el.classList.remove("cn-scramble"); }
        }
        requestAnimationFrame(frame);
    }

    searchEl.addEventListener("input", renderList);

    /* ---------- editor ---------- */
    var docEmpty = $("#cn-editor-empty");
    var docView = $("#cn-editor-doc");
    var titleEl = $("#cn-title");
    var bodyEl = $("#cn-body");
    var saveState = $("#cn-save-state");
    var saveTxt = $("#cn-save-txt");
    var metaEl = $("#cn-doc-meta");

    function showEmpty() {
        activeId = null;
        docView.hidden = true;
        docEmpty.hidden = false;
    }

    function selectNote(id) {
        if (dirty && activeId && activeId !== id) flushSave();
        var n = notes.find(function (x) { return x.id === id; });
        if (!n) return showEmpty();
        activeId = id;
        docEmpty.hidden = true;
        docView.hidden = false;
        titleEl.value = n.title || "";
        bodyEl.value = n.body || "";
        updateMeta(n);
        setSaved();
        renderList();
        vaultScreen.classList.add("editing");
    }

    function updateMeta(n) {
        var words = (n.body || "").trim() ? (n.body.trim().split(/\s+/).length) : 0;
        metaEl.textContent = words + (words === 1 ? " word" : " words") + " · " + relTime(n.updated);
    }

    function newNote() {
        var n = { id: "n" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
            title: "", body: "", updated: Date.now() };
        notes.unshift(n);
        persistNote(n);
        renderList();
        selectNote(n.id);
        setTimeout(function () { titleEl.focus(); }, 40);
    }
    $("#cn-new").addEventListener("click", newNote);
    $("#cn-empty-new").addEventListener("click", newNote);

    function onEdit() {
        var n = notes.find(function (x) { return x.id === activeId; });
        if (!n) return;
        n.title = titleEl.value;
        n.body = bodyEl.value;
        n.updated = Date.now();
        dirty = true;
        setSaving();
        // live-update the list entry (title/preview) without full reflow churn
        var li = listEl.querySelector('.cn-note-item[data-id="' + n.id + '"] .cn-t');
        if (li) li.textContent = n.title || "Untitled note";
        updateMeta(n);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, 650);
    }
    titleEl.addEventListener("input", onEdit);
    bodyEl.addEventListener("input", onEdit);

    function flushSave() {
        clearTimeout(saveTimer);
        var n = notes.find(function (x) { return x.id === activeId; });
        if (!n) return;
        persistNote(n).then(function () {
            dirty = false;
            setSaved();
            // re-sort list so most-recent floats up, but keep focus stable
            renderList();
        });
    }

    function persistNote(note) {
        if (!cryptoKey) return Promise.resolve();
        return encryptObj(cryptoKey, { title: note.title, body: note.body }).then(function (rec) {
            rec.id = note.id;
            rec.updated = note.updated;
            var idx = vault.notes.findIndex(function (r) { return r.id === note.id; });
            if (idx >= 0) vault.notes[idx] = rec; else vault.notes.push(rec);
            saveVault();
        });
    }

    function setSaving() { saveState.classList.add("saving"); saveTxt.textContent = "encrypting…"; }
    function setSaved() { saveState.classList.remove("saving"); saveTxt.textContent = "encrypted"; }

    /* ---------- delete ---------- */
    $("#cn-delete").addEventListener("click", function () {
        var n = notes.find(function (x) { return x.id === activeId; });
        if (!n) return;
        confirmModal("Delete this note?", "“" + (n.title || "Untitled note") + "” will be permanently erased from your vault.", "Delete", function () {
            notes = notes.filter(function (x) { return x.id !== n.id; });
            vault.notes = vault.notes.filter(function (r) { return r.id !== n.id; });
            saveVault();
            renderList();
            if (notes.length) selectNote(notes[0].id); else showEmpty();
            Lab.toast("Note deleted", "info");
        });
    });

    /* ---------- export / import ---------- */
    $("#cn-export").addEventListener("click", function () {
        if (!vault) return;
        if (dirty) flushSave();
        var blob = new Blob([JSON.stringify(vault, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "ciphernote-vault.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        Lab.toast("Encrypted vault exported — still needs your passphrase", "ok");
    });

    var importFile = $("#cn-import-file");
    function triggerImport() { importFile.click(); }
    $("#cn-import-gate").addEventListener("click", triggerImport);
    $("#cn-import-vault").addEventListener("click", function () {
        confirmModal("Import a vault?", "This replaces the current vault on this device. Export it first if you want to keep it.", "Import", triggerImport);
    });

    importFile.addEventListener("change", function () {
        var file = importFile.files && importFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            try {
                var obj = JSON.parse(reader.result);
                if (!obj || !obj.kdf || !obj.kdf.salt || !obj.check || !Array.isArray(obj.notes)) {
                    throw new Error("shape");
                }
                vault = obj;
                saveVault();
                cryptoKey = null; notes = []; activeId = null;
                showGate();
                Lab.toast("Vault imported — unlock it with its passphrase", "ok", 3200);
            } catch (e) {
                Lab.toast("That doesn't look like a CipherNote vault", "err");
            }
            importFile.value = "";
        };
        reader.readAsText(file);
    });

    /* ---------- reset ---------- */
    $("#cn-reset-link").addEventListener("click", function () {
        confirmModal("Reset the vault?", "This deletes the encrypted vault and every note in it. There is no undo and no recovery.", "Delete everything", function () {
            try { localStorage.removeItem(STORE_KEY); } catch (e) {}
            vault = null;
            showGate();
            Lab.toast("Vault reset — start fresh", "info");
        });
    });

    /* ---------- confirm modal ---------- */
    var modal = $("#cn-modal");
    var modalConfirm = $("#cn-modal-confirm");
    var pendingConfirm = null;
    function confirmModal(title, desc, label, onOk) {
        $("#cn-modal-title").textContent = title;
        $("#cn-modal-desc").textContent = desc;
        modalConfirm.textContent = label;
        pendingConfirm = onOk;
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        setTimeout(function () { modalConfirm.focus(); }, 40);
    }
    function closeModal() {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        pendingConfirm = null;
    }
    modal.querySelectorAll("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeModal); });
    modalConfirm.addEventListener("click", function () {
        var fn = pendingConfirm;
        closeModal();
        if (fn) fn();
    });

    /* ---------- password eye toggles ---------- */
    document.querySelectorAll(".cn-eye").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var input = $("#" + btn.getAttribute("data-eye"));
            if (!input) return;
            var show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.classList.toggle("on", show);
            btn.setAttribute("aria-label", show ? "Hide passphrase" : "Show passphrase");
        });
    });

    /* ---------- strength meter (setup) ---------- */
    var strengthBox = $("#cn-strength");
    $("#cn-new-pass").addEventListener("input", function (e) {
        var pass = e.target.value;
        if (!pass) { strengthBox.hidden = true; return; }
        strengthBox.hidden = false;
        var r = estimateStrength(pass);
        strengthBox.setAttribute("data-score", r.score);
        $("#cn-strength-lbl").textContent = r.label;
        $("#cn-strength-crack").textContent = r.crack;
    });

    function estimateStrength(pass) {
        var pool = 0;
        if (/[a-z]/.test(pass)) pool += 26;
        if (/[A-Z]/.test(pass)) pool += 26;
        if (/[0-9]/.test(pass)) pool += 10;
        if (/[^A-Za-z0-9]/.test(pass)) pool += 33;
        var bits = pass.length * (Math.log(pool || 1) / Math.log(2));
        // penalise obvious repetition / sequences
        if (/(.)\1\1/.test(pass)) bits -= 12;
        if (/^(?:1234|abcd|qwer|pass|admin)/i.test(pass)) bits -= 18;
        bits = Math.max(0, bits);

        var score = bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
        var labels = { 1: "Weak", 2: "Fair", 3: "Strong", 4: "Excellent" };
        // offline attacker at 1e10 guesses/sec against this passphrase alone
        var seconds = Math.pow(2, bits) / 1e10;
        return { score: score, label: labels[score], crack: "~" + humanTime(seconds) + " to crack" };
    }

    function humanTime(sec) {
        if (sec < 1) return "instant";
        var units = [["yr", 31557600], ["day", 86400], ["hr", 3600], ["min", 60], ["sec", 1]];
        for (var i = 0; i < units.length; i++) {
            if (sec >= units[i][1]) {
                var v = sec / units[i][1];
                if (v > 1e9) return v.toExponential(1) + " " + units[i][0];
                return Math.round(v).toLocaleString() + " " + units[i][0];
            }
        }
        return "instant";
    }

    /* ---------- cipher rain (decorative) ---------- */
    function cipherRain() {
        var el = $("#cn-rain");
        if (!el) return;
        var chars = "";
        for (var i = 0; i < 900; i++) {
            chars += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            if (i % 46 === 45) chars += "\n";
        }
        el.textContent = chars;
    }

    /* ---------- mobile sidebar collapse ---------- */
    function collapseSidebarOnMobile() {
        if (window.matchMedia("(max-width: 760px)").matches) {
            // keep both visible but scroll editor into view
            $("#cn-editor").scrollIntoView({ behavior: Lab.reduceMotion() ? "auto" : "smooth", block: "start" });
        }
    }

    /* ---------- keyboard shortcuts ---------- */
    window.addEventListener("keydown", function (e) {
        if (modal.classList.contains("open") && e.key === "Escape") { closeModal(); return; }
        if (vaultScreen.hidden) return;
        var typing = /INPUT|TEXTAREA/.test((e.target.tagName || ""));
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (dirty) flushSave(); Lab.toast("Encrypted & saved", "ok", 1400); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") { e.preventDefault(); lock(); return; }
        if (typing) return;
        if (e.key === "/") { e.preventDefault(); searchEl.focus(); }
        else if (e.key.toLowerCase() === "n") { e.preventDefault(); newNote(); }
    });

    // save before leaving
    window.addEventListener("beforeunload", function () { if (dirty && activeId) flushSave(); });

    /* ---------- boot ---------- */
    function boot() {
        if (!hasCrypto) {
            gate.hidden = false;
            vaultScreen.hidden = true;
            setupForm.hidden = true;
            unlockForm.hidden = true;
            $("#cn-gate-title").textContent = "Secure context required";
            $("#cn-gate-desc").innerHTML = "CipherNote uses the Web Crypto API, which browsers only expose over " +
                "<b>https</b> or <b>localhost</b>. Open this page from a local server (or the live link) and the vault will work.";
            $("#cn-gate-badge").textContent = "unavailable";
            return;
        }
        loadVault();
        showGate();
        cipherRain();
        setInterval(cipherRain, 2600);
    }

    if (document.readyState !== "loading") boot();
    else document.addEventListener("DOMContentLoaded", boot);
})();
