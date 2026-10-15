// Exam Desk: Google sign-in and profile sync (Firebase Auth + Cloud Firestore).
// Without a filled-in firebase-config.js the site still works and saves in this browser only.
import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
// Everything a student sets up on the site, stored as the same strings the page keeps in localStorage.
const KEYS = ["examdesk.th2", "examdesk.pum", "examdesk.exams", "examdesk.cdsetup", "examdesk.theme"];
const FLAG = "examdesk.cloudApplied";

const $ = (id) => document.getElementById(id);
const acct = $("acct"), btn = $("acctBtn"), pop = $("acctPop"), note = $("syncNote");

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
function localData() { const d = {}; KEYS.forEach((k) => { const v = lsGet(k); if (v != null) d[k] = v; }); return d; }
function same(a, b) { return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort()); }
function parse(k) { try { return JSON.parse(lsGet(k)); } catch (e) { return null; } }

const configured = firebaseConfig && firebaseConfig.apiKey && !/^PASTE/.test(firebaseConfig.apiKey);

if (!configured) {
  console.info("Exam Desk: sign-in is off until public/firebase-config.js is filled in. See SETUP.md.");
} else {
  start().catch((e) => { console.error(e); });
}

async function start() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  let user = null, docRef = null, timer = null, lastSync = null, msg = "", msgErr = false;
  acct.hidden = false;

  // ---------- writing ----------
  async function push() {
    if (!docRef) return;
    try {
      await F.setDoc(docRef, {
        profile: { name: user.displayName || "", email: user.email || "", photo: user.photoURL || "" },
        data: localData(),
        updatedAt: F.serverTimestamp()
      }, { merge: true });
      lastSync = new Date(); setNote();
      if (!pop.hidden) renderPop();
    } catch (e) { console.error(e); setNote("Couldn't save to your account. Changes are kept in this browser."); }
  }
  window.ExamDeskSync = function () {
    if (!docRef) return;
    clearTimeout(timer); timer = setTimeout(push, 1200);
  };
  window.addEventListener("pagehide", () => { if (timer) { clearTimeout(timer); push(); } });

  // ---------- sign in / out ----------
  async function signIn() {
    msg = ""; msgErr = false;
    try { await A.signInWithPopup(auth, provider); }
    catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        await A.signInWithRedirect(auth, provider);
      } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        msg = "Sign-in didn't work (" + e.code + ")."; msgErr = true; openPop();
      }
    }
  }
  async function signOutAndClear() {
    if (timer) { clearTimeout(timer); await push(); }
    await A.signOut(auth);
    // Remove this account's copy from the browser, so the next person on a shared computer starts fresh.
    KEYS.forEach((k) => lsSet(k, null));
    try { sessionStorage.removeItem(FLAG); } catch (e) {}
    location.reload();
  }
  async function deleteData() {
    if (!docRef) return;
    if (pop.dataset.confirm !== "1") { pop.dataset.confirm = "1"; renderPop(); return; }
    try { await F.deleteDoc(docRef); } catch (e) { msg = "Couldn't delete: " + e.code; msgErr = true; renderPop(); return; }
    docRef = null;
    await A.signOut(auth);
    KEYS.forEach((k) => lsSet(k, null));
    location.reload();
  }

  A.getRedirectResult(auth).catch((e) => { msg = "Sign-in didn't work (" + e.code + ")."; msgErr = true; });

  A.onAuthStateChanged(auth, async (u) => {
    user = u;
    if (!u) { docRef = null; renderBtn(); setNote(""); return; }
    docRef = F.doc(db, "users", u.uid);
    renderBtn();
    try {
      const snap = await F.getDoc(docRef);
      const cloud = snap.exists() && snap.data().data ? snap.data().data : null;
      if (cloud && Object.keys(cloud).length) {
        const local = localData();
        const cloudOnly = {}; KEYS.forEach((k) => { if (cloud[k] != null) cloudOnly[k] = cloud[k]; });
        if (!same(cloudOnly, local)) {
          // Your account is the master copy: load it, then reload so every tool picks it up.
          // (A short guard stops a reload loop if this browser can't store the data.)
          KEYS.forEach((k) => lsSet(k, cloud[k] != null ? cloud[k] : null));
          let last = 0; try { last = Number(sessionStorage.getItem(FLAG)) || 0; } catch (e) {}
          if (Date.now() - last > 15000 && same(cloudOnly, localData())) {
            try { sessionStorage.setItem(FLAG, String(Date.now())); } catch (e) {}
            location.reload(); return;
          }
        }
        if (snap.data().updatedAt) lastSync = snap.data().updatedAt.toDate();
        setNote();
      } else {
        await push(); // first sign-in: copy what is in this browser to the account
      }
      maybeAskForPlan();
    } catch (e) {
      console.error(e);
      setNote("Signed in, but your saved data couldn't be loaded (" + (e.code || e.message) + ").");
    }
  });

  // ---------- UI ----------
  function avatar(u, cls) {
    if (u.photoURL) { const i = document.createElement("img"); i.src = u.photoURL; i.alt = ""; i.referrerPolicy = "no-referrer"; if (cls) i.className = cls; return i; }
    const s = document.createElement("span"); s.className = "acct-av"; s.textContent = (u.displayName || u.email || "?").trim().charAt(0).toUpperCase(); return s;
  }
  function renderBtn() {
    btn.innerHTML = "";
    if (user) { btn.classList.add("signed"); btn.appendChild(avatar(user)); btn.setAttribute("aria-label", "Account: " + (user.displayName || user.email)); }
    else { btn.classList.remove("signed"); btn.textContent = "Sign in"; btn.removeAttribute("aria-label"); closePop(); }
  }
  function setNote(t) {
    if (t != null && t !== "") { note.textContent = t; return; }
    if (!user) { note.textContent = ""; return; }
    note.textContent = "Signed in as " + (user.email || user.displayName) + "; your settings save to your account." ;
  }
  function ago(d) {
    if (!d) return "not yet";
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return d.toLocaleDateString();
  }
  function profileRows() {
    const ex = parse("examdesk.exams") || [];
    return [["Papers in countdown", String(ex.length)], ["Last saved", ago(lastSync)]];
  }
  function renderPop() {
    pop.innerHTML = "";
    if (!user) {
      const p = document.createElement("p"); p.className = "acct-msg" + (msgErr ? " err" : ""); p.textContent = msg; pop.appendChild(p); return;
    }
    const head = document.createElement("div"); head.className = "acct-head";
    head.appendChild(avatar(user));
    const who = document.createElement("div"); const b = document.createElement("b"); b.textContent = user.displayName || "Student";
    const em = document.createElement("span"); em.textContent = user.email || ""; who.append(b, em); head.appendChild(who);
    const rows = document.createElement("dl"); rows.className = "acct-rows"; rows.style.margin = "0";
    profileRows().forEach(([k, v]) => { const d = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; d.append(dt, dd); rows.appendChild(d); });
    const planWrap = document.createElement("div"); planWrap.style.display = "grid"; planWrap.style.gap = "8px";
    const plan = getPlan();
    const ph = document.createElement("b"); ph.textContent = "Your exam plan"; ph.style.fontSize = "14px";
    planWrap.appendChild(ph);
    if (plan.length) {
      const ul = document.createElement("ul"); ul.className = "plan-list";
      plan.forEach((st) => {
        const li = document.createElement("li"), t = document.createElement("b"), d = document.createElement("span");
        t.textContent = seriesName(st.series) + " · " + LEVELS[st.lv];
        d.textContent = st.subjects.length ? st.subjects.map(subjName).join(", ") : "No subjects chosen";
        li.append(t, d); ul.appendChild(li);
      });
      planWrap.appendChild(ul);
    } else {
      const none = document.createElement("p"); none.className = "acct-msg"; none.textContent = "Not set up yet."; planWrap.appendChild(none);
    }
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn ghost small"; edit.style.justifySelf = "start"; edit.style.paddingLeft = "0";
    edit.textContent = plan.length ? "Edit exam plan" : "Set up your exam plan"; edit.addEventListener("click", () => { closePop(); openPlan(false); });
    planWrap.appendChild(edit);
    const hint = document.createElement("p"); hint.className = "acct-msg";
    hint.textContent = "Marks, PUM choices, your countdown and your theme are saved to your account too.";
    const act = document.createElement("div"); act.className = "acct-actions";
    const out = document.createElement("button"); out.type = "button"; out.className = "btn small"; out.textContent = "Sign out"; out.addEventListener("click", signOutAndClear);
    const del = document.createElement("button"); del.type = "button"; del.className = "btn ghost small danger";
    del.textContent = pop.dataset.confirm === "1" ? "Tap again to delete everything" : "Delete my saved data"; del.addEventListener("click", deleteData);
    act.append(out, del);
    pop.append(head, planWrap, rows, hint, act);
    if (msg) { const m = document.createElement("p"); m.className = "acct-msg" + (msgErr ? " err" : ""); m.textContent = msg; pop.appendChild(m); }
  }
  function openPop() { pop.dataset.confirm = ""; renderPop(); pop.hidden = false; btn.setAttribute("aria-expanded", "true"); }
  function closePop() { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  btn.addEventListener("click", () => { if (!user) signIn(); else if (pop.hidden) openPop(); else closePop(); });
  document.addEventListener("pointerdown", (e) => { if (!pop.hidden && !acct.contains(e.target)) closePop(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { closePop(); btn.focus(); } });
  // ---------- exam plan (asked after signing in) ----------
  const LEVELS = { IG: "IGCSE", AS: "AS Level", A: "A Level" };
  const FALLBACK_SERIES = [["nov26", "November 2026"], ["mar27", "March 2027 (India)"], ["jun27", "June 2027"], ["nov27", "November 2027"], ["mar28", "March 2028 (India)"], ["jun28", "June 2028"], ["nov28", "November 2028"]];
  function ui() { return window.ExamDeskUI || {}; }
  function seriesList() { const s = ui().series; return s && s.length ? s.map((x) => [x.key, x.name]) : FALLBACK_SERIES; }
  function seriesName(k) { const f = seriesList().find((x) => x[0] === k); return f ? f[1].replace(" (India)", "") : k; }
  function seriesOrder(k) { return seriesList().findIndex((x) => x[0] === k); }
  function subjectsFor(lv) { return (ui().subjects || []).filter((x) => (x.q === "IG") === (lv === "IG")); }
  function subjName(code) { const f = (ui().subjects || []).find((x) => x.code === code); return f ? f.name : code; }
  function getPlan() {
    const cd = parse("examdesk.cdsetup") || {};
    return Array.isArray(cd.plan) ? cd.plan.filter((x) => x && x.series && x.lv).map((x) => ({ series: x.series, lv: x.lv, subjects: Array.isArray(x.subjects) ? x.subjects : [] })) : [];
  }
  function skipped() { try { return sessionStorage.getItem("examdesk.planSkipped") === "1"; } catch (e) { return false; } }
  function maybeAskForPlan() {
    if (getPlan().length || skipped() || document.querySelector(".plan-back")) return;
    if (window.ExamDeskUI) openPlan(true); else window.addEventListener("examdesk-ready", () => openPlan(true), { once: true });
  }

  function openPlan(first) {
    if (document.querySelector(".plan-back")) return;
    let rows = getPlan();
    if (!rows.length) {
      const cd = parse("examdesk.cdsetup") || {};
      rows = [{ series: cd.series || "nov26", lv: cd.lv || "A", subjects: Object.keys(cd.subjects || {}).filter((k) => cd.subjects[k]) }];
    }
    const prevFocus = document.activeElement;
    const back = document.createElement("div"); back.className = "plan-back";
    const sheet = document.createElement("div"); sheet.className = "plan-sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-labelledby", "planTitle");
    back.appendChild(sheet); document.body.appendChild(back);
    document.body.style.overflow = "hidden";

    function close() { back.remove(); document.body.style.overflow = ""; try { if (prevFocus) prevFocus.focus(); } catch (e) {} document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape" && !document.querySelector(".plan-sheet .dd.open")) { skip(); } }
    function skip() { try { sessionStorage.setItem("examdesk.planSkipped", "1"); } catch (e) {} close(); }
    document.addEventListener("keydown", onKey);

    function render() {
      sheet.innerHTML = "";
      const h = document.createElement("h2"); h.id = "planTitle"; h.textContent = first ? "Welcome! What are you sitting?" : "Your exam plan";
      const p = document.createElement("p");
      p.textContent = "Add each exam series you'll take and the level you'll do in it. For example: AS Level in March 2027, then A Level in March 2028. The site uses your next sitting to set up the countdown and open each tool on your level.";
      sheet.append(h, p);
      rows.forEach((r, i) => sheet.appendChild(card(r, i)));
      const foot = document.createElement("div"); foot.className = "plan-foot";
      const add = document.createElement("button"); add.type = "button"; add.className = "btn ghost"; add.textContent = "+ Add another sitting";
      add.addEventListener("click", () => {
        const last = rows[rows.length - 1], used = rows.map((x) => x.series);
        // default to the same month a year later (e.g. AS in March 2027, then A Level in March 2028)
        const all = seriesList().map((x) => x[0]);
        const sameMonth = last ? last.series.slice(0, 3) + String(Number(last.series.slice(3)) + 1).padStart(2, "0") : "";
        const next = (all.indexOf(sameMonth) >= 0 && used.indexOf(sameMonth) < 0 ? sameMonth : null) ||
          all.find((k) => used.indexOf(k) < 0 && seriesOrder(k) > seriesOrder(last ? last.series : "")) || all.find((k) => used.indexOf(k) < 0);
        rows.push({ series: next || "nov26", lv: last && last.lv === "AS" ? "A" : (last ? last.lv : "A"), subjects: last ? last.subjects.slice() : [] });
        render();
      });
      const right = document.createElement("div"); right.className = "r";
      const sk = document.createElement("button"); sk.type = "button"; sk.className = "btn ghost"; sk.textContent = first ? "Skip for now" : "Cancel"; sk.addEventListener("click", skip);
      const sv = document.createElement("button"); sv.type = "button"; sv.className = "btn"; sv.textContent = "Save plan"; sv.addEventListener("click", savePlan);
      right.append(sk, sv);
      foot.append(add, right);
      const msg = document.createElement("p"); msg.className = "plan-msg"; msg.id = "planMsg"; msg.setAttribute("aria-live", "polite");
      sheet.append(foot, msg);
    }
    function card(r, i) {
      const c = document.createElement("div"); c.className = "plan-card";
      const head = document.createElement("div"); head.className = "plan-card-head";
      const t = document.createElement("b"); t.textContent = "Sitting " + (i + 1);
      head.appendChild(t);
      if (rows.length > 1) {
        const rm = document.createElement("button"); rm.type = "button"; rm.className = "btn ghost small danger"; rm.textContent = "Remove";
        rm.setAttribute("aria-label", "Remove sitting " + (i + 1)); rm.addEventListener("click", () => { rows.splice(i, 1); render(); });
        head.appendChild(rm);
      }
      const row = document.createElement("div"); row.className = "plan-row";
      const lab = document.createElement("label"); lab.className = "field"; lab.textContent = "Exam series";
      const sel = document.createElement("select");
      seriesList().forEach(([k, n]) => { const o = document.createElement("option"); o.value = k; o.textContent = n; sel.appendChild(o); });
      sel.value = r.series; sel.addEventListener("change", () => { r.series = sel.value; });
      lab.appendChild(sel);
      const grp = document.createElement("div"); grp.className = "ctrlgroup";
      const gl = document.createElement("span"); gl.textContent = "Level"; grp.appendChild(gl);
      const seg = document.createElement("div"); seg.className = "seg";
      ["IG", "AS", "A"].forEach((lv) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = LEVELS[lv]; b.setAttribute("aria-pressed", String(r.lv === lv));
        b.addEventListener("click", () => {
          const famChange = (lv === "IG") !== (r.lv === "IG");
          r.lv = lv; if (famChange) r.subjects = [];
          render();
        });
        seg.appendChild(b);
      });
      grp.appendChild(seg);
      row.append(lab, grp);
      const sl = document.createElement("span"); sl.className = "ctrlgroup"; const sll = document.createElement("span"); sll.textContent = "Subjects (optional)"; sl.appendChild(sll);
      const subs = document.createElement("div"); subs.className = "plan-subjs";
      subjectsFor(r.lv).forEach((x) => {
        const l = document.createElement("label"), cb = document.createElement("input"), sp = document.createElement("span");
        cb.type = "checkbox"; cb.checked = r.subjects.indexOf(x.code) >= 0;
        cb.addEventListener("change", () => { if (cb.checked) { if (r.subjects.indexOf(x.code) < 0) r.subjects.push(x.code); } else r.subjects = r.subjects.filter((y) => y !== x.code); });
        sp.textContent = x.name + " (" + x.code + ")";
        l.append(cb, sp); subs.appendChild(l);
      });
      c.append(head, row, sl, subs);
      if (ui().enhanceSelect) ui().enhanceSelect(sel);
      return c;
    }
    async function savePlan() {
      const msg = document.getElementById("planMsg");
      const keys = rows.map((x) => x.series);
      if (keys.some((k, i) => keys.indexOf(k) !== i)) { msg.textContent = "Each series can only appear once. Combine them, or pick a different series."; return; }
      const plan = rows.slice().sort((a, b) => seriesOrder(a.series) - seriesOrder(b.series)).map((x) => ({ series: x.series, lv: x.lv, subjects: x.subjects.slice() }));
      applyPlan(plan);
      msg.style.color = "var(--muted)"; msg.textContent = "Saving…";
      if (timer) clearTimeout(timer);
      await push();
      close();
      location.reload();
    }
    render();
    const first0 = sheet.querySelector("button, select, input"); if (first0) try { first0.focus(); } catch (e) {}
  }

  // Store the plan and point every tool at the next sitting.
  function applyPlan(plan) {
    const next = plan[0], fam = next.lv === "IG" ? "IG" : "AL", firstSubj = next.subjects[0];
    const cd = parse("examdesk.cdsetup") || {};
    cd.plan = plan; cd.series = next.series; cd.lv = next.lv; cd.subjects = {};
    next.subjects.forEach((c) => { cd.subjects[c] = true; });
    lsSet("examdesk.cdsetup", JSON.stringify(cd));
    const th = parse("examdesk.th2") || {};
    th.qual = next.lv; th.subj = th.subj || {}; if (firstSubj) th.subj[fam] = firstSubj;
    lsSet("examdesk.th2", JSON.stringify(th));
    const pm = parse("examdesk.pum") || {};
    pm.lv = next.lv; pm.subj = pm.subj || {}; if (firstSubj) pm.subj[fam] = firstSubj;
    lsSet("examdesk.pum", JSON.stringify(pm));
    const tm = parse("examdesk.timer");
    if (!tm || !tm.state || tm.state === "ready" || tm.state === "done") {
      const t2 = tm || {}; t2.lv = next.lv; t2.subj = t2.subj || {}; if (firstSubj) t2.subj[fam] = firstSubj; t2.state = "ready"; t2.dur = null;
      lsSet("examdesk.timer", JSON.stringify(t2));
    }
  }

  renderBtn();
}
