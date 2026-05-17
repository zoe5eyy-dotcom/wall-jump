/**
 * 학교 데이터: CSV F열(시도교육청명), C열(학교명) — 원본 헤더 기준
 * 동질화/서비스/현황 수치는 추후 계산 로직 연결
 */

/** Google 시트(웹 게시) CSV — pubhtml URL의 2PACX-... 키 사용 */
const GOOGLE_SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT0RLig3z4ATR6cy5Xdfi3a9uuJiS7BJdRswL_V9WlJvJtg_OHG5dL4pA3i--rz23uG1WZ7vxZRZ5sI/pub?output=csv";

const CSV_PATHS = [
  GOOGLE_SHEET_CSV,
  "data/schools.csv",
  "../원본/한국교육시설안전원_학교학구도연계정보_20260320.csv",
];

const state = {
  schoolsByRegion: new Map(),
  regions: [],
  selectedSchool: null,
  currentView: "home",
};

const VIEW_LABELS = {
  home: "홈",
  "calc-step1": "동질화 지수 계산",
  "calc-step2": "학교 현황",
  service: "서비스 이용",
  etc: "기타",
};

const $ = (sel) => document.querySelector(sel);

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function buildSchoolIndex(rows) {
  const seen = new Set();
  const byRegion = new Map();

  for (const cols of rows) {
    if (cols.length < 8) continue;
    const name = cols[2]?.trim();
    const region = cols[5]?.trim();
    if (!name || !region) continue;

    const key = `${region}|${cols[1]}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const school = {
      id: cols[1]?.trim() || "",
      name,
      level: cols[3]?.trim() || "",
      region,
      regionCode: cols[4]?.trim() || "",
      support: cols[7]?.trim() || "",
      supportCode: cols[6]?.trim() || "",
      date: cols[8]?.trim() || "",
    };

    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(school);
  }

  for (const list of byRegion.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  return byRegion;
}

async function loadSchoolData() {
  const statusEl = $("#load-status");
  const formEl = $("#school-form");
  const panelEl = $("#load-panel");

  try {
    let text = null;
    let lastErr = null;
    for (const path of CSV_PATHS) {
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!text) throw lastErr || new Error("CSV not found");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("데이터가 비어 있습니다.");

    const dataRows = lines.slice(1).map(parseCsvLine);
    state.schoolsByRegion = buildSchoolIndex(dataRows);
    state.regions = [...state.schoolsByRegion.keys()].sort((a, b) =>
      a.localeCompare(b, "ko")
    );

    populateRegions();
    panelEl.hidden = true;
    formEl.hidden = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "학교 데이터를 불러오지 못했습니다. Google 시트가 '웹에 게시'되어 있는지 확인하고, 사이트는 GitHub Pages 등 HTTPS 주소로 열어 주세요.";
    statusEl.classList.add("loading-text--error");
  }
}

function populateRegions() {
  const select = $("#region-select");
  select.innerHTML = '<option value="">시도교육청을 선택하세요</option>';
  for (const region of state.regions) {
    const opt = document.createElement("option");
    opt.value = region;
    opt.textContent = region;
    select.appendChild(opt);
  }
}

function populateSchools(region) {
  const select = $("#school-select");
  const search = $("#school-search");
  const schools = state.schoolsByRegion.get(region) || [];

  select.innerHTML = '<option value="">학교를 선택하세요</option>';
  for (const school of schools) {
    const opt = document.createElement("option");
    opt.value = school.id;
    opt.textContent = school.name;
    opt.dataset.school = JSON.stringify(school);
    select.appendChild(opt);
  }

  select.disabled = false;
  search.disabled = false;
  search.value = "";
  $("#btn-next").disabled = true;
}

function filterSchoolOptions(query) {
  const region = $("#region-select").value;
  if (!region) return;

  const select = $("#school-select");
  const schools = state.schoolsByRegion.get(region) || [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? schools.filter((s) => s.name.toLowerCase().includes(q))
    : schools;

  const prev = select.value;
  select.innerHTML = '<option value="">학교를 선택하세요</option>';
  for (const school of filtered) {
    const opt = document.createElement("option");
    opt.value = school.id;
    opt.textContent = school.name;
    opt.dataset.school = JSON.stringify(school);
    select.appendChild(opt);
  }

  if (filtered.some((s) => s.id === prev)) {
    select.value = prev;
  }
  updateNextButton();
}

function getSelectedSchoolFromSelect() {
  const select = $("#school-select");
  const opt = select.selectedOptions[0];
  if (!opt?.dataset.school) return null;
  return JSON.parse(opt.dataset.school);
}

function updateNextButton() {
  $("#btn-next").disabled = !getSelectedSchoolFromSelect();
}

function showView(viewId) {
  state.currentView = viewId;
  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("view--active", el.dataset.view === viewId);
  });
  updateBreadcrumb();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateBreadcrumb() {
  const bc = $("#breadcrumb");
  const parts = [{ label: "홈", view: "home" }];

  if (state.currentView === "calc-step1" || state.currentView === "calc-step2") {
    parts.push({ label: "동질화 지수 계산", view: "calc-step1" });
  }
  if (state.currentView === "calc-step2") {
    parts.push({ label: "학교 현황", view: null });
  }
  if (state.currentView === "service") {
    parts.push({ label: "서비스 이용", view: null });
  }
  if (state.currentView === "etc") {
    parts.push({ label: "기타", view: null });
  }

  bc.innerHTML = parts
    .map((p, i) => {
      const sep = i > 0 ? ' <span aria-hidden="true">›</span> ' : "";
      if (p.view && i < parts.length - 1) {
        return `${sep}<a href="#" data-nav="${p.view}">${p.label}</a>`;
      }
      return `${sep}<span>${p.label}</span>`;
    })
    .join("");
}

function renderDashboard(school) {
  state.selectedSchool = school;
  $("#dashboard-title").textContent = school.name;

  $("#school-summary").innerHTML = `
    <h2>${escapeHtml(school.name)}</h2>
    <p>${escapeHtml(school.region)} · ${escapeHtml(school.support)}</p>
  `;

  const items = [
    ["학교급", school.level],
    ["시도교육청", school.region],
    ["교육지원청", school.support],
    ["데이터 기준일", school.date || "—"],
  ];

  $("#school-info-list").innerHTML = items
    .map(
      ([label, value]) =>
        `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`
    )
    .join("");

  $("#metric-homogenization").textContent = "—";
  $("#metric-service").textContent = "—";
  $("#metric-status").textContent = "—";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bindEvents() {
  document.body.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      e.preventDefault();
      const target = nav.dataset.nav;
      if (target === "calc-step1" && state.schoolsByRegion.size === 0) {
        loadSchoolData();
      }
      showView(target);
    }
  });

  $("#btn-home").addEventListener("click", () => showView("home"));

  $("#region-select").addEventListener("change", (e) => {
    const region = e.target.value;
    if (region) {
      populateSchools(region);
    } else {
      $("#school-select").disabled = true;
      $("#school-search").disabled = true;
      $("#btn-next").disabled = true;
    }
  });

  $("#school-select").addEventListener("change", updateNextButton);

  $("#school-search").addEventListener("input", (e) => {
    filterSchoolOptions(e.target.value);
  });

  $("#school-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const school = getSelectedSchoolFromSelect();
    if (!school) return;
    renderDashboard(school);
    showView("calc-step2");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  updateBreadcrumb();
  loadSchoolData();
});
