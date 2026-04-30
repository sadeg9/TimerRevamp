// ══════════════════════════════════════
//  Firebase
// ══════════════════════════════════════
const firebaseConfig = {
    apiKey: "AIzaSyAPRz1u4IY72v3SGtvlU0MNbCbNo_rVGmI",
    authDomain: "timerdata-29980.firebaseapp.com",
    projectId: "timerdata-29980",
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();
  
  // ══════════════════════════════════════
  //  Shared State
  // ══════════════════════════════════════
  let allEntries   = [];
  let selectedTag  = null;
  let selectedRange = 7;       // days; null = all time
  let charts       = {};
  let heatmapCells = [];
  
  // ══════════════════════════════════════
  //  Helpers
  // ══════════════════════════════════════
  function fmtHours(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
  
  function fmtDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(sec % 60)).padStart(2, "0");
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  }
  
  function fmtTimer(ms) {
    const t = Math.floor(ms / 1000);
    const h = String(Math.floor(t / 3600)).padStart(2, "0");
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
    const s = String(t % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  
  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }
  
  function entriesInRange(entries, rangeDays) {
    if (!rangeDays) return entries;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    cutoff.setHours(0, 0, 0, 0);
    return entries.filter(e => e.timestamp.toDate() >= cutoff);
  }
  
  function weekKey(date) {
    const d = new Date(date);
    const dow = d.getDay();
    d.setDate(d.getDate() - dow);
    d.setHours(0, 0, 0, 0);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  
  function getSemesterLabel() {
    const m = new Date().getMonth();
    const y = new Date().getFullYear();
    if (m <= 4) return `Spring ${y} semester`;
    if (m <= 7) return `Summer ${y} semester`;
    return `Fall ${y} semester`;
  }
  
  // ══════════════════════════════════════
  //  Navigation
  // ══════════════════════════════════════
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.getElementById(`view-${view}`).classList.add("active");
  
      // Lazy render analytics when switching to it
      if (view === "analytics" && allEntries.length) renderAll();
    });
  });
  
  // ══════════════════════════════════════
  //  Auth
  // ══════════════════════════════════════
  const loginBtn = document.getElementById("loginBtn");
  
  loginBtn.onclick = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
  };
  
  auth.onAuthStateChanged(user => {
    if (user) {
      loginBtn.textContent = "Signed in";
      loginBtn.disabled = true;
      document.getElementById("signInHint").style.display = "none";
      document.getElementById("semesterLabel").textContent = getSemesterLabel();
      showDashboard();
      loadEntries();
    } else {
      loginBtn.textContent = "Sign in";
      loginBtn.disabled = false;
      document.getElementById("signInHint").style.display = "";
      hideDashboard();
    }
  });
  
  function showDashboard() {
    document.getElementById("authGate").style.display = "none";
    document.getElementById("dashboard").classList.remove("hidden");
  }
  
  function hideDashboard() {
    document.getElementById("authGate").style.display = "";
    document.getElementById("dashboard").classList.add("hidden");
  }
  
  // ══════════════════════════════════════
  //  Timer
  // ══════════════════════════════════════
  const clockEl    = document.getElementById("clock");
  const timerStatus = document.getElementById("timerStatus");
  const startBtn   = document.getElementById("startBtn");
  const stopBtn    = document.getElementById("stopBtn");
  const classSelect = document.getElementById("classSelect");
  
  let startTime = null;
  let interval  = null;
  
  startBtn.onclick = () => {
    if (!classSelect.value || interval) return;
    startTime = Date.now();
    timerStatus.textContent = "Running";
    timerStatus.className = "timer-status running";
    interval = setInterval(() => {
      clockEl.textContent = fmtTimer(Date.now() - startTime);
    }, 1000);
  };
  
  stopBtn.onclick = async () => {
    if (!startTime || !classSelect.value) return;
    clearInterval(interval);
    interval = null;
  
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    clockEl.textContent = "00:00:00";
    startTime = null;
    timerStatus.textContent = "Saved";
    timerStatus.className = "timer-status saved";
    setTimeout(() => {
      timerStatus.textContent = "Ready";
      timerStatus.className = "timer-status";
    }, 2000);
  
    const classes = getClasses();
    const selectedClass = classes[classSelect.value];
    const user = auth.currentUser;
    if (!user) return;
  
    await db.collection("entries").add({
      uid: user.uid,
      className: selectedClass.name,
      tag: selectedClass.tag,
      seconds: elapsedSeconds,
      timestamp: new Date(),
    });
  
    loadEntries();
  };
  
  // ══════════════════════════════════════
  //  Classes (localStorage)
  // ══════════════════════════════════════
  const manageClassesBtn = document.getElementById("manageClassesBtn");
  const classModal       = document.getElementById("classModal");
  const addClassBtn      = document.getElementById("addClassBtn");
  const closeModalBtn    = document.getElementById("closeModalBtn");
  const classNameInput   = document.getElementById("classNameInput");
  const classTagInput    = document.getElementById("classTagInput");
  const classListEl      = document.getElementById("classList");
  
  function getClasses() {
    return JSON.parse(localStorage.getItem("classes") || "[]");
  }
  
  function saveClasses(classes) {
    localStorage.setItem("classes", JSON.stringify(classes));
  }
  
  function loadClasses() {
    const classes = getClasses();
    classSelect.innerHTML = `<option value="">Select a class</option>`;
    classListEl.innerHTML = "";
  
    classes.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${c.name} (${c.tag})`;
      classSelect.appendChild(opt);
  
      const div = document.createElement("div");
      div.className = "modal-list-item";
      div.innerHTML = `
        <span>
          <span class="modal-list-item-name">${c.name}</span>
          <span class="modal-list-item-tag">${c.tag}</span>
        </span>
        <button class="modal-delete-btn" onclick="deleteClass(${i})">✕</button>
      `;
      classListEl.appendChild(div);
    });
  }
  
  addClassBtn.onclick = () => {
    const name = classNameInput.value.trim();
    const tag  = classTagInput.value.trim();
    if (!name || !tag) return;
    const classes = getClasses();
    classes.push({ name, tag });
    saveClasses(classes);
    classNameInput.value = "";
    classTagInput.value  = "";
    loadClasses();
  };
  
  window.deleteClass = i => {
    const classes = getClasses();
    classes.splice(i, 1);
    saveClasses(classes);
    loadClasses();
  };
  
  manageClassesBtn.onclick = () => classModal.classList.remove("hidden");
  closeModalBtn.onclick    = () => classModal.classList.add("hidden");
  classModal.addEventListener("click", e => {
    if (e.target === classModal) classModal.classList.add("hidden");
  });
  
  loadClasses();
  
  // ══════════════════════════════════════
  //  Load Entries from Firestore
  // ══════════════════════════════════════
  async function loadEntries() {
    const user = auth.currentUser;
    if (!user) return;
  
    const snap = await db.collection("entries")
      .where("uid", "==", user.uid)
      .orderBy("timestamp", "desc")
      .get();
  
    allEntries = snap.docs.map(doc => doc.data());
  
    renderRecentSessions();
    buildTagPills();
    generateHeatmap(365);
    renderAll();
  }
  
  // ══════════════════════════════════════
  //  Recent Sessions (Timer view)
  // ══════════════════════════════════════
  function renderRecentSessions() {
    const list = document.getElementById("recentList");
    list.innerHTML = "";
  
    if (!allEntries.length) {
      list.innerHTML = `<div style="color:var(--text-3);font-size:13px;padding:8px 0">No sessions yet. Start the timer!</div>`;
      return;
    }
  
    allEntries.slice(0, 6).forEach(e => {
      const d = e.timestamp.toDate();
      const dateStr = d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
      const timeStr = d.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" });
  
      const item = document.createElement("div");
      item.className = "recent-item";
      item.innerHTML = `
        <div class="recent-item-left">
          <span class="recent-item-class">${e.className}</span>
          <span class="recent-item-tag">${e.tag}</span>
          <div class="recent-item-date">${dateStr} · ${timeStr}</div>
        </div>
        <span class="recent-item-dur">${fmtHours(e.seconds)}</span>
      `;
      list.appendChild(item);
    });
  }
  
  // ══════════════════════════════════════
  //  Analytics: Tag Pills
  // ══════════════════════════════════════
  function buildTagPills() {
    const tags = [...new Set(allEntries.map(e => e.tag).filter(Boolean))].sort();
    const container = document.getElementById("tagPills");
    container.innerHTML = "";
  
    tags.forEach((tag, i) => {
      const pill = document.createElement("button");
      pill.className = "tag-pill" + (i === 0 ? " active" : "");
      pill.textContent = tag;
      pill.dataset.tag = tag;
      pill.onclick = () => {
        document.querySelectorAll(".tag-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        selectedTag = tag;
        renderTagCharts();
      };
      container.appendChild(pill);
    });
  
    selectedTag = tags[0] || null;
  }
  
  // ══════════════════════════════════════
  //  Analytics: Range Selector
  // ══════════════════════════════════════
  document.getElementById("rangeSelector").addEventListener("click", e => {
    const btn = e.target.closest(".range-btn");
    if (!btn) return;
    document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedRange = btn.dataset.range === "all" ? null : parseInt(btn.dataset.range);
    renderAll();
  });
  
  // ══════════════════════════════════════
  //  Analytics: Render All
  // ══════════════════════════════════════
  function renderAll() {
    renderOverview();
    renderTagCharts();
    updateHeatmap(allEntries);
  }
  
  // ══════════════════════════════════════
  //  Chart Defaults
  // ══════════════════════════════════════
  Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
  Chart.defaults.font.size   = 12;
  Chart.defaults.color       = "#9a9a9a";
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = "#111";
  Chart.defaults.plugins.tooltip.titleColor = "#fff";
  Chart.defaults.plugins.tooltip.bodyColor  = "#ccc";
  Chart.defaults.plugins.tooltip.padding    = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.borderWidth  = 0;
  
  const C_FILL   = "rgba(124,111,224,0.72)";
  const C_AREA   = "rgba(124,111,224,0.13)";
  const C_LINE   = "rgba(124,111,224,1)";
  const SCALE_X  = { grid: { display: false }, border: { display: false }, ticks: { color: "#9a9a9a" } };
  const SCALE_Y  = { grid: { color: "rgba(0,0,0,0.05)", drawBorder: false }, border: { display: false }, ticks: { color: "#9a9a9a" } };
  
  function destroyChart(key) {
    if (charts[key]) { charts[key].destroy(); charts[key] = null; }
  }
  
  // ══════════════════════════════════════
  //  Overview
  // ══════════════════════════════════════
  function renderOverview() {
    const now = new Date();
  
    // — Total this week —
    const weekCutoff = new Date(now); weekCutoff.setDate(now.getDate() - 7); weekCutoff.setHours(0,0,0,0);
    const weekEntries = allEntries.filter(e => e.timestamp.toDate() >= weekCutoff);
    const weekTotal   = weekEntries.reduce((s, e) => s + e.seconds, 0);
  
    const prevCutoff = new Date(now); prevCutoff.setDate(now.getDate() - 14); prevCutoff.setHours(0,0,0,0);
    const prevWeek   = allEntries.filter(e => { const d = e.timestamp.toDate(); return d >= prevCutoff && d < weekCutoff; });
    const prevTotal  = prevWeek.reduce((s, e) => s + e.seconds, 0);
    const diff       = weekTotal - prevTotal;
  
    document.getElementById("cardTotalWeek").textContent = fmtHours(weekTotal);
    const subWeek = document.getElementById("cardTotalWeekSub");
    if (prevTotal > 0) {
      subWeek.textContent  = diff >= 0 ? `↑ ${fmtHours(Math.abs(diff))} from last week` : `↓ ${fmtHours(Math.abs(diff))} from last week`;
      subWeek.className    = "stat-sub " + (diff >= 0 ? "up" : "down");
    }
  
    // — Streak —
    const streak = computeStreak(allEntries);
    document.getElementById("cardStreak").textContent    = `${streak.current} day${streak.current !== 1 ? "s" : ""}`;
    document.getElementById("cardStreakSub").textContent  = `Best: ${streak.best} day${streak.best !== 1 ? "s" : ""}`;
  
    // — Top class —
    const classTotals = {};
    allEntries.forEach(e => { classTotals[e.className] = (classTotals[e.className] || 0) + e.seconds; });
    const topClass = Object.entries(classTotals).sort((a,b) => b[1]-a[1])[0];
    document.getElementById("cardTopClass").textContent   = topClass ? topClass[0] : "–";
    if (topClass) {
      const thisWeekSec = weekEntries.filter(e => e.className === topClass[0]).reduce((s,e) => s+e.seconds, 0);
      document.getElementById("cardTopClassSub").textContent = `${fmtHours(thisWeekSec)} this week`;
    }
  
    // — Avg session (range) —
    const rangeEntries = entriesInRange(allEntries, selectedRange);
    const avgSec = rangeEntries.length ? rangeEntries.reduce((s,e) => s+e.seconds, 0) / rangeEntries.length : 0;
    document.getElementById("cardAvgSession").textContent = fmtHours(avgSec);
  
    if (selectedRange) {
      const rCutoff = new Date(); rCutoff.setDate(rCutoff.getDate() - selectedRange); rCutoff.setHours(0,0,0,0);
      const prCutoff = new Date(); prCutoff.setDate(prCutoff.getDate() - selectedRange*2); prCutoff.setHours(0,0,0,0);
      const prevR = allEntries.filter(e => { const d = e.timestamp.toDate(); return d >= prCutoff && d < rCutoff; });
      const prevAvg = prevR.length ? prevR.reduce((s,e)=>s+e.seconds,0)/prevR.length : 0;
      if (prevAvg > 0) {
        const dAvg = avgSec - prevAvg;
        const subAvg = document.getElementById("cardAvgSessionSub");
        subAvg.textContent = dAvg >= 0 ? `↑ ${fmtHours(Math.abs(dAvg))} from last period` : `↓ ${fmtHours(Math.abs(dAvg))} from last period`;
        subAvg.className   = "stat-sub " + (dAvg >= 0 ? "up" : "down");
      }
    }
  
    renderDailyBar();
  }
  
  function computeStreak(entries) {
    const daySet = new Set(entries.map(e => localDateKey(e.timestamp.toDate())));
    let current = 0, best = 0, run = 0;
    const today = new Date();
    for (let i = 0; i < 366; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      if (daySet.has(localDateKey(d))) {
        run++;
        if (i === 0 || run > 1) current = run;
      } else {
        if (i === 0) current = 0;
        best = Math.max(best, run);
        run = 0;
      }
    }
    best = Math.max(best, run, current);
    return { current, best };
  }
  
  function renderDailyBar() {
    const today   = new Date();
    const labels  = [];
    const days    = [];
    const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      days.push(localDateKey(d));
      labels.push(DAY_NAMES[d.getDay()]);
    }
  
    const totals = {};
    allEntries.forEach(e => {
      const k = localDateKey(e.timestamp.toDate());
      totals[k] = (totals[k] || 0) + e.seconds;
    });
  
    const data = days.map(d => +((totals[d] || 0) / 3600).toFixed(2));
    const todayKey = localDateKey(today);
    const bgs = days.map(d => d === todayKey ? "rgba(124,111,224,0.38)" : C_FILL);
  
    if (charts.daily) {
      charts.daily.data.labels = labels;
      charts.daily.data.datasets[0].data = data;
      charts.daily.data.datasets[0].backgroundColor = bgs;
      charts.daily.update();
      return;
    }
  
    charts.daily = new Chart(document.getElementById("dailyBarChart"), {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: bgs, borderRadius: 6, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => `${c.parsed.y.toFixed(1)}h` } } },
        scales: {
          x: SCALE_X,
          y: { ...SCALE_Y, ticks: { ...SCALE_Y.ticks, callback: v => v + "h" } }
        }
      }
    });
  }
  
  // ══════════════════════════════════════
  //  Tag Charts
  // ══════════════════════════════════════
  function renderTagCharts() {
    if (!selectedTag) return;
    document.getElementById("tagContextName").textContent  = selectedTag;
    document.getElementById("tagBarTitle").textContent     = `Time by class — ${selectedTag}`;
    document.getElementById("tagLineTitle").textContent    = `${selectedTag} over time — weekly totals`;
  
    const rangeEntries = entriesInRange(allEntries, selectedRange);
    const tagEntries   = rangeEntries.filter(e => e.tag === selectedTag);
  
    renderTagBar(tagEntries);
    renderDist(tagEntries);
    renderTagLine(tagEntries);
  }
  
  function renderTagBar(tagEntries) {
    const totals = {};
    tagEntries.forEach(e => { totals[e.className] = (totals[e.className] || 0) + e.seconds; });
    const sorted = Object.entries(totals).sort((a,b) => b[1]-a[1]);
    const labels = sorted.map(([n]) => n);
    const data   = sorted.map(([,s]) => +(s/3600).toFixed(2));
  
    if (charts.tagBar) {
      charts.tagBar.data.labels = labels;
      charts.tagBar.data.datasets[0].data = data;
      charts.tagBar.update();
      return;
    }
  
    charts.tagBar = new Chart(document.getElementById("tagBarChart"), {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: C_FILL, borderRadius: 4, borderSkipped: false }] },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => `${c.parsed.x.toFixed(1)}h` } } },
        scales: {
          x: { ...SCALE_Y, ticks: { color: "#9a9a9a", callback: v => v + "h" } },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: "#555", font: { size: 12 } } }
        }
      }
    });
  }
  
  function renderDist(tagEntries) {
    const buckets = [0, 0, 0, 0];
    tagEntries.forEach(e => {
      const m = e.seconds / 60;
      if (m < 30) buckets[0]++;
      else if (m < 60) buckets[1]++;
      else if (m < 120) buckets[2]++;
      else buckets[3]++;
    });
  
    if (charts.dist) {
      charts.dist.data.datasets[0].data = buckets;
      charts.dist.update();
      return;
    }
  
    charts.dist = new Chart(document.getElementById("distChart"), {
      type: "bar",
      data: {
        labels: ["<30m", "30–60m", "1–2h", ">2h"],
        datasets: [{ data: buckets, backgroundColor: C_FILL, borderRadius: 6, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => `${c.parsed.y} sessions` } } },
        scales: {
          x: SCALE_X,
          y: { ...SCALE_Y, ticks: { color: "#9a9a9a", stepSize: 1 } }
        }
      }
    });
  }
  
  function renderTagLine(tagEntries) {
    const weekTotals = {};
    tagEntries.forEach(e => {
      const k = weekKey(e.timestamp.toDate());
      weekTotals[k] = (weekTotals[k] || 0) + e.seconds;
    });
  
    let sorted = Object.entries(weekTotals).sort((a,b) => a[0].localeCompare(b[0]));
  
    // Fill gaps
    if (sorted.length > 1) {
      const filled = [];
      const cur = new Date(sorted[0][0]);
      const last = new Date(sorted[sorted.length-1][0]);
      while (cur <= last) {
        const k = localDateKey(cur);
        filled.push([k, weekTotals[k] || 0]);
        cur.setDate(cur.getDate() + 7);
      }
      sorted = filled;
    }
  
    const labels = sorted.map(([k]) => {
      const d = new Date(k);
      const ago = Math.round((Date.now() - d.getTime()) / (7*24*3600*1000));
      return ago === 0 ? "This wk" : `${ago}w ago`;
    });
    const data = sorted.map(([,s]) => +(s/3600).toFixed(2));
  
    if (charts.tagLine) {
      charts.tagLine.data.labels = labels;
      charts.tagLine.data.datasets[0].data = data;
      charts.tagLine.update();
      return;
    }
  
    charts.tagLine = new Chart(document.getElementById("tagLineChart"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          data,
          borderColor: C_LINE,
          backgroundColor: C_AREA,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: C_LINE,
          fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => `${c.parsed.y.toFixed(1)}h` } } },
        scales: {
          x: { ...SCALE_X, ticks: { color: "#9a9a9a", maxTicksLimit: 10 } },
          y: { ...SCALE_Y, ticks: { color: "#9a9a9a", callback: v => v + "h" } }
        }
      }
    });
  }
  
  // ══════════════════════════════════════
  //  Heatmap
  // ══════════════════════════════════════
  const calTooltip = document.getElementById("calTooltip");
  
  function generateHeatmap(days) {
    if (heatmapCells.length) return; // already built
  
    const grid      = document.getElementById("heatmapGrid");
    const monthsEl  = document.getElementById("heatmapMonths");
    grid.innerHTML    = "";
    monthsEl.innerHTML = "";
    heatmapCells = [];
  
    const today     = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (days - 1));
    const firstDow  = startDate.getDay();
    const totalCols = Math.ceil((days + firstDow) / 7);
  
    // Month labels
    let lastMonth = null;
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate); d.setDate(startDate.getDate() + i);
      const mon = d.toLocaleString("default", { month: "short" });
      if (mon !== lastMonth) {
        const col = Math.floor((i + firstDow) / 7) + 1;
        const div = document.createElement("div");
        div.textContent = mon;
        div.style.gridColumnStart = col;
        monthsEl.appendChild(div);
        lastMonth = mon;
      }
    }
    monthsEl.style.gridTemplateColumns = `repeat(${totalCols}, 16px)`;
    grid.style.gridTemplateColumns     = `repeat(${totalCols}, 13px)`;
  
    for (let col = 0; col < totalCols; col++) {
      for (let row = 0; row < 7; row++) {
        const offset = col * 7 + row - firstDow;
        const cell   = document.createElement("div");
        cell.classList.add("day");
  
        if (offset >= 0 && offset < days) {
          const d = new Date(startDate); d.setDate(startDate.getDate() + offset);
          cell.dataset.date  = localDateKey(d);
          cell._label        = d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
          cell._hours        = 0;
          cell.addEventListener("mousemove", ev => {
            calTooltip.textContent   = `${cell._label} — ${cell._hours.toFixed(1)}h`;
            calTooltip.style.left    = ev.clientX + 12 + "px";
            calTooltip.style.top     = ev.clientY + 12 + "px";
            calTooltip.style.opacity = "1";
          });
          cell.addEventListener("mouseleave", () => { calTooltip.style.opacity = "0"; });
        } else {
          cell.style.visibility = "hidden";
        }
  
        heatmapCells.push(cell);
        grid.appendChild(cell);
      }
    }
  }
  
  function updateHeatmap(entries) {
    const dayTotals = {};
    entries.forEach(e => {
      const k = localDateKey(e.timestamp.toDate());
      dayTotals[k] = (dayTotals[k] || 0) + e.seconds;
    });
    const maxSec = Math.max(...Object.values(dayTotals), 1);
  
    heatmapCells.forEach(cell => {
      const k = cell.dataset.date;
      if (!k) return;
      const sec = dayTotals[k] || 0;
      cell._hours = sec / 3600;
      const t = sec / maxSec;
      cell.style.background = t === 0 ? "var(--cell-empty)" : `rgba(124,111,224,${(0.2 + t * 0.8).toFixed(2)})`;
    });
  }
  
  // Initialise heatmap structure immediately so it's ready before data loads
  generateHeatmap(365);