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
    const cd = parse("examdesk.cdsetup") || {}, ex = parse("examdesk.exams") || [];
    const lv = { IG: "IGCSE", AS: "AS Level", A: "A Level" }[cd.lv] || "Not set";
    const ser = { nov26: "November 2026", mar27: "March 2027", jun27: "June 2027" }[cd.series] || "Not set";
    const subs = Object.keys(cd.subjects || {}).filter((k) => cd.subjects[k]);
    return [["Level", lv], ["Exam series", ser], ["Subjects", subs.length ? subs.join(", ") : "None chosen"], ["Papers in countdown", String(ex.length)], ["Last saved", ago(lastSync)]];
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
    const hint = document.createElement("p"); hint.className = "acct-msg";
    hint.textContent = "Level, series and subjects come from the Exam countdown setup. Marks, PUM choices and your theme are saved too.";
    const act = document.createElement("div"); act.className = "acct-actions";
    const out = document.createElement("button"); out.type = "button"; out.className = "btn small"; out.textContent = "Sign out"; out.addEventListener("click", signOutAndClear);
    const del = document.createElement("button"); del.type = "button"; del.className = "btn ghost small danger";
    del.textContent = pop.dataset.confirm === "1" ? "Tap again to delete everything" : "Delete my saved data"; del.addEventListener("click", deleteData);
    act.append(out, del);
    pop.append(head, rows, hint, act);
    if (msg) { const m = document.createElement("p"); m.className = "acct-msg" + (msgErr ? " err" : ""); m.textContent = msg; pop.appendChild(m); }
  }
  function openPop() { pop.dataset.confirm = ""; renderPop(); pop.hidden = false; btn.setAttribute("aria-expanded", "true"); }
  function closePop() { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  btn.addEventListener("click", () => { if (!user) signIn(); else if (pop.hidden) openPop(); else closePop(); });
  document.addEventListener("pointerdown", (e) => { if (!pop.hidden && !acct.contains(e.target)) closePop(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { closePop(); btn.focus(); } });
  renderBtn();
}
