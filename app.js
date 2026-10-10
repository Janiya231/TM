// ================================
// SUPABASE AUTHENTICATION
// ================================

const SUPABASE_URL = "https://jtkssszetwndxkftchua.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wVtjYyCvyc2CrT-G-WcDwQ_dTwhoFMi";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);

const passwordLock = $("password-lock");
const passwordForm = $("password-form");
const emailInput = $("email-input");
const passwordInput = $("password-input");
const signupBtn = $("signup-btn");
const passwordBtn = $("password-btn");
const passwordError = $("password-error");
const lockHelp = $("lock-help");

let currentUser = null;
let authReady = false;
let realtimeChannel = null;
let saveInProgress = false;
let queuedSave = false;
let tasks = [];

function showLogin(message = "") {
  passwordLock.classList.remove("unlocked");
  passwordError.textContent = message;
  passwordBtn.disabled = false;
  signupBtn.disabled = false;
  setTimeout(() => emailInput.focus(), 30);
}

function setAuthBusy(busy) {
  passwordBtn.disabled = busy;
  signupBtn.disabled = busy;
}

async function signIn(e) {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return;
  passwordError.textContent = "";
  setAuthBusy(true);
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    passwordError.textContent = error.message;
    setAuthBusy(false);
  }
}

async function signUp() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    passwordError.textContent = "Enter an email and password first.";
    return;
  }
  if (password.length < 6) {
    passwordError.textContent = "Password must be at least 6 characters.";
    return;
  }
  passwordError.textContent = "";
  setAuthBusy(true);
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    passwordError.textContent = error.message;
    setAuthBusy(false);
    return;
  }
  if (data.session) {
    passwordError.textContent = "";
  } else {
    passwordError.textContent = "Account created. Check your email to confirm, then sign in.";
    setAuthBusy(false);
  }
}

passwordForm.addEventListener("submit", signIn);
signupBtn.addEventListener("click", signUp);

async function initializeAuthenticatedApp(session) {
  currentUser = session.user;
  authReady = true;
  passwordLock.classList.add("unlocked");
  passwordInput.value = "";
  passwordError.textContent = "";
  setAuthBusy(false);
  lockHelp.textContent = `Signed in as ${currentUser.email}`;
  await loadTasksFromCloud();
  setupRealtimeSync();
  renderApp();
}

async function handleSignOut() {
  if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = null;
  currentUser = null;
  authReady = false;
  tasks = [];
  AnalyticsEngine.invalidate();
  await supabaseClient.auth.signOut();
  lockHelp.textContent = "Sign in to sync your tasks across your devices.";
  emailInput.value = "";
  passwordInput.value = "";
  showLogin();
}

/* ==================================================
   STUDY TASK BOARD - RECURRING FIXED SCHEDULE ENGINE
   - Auto-repeats weekly upon completion until 2028-08-10
   - Chemistry Live Class automatically expires Nov 2026
================================================== */

const END_SCHEDULE_DATE = "2028-08-10";
const CHEM_CLASS_END_DATE = "2026-11-07"; // First week of November 2026

// Definition of all repeating fixed schedule templates
const fixedTaskDefinitions = [
  // MONDAYS (1)
  { title: "Advanced Theory live class Chemistry", subject: "Chemistry", dayOfWeek: 1, priority: "High" },
  { title: "Revise Chemistry Class", subject: "Chemistry", dayOfWeek: 1, priority: "Medium" },
  { title: "Morning Sum", subject: "Mathematics", dayOfWeek: 1, priority: "Medium" },
  { title: "Morning Sum Discussion", subject: "Mathematics", dayOfWeek: 1, priority: "Medium" },
  { title: "Chemistry Live Class", subject: "Chemistry", dayOfWeek: 1, priority: "High", endDate: CHEM_CLASS_END_DATE },

  // TUESDAYS (2)
  { title: "Morning Sum", subject: "Mathematics", dayOfWeek: 2, priority: "Medium" },
  { title: "Morning Sum Discussion", subject: "Mathematics", dayOfWeek: 2, priority: "Medium" },
  { title: "Physics Last Week Revise", subject: "Physics", dayOfWeek: 2, priority: "Medium" },
  { title: "Physics Hw discussion", subject: "Physics", dayOfWeek: 2, priority: "High" },

  // WEDNESDAYS (3)
  { title: "Morning Sum", subject: "Mathematics", dayOfWeek: 3, priority: "Medium" },
  { title: "Morning Sum Discussion", subject: "Mathematics", dayOfWeek: 3, priority: "Medium" },
  { title: "Physics Hw", subject: "Physics", dayOfWeek: 3, priority: "High" },
  { title: "Daily Dose", subject: "Other", dayOfWeek: 3, priority: "Medium" },
  { title: "Physics Last Week Revise", subject: "Physics", dayOfWeek: 3, priority: "Medium" },

  // THURSDAYS (4)
  { title: "Morning Sum", subject: "Mathematics", dayOfWeek: 4, priority: "Medium" },
  { title: "Morning Sum Discussion", subject: "Mathematics", dayOfWeek: 4, priority: "Medium" },
  { title: "Physics Last Week Revise", subject: "Physics", dayOfWeek: 4, priority: "Medium" },
  { title: "Physics Reverse class", subject: "Physics", dayOfWeek: 4, priority: "High" },

  // FRIDAYS (5)
  { title: "Morning Sum", subject: "Mathematics", dayOfWeek: 5, priority: "Medium" },
  { title: "Morning Sum Discussion", subject: "Mathematics", dayOfWeek: 5, priority: "Medium" },
  { title: "Chemistry & Physics Paper Day", subject: "Other", dayOfWeek: 5, priority: "High" },
  { title: "Chemistry Paper Discussion", subject: "Chemistry", dayOfWeek: 5, priority: "High" },

  // SATURDAYS (6)
  { title: "Physics Live Class", subject: "Physics", dayOfWeek: 6, priority: "High" },
  { title: "Physics Paper Discussion", subject: "Physics", dayOfWeek: 6, priority: "High" },
  { title: "Combined Maths Home works", subject: "Mathematics", dayOfWeek: 6, priority: "High" },
  { title: "Physics Revise", subject: "Physics", dayOfWeek: 6, priority: "Medium" },

  // SUNDAYS (0)
  { title: "Combined Maths Live Class", subject: "Mathematics", dayOfWeek: 0, priority: "High" },
  { title: "Combined Maths Revise", subject: "Mathematics", dayOfWeek: 0, priority: "Medium" },
  { title: "Chemistry Weekly Review Advanved theory", subject: "Chemistry", dayOfWeek: 0, priority: "High" }
];

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getRelativeDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return toDateKey(date);
}

function daysBetween(fromKey, toKey) {
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000);
}

function getNextDateForDay(targetDayOfWeek, fromDate = new Date()) {
  const result = new Date(fromDate);
  const currentDay = result.getDay();
  let distance = targetDayOfWeek - currentDay;
  if (distance < 0) distance += 7;
  result.setDate(result.getDate() + distance);
  return toDateKey(result);
}

function getDayName(dayIndex) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayIndex];
}

// ---- Repeat patterns -------------------------------------------------
// A recurring task repeats on a set of weekdays (0 = Sunday ... 6 = Saturday).
// Older tasks only have `dayOfWeek`, which counts as a set of one day.
const REPEAT_PRESETS = {
  daily: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [6, 0]
};
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function repeatDaysOf(task) {
  if (Array.isArray(task.repeatDays) && task.repeatDays.length) return task.repeatDays;
  return Number.isInteger(task.dayOfWeek) ? [task.dayOfWeek] : [];
}

function sameDaySet(a, b) {
  return a.length === b.length && a.every((d) => b.includes(d));
}

function describeRepeat(days) {
  if (sameDaySet(days, REPEAT_PRESETS.daily)) return "Every day";
  if (sameDaySet(days, REPEAT_PRESETS.weekdays)) return "Every week day";
  if (sameDaySet(days, REPEAT_PRESETS.weekends)) return "Every weekend day";
  if (days.length === 1) return `Every ${getDayName(days[0])}`;
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  return `Every ${order.map((d) => DAY_SHORT[d]).join(", ")}`;
}

// First date on or after `fromDate` that falls on one of `days`
function getNextDateInSet(days, fromDate = new Date()) {
  const d = new Date(fromDate);
  for (let i = 0; i < 7; i++) {
    if (days.includes(d.getDay())) return toDateKey(d);
    d.setDate(d.getDate() + 1);
  }
  return toDateKey(fromDate);
}

// The occurrence after `dateKey` (always at least one day later)
function getFollowingDate(days, dateKey) {
  const d = parseDateKey(dateKey);
  for (let i = 0; i < 7; i++) {
    d.setDate(d.getDate() + 1);
    if (days.includes(d.getDay())) return toDateKey(d);
  }
  return toDateKey(d);
}

// The cloud table only has a single integer `day_of_week` column. Single-day
// tasks keep their plain 0-6 value; multi-day patterns are stored as 100 + a
// bitmask of the days, so no database change is needed.
function encodeRepeatDays(task) {
  const days = repeatDaysOf(task);
  if (days.length <= 1) return Number.isInteger(task.dayOfWeek) ? task.dayOfWeek : null;
  return 100 + days.reduce((mask, d) => mask | (1 << d), 0);
}

function decodeRepeatDays(value) {
  if (!Number.isInteger(value)) return { dayOfWeek: null, repeatDays: undefined };
  if (value < 100) return { dayOfWeek: value, repeatDays: undefined };
  const mask = value - 100;
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => mask & (1 << d));
  const first = [1, 2, 3, 4, 5, 6, 0].find((d) => days.includes(d));
  return { dayOfWeek: first ?? null, repeatDays: days };
}

/* ==================================================
   WEEKLY PLANNER - DATA MODEL
   Every task keeps three extra fields:
     durationMinutes  how long it takes (default 30)
     scheduledDate    "YYYY-MM-DD" it is planned for, or null
     startTime        "HH:MM" (24h) it starts at, or null
   dueDate stays the deadline; scheduledDate is when you plan to do it.
================================================== */

const PLANNER_DAY_START = 4 * 60 + 30;   // 4:30 AM, in minutes from midnight
const PLANNER_DAY_END = 23 * 60;    // 11:00 PM
const PLANNER_STEP = 30;            // grid and snap size in minutes
const PLANNER_SLOTS = (PLANNER_DAY_END - PLANNER_DAY_START) / PLANNER_STEP; // 37
const DEFAULT_DURATION = 30;
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 150, 180];
const PLANNER_LOCAL_KEY = "study_planner_v1";

// The cloud table needs duration_minutes, scheduled_date and start_time columns.
// Until they exist we fall back to keeping planner data on this device.
let plannerColumnsOk = true;
let plannerLocalCache = null;

function timeToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutesToTime(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatClock(total) {
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

// Safe defaults for tasks created before the planner existed
function ensurePlannerFields(task) {
  const dur = Math.round(Number(task.durationMinutes));
  task.durationMinutes = dur >= 5 && dur <= 480 ? dur : DEFAULT_DURATION;

  const date = typeof task.scheduledDate === "string" ? task.scheduledDate.slice(0, 10) : "";
  const start = timeToMinutes(task.startTime);
  const fits = /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    start !== null &&
    start >= PLANNER_DAY_START &&
    start + task.durationMinutes <= PLANNER_DAY_END;

  task.scheduledDate = fits ? date : null;
  task.startTime = fits ? minutesToTime(start) : null;
  return task;
}

function isScheduled(task) {
  return Boolean(task.scheduledDate && task.startTime);
}

function shiftDateKey(key, days) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

function readPlannerLocal() {
  try { return JSON.parse(localStorage.getItem(PLANNER_LOCAL_KEY)) || {}; } catch (err) { return {}; }
}

function writePlannerLocal() {
  const map = {};
  tasks.forEach((t) => {
    if (t.scheduledDate || t.durationMinutes !== DEFAULT_DURATION) {
      map[t.id] = { d: t.durationMinutes, s: t.scheduledDate, t: t.startTime };
    }
  });
  try { localStorage.setItem(PLANNER_LOCAL_KEY, JSON.stringify(map)); } catch (err) {}
}

function isMissingPlannerColumn(error) {
  const text = `${error && error.message ? error.message : ""}`;
  return /duration_minutes|scheduled_date|start_time/.test(text) ||
    (error && (error.code === "PGRST204" || error.code === "42703"));
}

function generateInitialTasks() {
  const list = [];
  const today = new Date();

  fixedTaskDefinitions.forEach((def, index) => {
    const nextDueDate = getNextDateForDay(def.dayOfWeek, today);
    if (nextDueDate <= (def.endDate || END_SCHEDULE_DATE)) {
      list.push({
        id: `fixed-${index}-${def.dayOfWeek}`,
        title: def.title,
        subject: def.subject,
        dueDate: nextDueDate,
        priority: def.priority,
        completed: false,
        recurring: true,
        dayOfWeek: def.dayOfWeek,
        endDate: def.endDate || END_SCHEDULE_DATE,
        notes: `Recurring task (Every ${getDayName(def.dayOfWeek)}) until ${def.endDate || END_SCHEDULE_DATE}`
      });
    }
  });
  return list.map(ensurePlannerFields);
}

/* ==================================================
   STORAGE + SUPABASE CLOUD SYNC
================================================== */

const STORAGE_KEY = "study_tasks_v2";
const THEME_KEY = "study_theme";

function taskToRow(task) {
  const row = {
    id: task.id, user_id: currentUser.id, title: task.title || "", subject: task.subject || "Other",
    due_date: task.dueDate, priority: task.priority || "Medium", completed: !!task.completed,
    recurring: !!task.recurring, day_of_week: encodeRepeatDays(task),
    end_date: task.endDate || null, last_done: task.lastDone || null, notes: task.notes || "",
    updated_at: new Date().toISOString()
  };
  if (plannerColumnsOk) {
    row.duration_minutes = task.durationMinutes ?? DEFAULT_DURATION;
    row.scheduled_date = task.scheduledDate || null;
    row.start_time = task.startTime || null;
  }
  return row;
}

function rowToTask(row) {
  const { dayOfWeek, repeatDays } = decodeRepeatDays(row.day_of_week);
  const task = { id: row.id, title: row.title, subject: row.subject, dueDate: row.due_date, priority: row.priority,
    completed: row.completed, recurring: row.recurring, dayOfWeek, endDate: row.end_date,
    lastDone: row.last_done, notes: row.notes || "", createdAt: row.created_at || null };
  if (repeatDays) task.repeatDays = repeatDays;
  if ("duration_minutes" in row || "scheduled_date" in row || "start_time" in row) {
    task.durationMinutes = row.duration_minutes;
    task.scheduledDate = row.scheduled_date || null;
    task.startTime = row.start_time || null;
  } else {
    // Cloud table has no planner columns yet: use the copy kept on this device
    const local = (plannerLocalCache || {})[row.id];
    if (local) {
      task.durationMinutes = local.d;
      task.scheduledDate = local.s || null;
      task.startTime = local.t || null;
    }
  }
  return ensurePlannerFields(task);
}

async function loadTasksFromCloud() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient.from("tasks").select("*").eq("user_id", currentUser.id).order("due_date", { ascending: true });
  if (error) {
    console.error(error);
    showToast("Couldn't load your cloud tasks.", "error");
    return;
  }
  if (!data || data.length === 0) {
    tasks = generateInitialTasks();
    await saveTasksToCloud();
  } else {
    plannerLocalCache = readPlannerLocal();
    plannerColumnsOk = "duration_minutes" in data[0] && "scheduled_date" in data[0] && "start_time" in data[0];
    tasks = data.map(rowToTask);
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (err) {}
}

async function saveTasksToCloud() {
  if (!currentUser) return;
  if (saveInProgress) { queuedSave = true; return; }
  saveInProgress = true;
  try {
    const { data: existing, error: existingError } = await supabaseClient.from("tasks").select("id").eq("user_id", currentUser.id);
    if (existingError) throw existingError;
    const wantedIds = new Set(tasks.map(t => t.id));
    const staleIds = (existing || []).map(r => r.id).filter(id => !wantedIds.has(id));
    if (staleIds.length) {
      const { error } = await supabaseClient.from("tasks").delete().eq("user_id", currentUser.id).in("id", staleIds);
      if (error) throw error;
    }
    if (tasks.length) {
      let { error } = await supabaseClient.from("tasks").upsert(tasks.map(taskToRow), { onConflict: "id" });
      if (error && plannerColumnsOk && isMissingPlannerColumn(error)) {
        // Cloud table doesn't have the planner columns yet: save everything else, keep planner data on this device
        plannerColumnsOk = false;
        showToast("Planner times are saved on this device only until the cloud table gets its new columns.", "error");
        ({ error } = await supabaseClient.from("tasks").upsert(tasks.map(taskToRow), { onConflict: "id" }));
      }
      if (error) throw error;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (err) {}
  } catch (err) {
    console.error(err);
    showToast("Cloud save failed. Please check your connection.", "error");
  } finally {
    saveInProgress = false;
    if (queuedSave) { queuedSave = false; saveTasksToCloud(); }
  }
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : generateInitialTasks();
  } catch (err) { return generateInitialTasks(); }
}

function setupRealtimeSync() {
  if (!currentUser) return;
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = supabaseClient.channel(`tasks-sync-${currentUser.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${currentUser.id}` }, async () => {
      if (saveInProgress) return;
      await loadTasksFromCloud();
      renderApp();
    })
    .subscribe();
}

let currentView = "home";
let currentTab = "all";
let activeDayFilter = null;
let pendingDeleteId = null;
let detailsTaskId = null;
let pendingImport = null;
let syncFileHandle = null;
let lastFocused = null;
let lastRenderDay = getRelativeDate(0);

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ==================================================
   DOM REFERENCES
================================================== */

const searchInput = $("search-input");
const subjectFilter = $("subject-filter");
const priorityFilter = $("priority-filter");
const sortSelect = $("sort-select");
const tabButtons = document.querySelectorAll(".tab-btn");

const taskModal = $("task-modal");
const taskForm = $("task-form");
const modalTitle = $("modal-title");
const taskIdInput = $("task-id");
const repeatTaskModal = $("repeat-task-modal");
const repeatTaskForm = $("repeat-task-form");
const detailsModal = $("details-modal");
const deleteModal = $("delete-modal");
const importModal = $("import-modal");
const moreSheet = $("more-sheet");
const importSummary = $("import-summary");
const importFileInput = $("import-file-input");
const toastContainer = $("toast-container");

const VIEWS = ["home", "week", "planner", "tasks", "analytics"];

/* ==================================================
   THEME
================================================== */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0d1219" : "#edf1f6");
  document.querySelectorAll(".js-theme-label").forEach((el) => {
    el.textContent = theme === "dark" ? "Light theme" : "Dark theme";
  });
}

function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* private mode */ }
  if (currentView === "analytics") renderAnalytics();
}

/* ==================================================
   NAVIGATION
================================================== */

function setView(name) {
  if (!VIEWS.includes(name)) name = "home";
  currentView = name;

  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("is-active", v.dataset.view === name);
  });
  document.querySelectorAll("[data-go]").forEach((btn) => {
    const active = btn.dataset.go === name;
    btn.classList.toggle("is-active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  if (name === "planner") renderPlanner();
  if (name === "analytics") renderAnalytics();

  try { history.replaceState(null, "", `#${name}`); } catch (err) { /* file:// */ }
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

function setTab(tab) {
  currentTab = tab;
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
}

function clearFilters() {
  searchInput.value = "";
  subjectFilter.value = "all";
  priorityFilter.value = "all";
  activeDayFilter = null;
  setTab("all");
  renderApp();
}

/* ==================================================
   OVERLAYS (modals + mobile sheets)
================================================== */

function showOverlay(el, focusSelector) {
  lastFocused = document.activeElement;
  el.classList.remove("hidden");
  document.body.classList.add("modal-open");
  const target = focusSelector ? el.querySelector(focusSelector) : null;
  if (target) setTimeout(() => target.focus(), 30);
}

function hideOverlay(el) {
  el.classList.add("hidden");
  if (!document.querySelector(".modal-overlay:not(.hidden)")) {
    document.body.classList.remove("modal-open");
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
}

function closeAllModals() {
  if (!document.querySelector(".modal-overlay:not(.hidden)")) return;
  [taskModal, repeatTaskModal, detailsModal, deleteModal, importModal, moreSheet].forEach((el) => hideOverlay(el));
  pendingDeleteId = null;
  pendingImport = null;
  importFileInput.value = "";
}

/* ==================================================
   EVENTS
================================================== */

function setupEventListeners() {
  // Navigation + commands (sidebar, bottom nav, More sheet, buttons)
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) {
      setView(go.dataset.go);
      return;
    }

    const cmd = e.target.closest("[data-cmd]");
    if (cmd) {
      runCommand(cmd.dataset.cmd);
      return;
    }

    const close = e.target.closest("[data-close]");
    if (close) hideOverlay($(close.dataset.close));
  });

  // Close the More sheet when a link/command inside it is used
  moreSheet.addEventListener("click", (e) => {
    if (e.target.closest("a, [data-cmd], [data-go]")) hideOverlay(moreSheet);
  });

  // Task modal
  $("modal-close-btn").addEventListener("click", closeTaskModal);
  $("modal-cancel-btn").addEventListener("click", closeTaskModal);
  taskForm.addEventListener("submit", handleFormSubmit);

  // Repeating task modal
  $("repeat-modal-close-btn").addEventListener("click", closeRepeatTaskModal);
  $("repeat-modal-cancel-btn").addEventListener("click", closeRepeatTaskModal);
  repeatTaskForm.addEventListener("submit", handleRepeatFormSubmit);
  $("repeat-form-pattern").addEventListener("change", updateRepeatPatternUI);

  $("form-duration").addEventListener("change", syncDurationUI);
  // Plan date is always the same as the due date
  $("form-plan-date").disabled = true;
  $("form-date").addEventListener("input", () => {
    $("form-plan-date").value = $("form-date").value;
  });

  // Details modal
  $("details-close-btn").addEventListener("click", () => hideOverlay(detailsModal));
  $("details-ok-btn").addEventListener("click", () => hideOverlay(detailsModal));
  $("details-edit-btn").addEventListener("click", () => {
    const id = detailsTaskId;
    hideOverlay(detailsModal);
    if (id) openTaskModal(id);
  });

  // Delete modal
  $("delete-close-btn").addEventListener("click", () => hideOverlay(deleteModal));
  $("delete-cancel-btn").addEventListener("click", () => hideOverlay(deleteModal));
  $("delete-confirm-btn").addEventListener("click", confirmDeleteTask);

  // Import
  importFileInput.addEventListener("change", handleImportFileSelected);
  $("import-close-btn").addEventListener("click", closeImportModal);
  $("import-cancel-btn").addEventListener("click", closeImportModal);
  $("import-merge-btn").addEventListener("click", () => applyImport("merge"));
  $("import-replace-btn").addEventListener("click", () => applyImport("replace"));

  // Filters
  searchInput.addEventListener("input", renderApp);
  subjectFilter.addEventListener("change", renderApp);
  priorityFilter.addEventListener("change", renderApp);
  sortSelect.addEventListener("change", renderApp);

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTab(button.dataset.tab);
      activeDayFilter = null;
      renderApp();
    });
  });

  // Task interactions (all views live inside <main>)
  const main = $("main");

  main.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-day]");
    if (chip) {
      activeDayFilter = chip.dataset.day;
      setTab("all");
      renderApp();
      setView("tasks");
      return;
    }

    const trigger = e.target.closest("[data-action]");
    if (!trigger) return;
    const id = trigger.dataset.id;
    switch (trigger.dataset.action) {
      case "view": viewTaskDetails(id); break;
      case "edit": openTaskModal(id); break;
      case "delete": openDeleteModal(id); break;
      case "add-on": openTaskModal(null, trigger.dataset.date); break;
    }
  });

  main.addEventListener("change", (e) => {
    const box = e.target.closest(".toggle-complete");
    if (!box) return;
    const item = box.closest(".task, .pl-block, .pl-card");
    if (item && box.checked) item.classList.add("is-completing");
    const id = box.dataset.id;
    setTimeout(() => toggleTaskComplete(id), reduceMotion ? 0 : 240);
  });

  // Overlay dismissal
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) closeAllModals();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
  });

  // Keep "today" correct if the tab stays open past midnight or is resumed
  setInterval(checkDayRollover, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDayRollover();
  });
}

function runCommand(name) {
  switch (name) {
    case "add": openTaskModal(); break;
    case "add-repeating": openRepeatTaskModal(); break;
    case "more": showOverlay(moreSheet); break;
    case "export": exportTasks(); break;
    case "import": importFileInput.click(); break;
    case "sync": syncToFile(); break;
    case "theme": toggleTheme(); break;
    case "clear-filters": clearFilters(); break;
    case "clear-day": activeDayFilter = null; renderApp(); break;
    case "analytics-overdue": openAnalyticsOverdue(); break;
    case "plan-prev":
    case "plan-next":
    case "plan-today": plannerGo(name); break;
  }
}

function checkDayRollover() {
  const key = getRelativeDate(0);
  if (key !== lastRenderDay) {
    lastRenderDay = key;
    renderApp();
  }
}

/* ==================================================
   SAVE + SYNC
================================================== */

function saveTasks() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (err) {}
  writePlannerLocal();
  if (currentUser) saveTasksToCloud();
  if (syncFileHandle) writeTasksToSyncFile();
}

// Save, then redraw. Use this after any change to `tasks`.
function commit() {
  saveTasks();
  renderApp();
}

function buildTasksPayload() {
  return { exportedAt: new Date().toISOString(), tasks };
}

async function writeTasksToSyncFile() {
  try {
    const writable = await syncFileHandle.createWritable();
    await writable.write(JSON.stringify(buildTasksPayload(), null, 2));
    await writable.close();
  } catch (err) {
    // Most likely the user revoked permission or moved/deleted the file.
    syncFileHandle = null;
    showToast("Sync file is no longer accessible. Choose Sync to reconnect.", "error");
  }
}

async function syncToFile() {
  if (!window.showSaveFilePicker) {
    // Browsers without the File System Access API (Firefox, Safari, most phones)
    // can't keep a file live, so this downloads a fresh copy instead.
    exportTasks();
    showToast("This browser can't keep a file in sync, so a fresh JSON backup was downloaded.", "error");
    return;
  }

  try {
    if (!syncFileHandle) {
      syncFileHandle = await window.showSaveFilePicker({
        suggestedName: "study-tasks-sync.json",
        types: [{ description: "JSON file", accept: { "application/json": [".json"] } }]
      });
    }
    await writeTasksToSyncFile();
    if (syncFileHandle) showToast(`Synced to ${syncFileHandle.name}`, "success");
  } catch (err) {
    if (err && err.name === "AbortError") return; // user cancelled the picker
    showToast("Couldn't save the sync file.", "error");
  }
}

/* ==================================================
   TASK ACTIONS
================================================== */

function toggleTaskComplete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  const wasCompleted = task.completed;
  const logSnapshot = CompletionLog.snapshot(task); // before the task moves to its next occurrence

  if (task.recurring && !task.completed) {
    // Completing a recurring task moves it to its next matching day
    const days = repeatDaysOf(task);
    const nextDueDate = getFollowingDate(days, task.dueDate);
    const maxEndDate = task.endDate || END_SCHEDULE_DATE;

    task.lastDone = getRelativeDate(0); // lets the "today" progress bar count it

    if (nextDueDate <= maxEndDate) {
      // A planned slot moves with the task to its next occurrence
      if (task.scheduledDate) task.scheduledDate = shiftDateKey(task.scheduledDate, daysBetween(task.dueDate, nextDueDate));
      task.dueDate = nextDueDate;
      task.completed = false;
      showToast(`Done. Next one is ${getDayName(parseDateKey(nextDueDate).getDay())}, ${formatDateReadable(nextDueDate)}.`, "success");
    } else {
      task.completed = true;
      showToast("Final occurrence completed.", "success");
    }
  } else {
    task.completed = !task.completed;
  }

  if (!wasCompleted && (task.recurring || task.completed)) CompletionLog.record(logSnapshot);
  else if (wasCompleted && !task.completed) CompletionLog.removeLatest(task.id);

  commit();
}

function handleFormSubmit(e) {
  e.preventDefault();

  const id = taskIdInput.value;
  const title = $("form-title").value.trim();
  const subject = $("form-subject").value;
  const dueDate = $("form-date").value;
  const priority = $("form-priority").value;
  const notes = $("form-notes").value.trim();

  if (!title || !dueDate) return;

  const durationMinutes = readDurationInput();
  if (durationMinutes === null) {
    showToast("Enter a duration between 5 and 480 minutes.", "error");
    return;
  }

  // Planning is optional: choosing a start time schedules the task
  const planTime = $("form-plan-time").value;
  const planDate = dueDate; // plan date always equals due date
  let scheduledDate = null;
  let startTime = null;
  if (planTime) {
    if (!planDate) {
      showToast("Pick a date to plan this task on.", "error");
      return;
    }
    if (timeToMinutes(planTime) + durationMinutes > PLANNER_DAY_END) {
      showToast(`That would run past ${formatClock(PLANNER_DAY_END)}. Shorten it or start earlier.`, "error");
      return;
    }
    scheduledDate = planDate;
    startTime = planTime;
  }

  if (id) {
    tasks = tasks.map((t) => (t.id === id ? { ...t, title, subject, dueDate, priority, notes, durationMinutes, scheduledDate, startTime } : t));
  } else {
    tasks.push({
      id: `task-${Date.now()}`,
      title,
      subject,
      dueDate,
      priority,
      completed: false,
      notes,
      durationMinutes,
      scheduledDate,
      startTime
    });
  }

  closeTaskModal();
  commit();
  showToast(id ? "Task saved." : "Task added.", "success");
}

function getRepeatDaysFromForm() {
  const pattern = $("repeat-form-pattern").value;
  if (REPEAT_PRESETS[pattern]) return [...REPEAT_PRESETS[pattern]];
  if (pattern === "custom") {
    return Array.from(repeatTaskForm.querySelectorAll('input[name="repeat-day"]:checked')).map((el) => Number(el.value));
  }
  return [Number($("repeat-form-day").value)];
}

function updateRepeatPatternUI() {
  const pattern = $("repeat-form-pattern").value;
  $("repeat-weekly-group").classList.toggle("hidden", pattern !== "weekly");
  $("repeat-custom-group").classList.toggle("hidden", pattern !== "custom");
}

function handleRepeatFormSubmit(e) {
  e.preventDefault();

  const title = $("repeat-form-title").value.trim();
  const subject = $("repeat-form-subject").value;
  const priority = $("repeat-form-priority").value;
  const endDate = $("repeat-form-end-date").value || END_SCHEDULE_DATE;
  const notesInput = $("repeat-form-notes").value.trim();
  const days = getRepeatDaysFromForm();

  if (!title) return;
  if (days.length === 0) {
    showToast("Pick at least one day for a custom repeat.", "error");
    return;
  }

  const dueDate = getNextDateInSet(days);
  if (dueDate > endDate) {
    showToast("The end date is before the first occurrence.", "error");
    return;
  }

  const firstDay = [1, 2, 3, 4, 5, 6, 0].find((d) => days.includes(d));
  const task = {
    id: `repeat-${Date.now()}`,
    title,
    subject,
    dueDate,
    priority,
    completed: false,
    recurring: true,
    dayOfWeek: days.length === 1 ? days[0] : firstDay,
    endDate,
    notes: notesInput || `Recurring task (${describeRepeat(days)}) until ${endDate}`
  };
  if (days.length > 1) task.repeatDays = days;
  tasks.push(task);

  closeRepeatTaskModal();
  commit();
  showToast("Repeating task added.", "success");
}

function confirmDeleteTask() {
  if (!pendingDeleteId) return;
  tasks = tasks.filter((t) => t.id !== pendingDeleteId);
  pendingDeleteId = null;
  hideOverlay(deleteModal);
  commit();
  showToast("Task deleted.", "success");
}

/* ==================================================
   MODALS
================================================== */

function openTaskModal(id = null, presetDate = null) {
  taskForm.reset();
  if (id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    modalTitle.textContent = "Edit task";
    taskIdInput.value = task.id;
    $("form-title").value = task.title;
    $("form-subject").value = task.subject;
    $("form-date").value = task.dueDate;
    $("form-priority").value = task.priority;
    $("form-notes").value = task.notes || "";
    setDurationInputs(task.durationMinutes);
    $("form-plan-date").value = task.dueDate;
    $("form-plan-time").value = task.startTime || "";
  } else {
    modalTitle.textContent = "Add task";
    taskIdInput.value = "";
    $("form-date").value = presetDate || getRelativeDate(0);
    $("form-plan-date").value = $("form-date").value;
    setDurationInputs(60);
  }
  showOverlay(taskModal, "#form-title");
}

function syncDurationUI() {
  $("form-duration-custom-group").classList.toggle("hidden", $("form-duration").value !== "custom");
}

function setDurationInputs(minutes) {
  if (DURATION_PRESETS.includes(minutes)) {
    $("form-duration").value = String(minutes);
  } else {
    $("form-duration").value = "custom";
    $("form-duration-custom").value = minutes;
  }
  syncDurationUI();
}

// Minutes from the form, or null when a custom value is out of range
function readDurationInput() {
  const select = $("form-duration").value;
  if (select !== "custom") return Number(select);
  const n = Math.round(Number($("form-duration-custom").value));
  return n >= 5 && n <= 480 ? n : null;
}

function closeTaskModal() {
  hideOverlay(taskModal);
}

function openRepeatTaskModal() {
  repeatTaskForm.reset();
  $("repeat-form-pattern").value = "weekly";
  $("repeat-form-day").value = String(new Date().getDay());
  $("repeat-form-priority").value = "Medium";
  $("repeat-form-end-date").value = END_SCHEDULE_DATE;
  updateRepeatPatternUI();
  showOverlay(repeatTaskModal, "#repeat-form-title");
}

function closeRepeatTaskModal() {
  hideOverlay(repeatTaskModal);
}

function viewTaskDetails(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  detailsTaskId = id;

  $("detail-title").textContent = task.title;
  $("detail-subject").innerHTML = subjectChipHTML(task.subject);
  $("detail-date").textContent = formatDateReadable(task.dueDate);
  $("detail-priority").innerHTML = priorityHTML(task.priority);
  $("detail-duration").textContent = `${task.durationMinutes} min`;
  $("detail-planned").textContent = isScheduled(task)
    ? `${formatDayShort(task.scheduledDate)}, ${formatClock(timeToMinutes(task.startTime))} – ${formatClock(timeToMinutes(task.startTime) + task.durationMinutes)}`
    : "Not scheduled";
  $("detail-status").textContent = task.completed ? "Completed" : "Pending";
  $("detail-notes").textContent = task.notes || "No notes on this task.";

  showOverlay(detailsModal, "#details-ok-btn");
}

function openDeleteModal(id) {
  pendingDeleteId = id;
  showOverlay(deleteModal, "#delete-cancel-btn");
}

/* ==================================================
   EXPORT / IMPORT
================================================== */

function exportTasks() {
  const blob = new Blob([JSON.stringify(buildTasksPayload(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `study-tasks-${getRelativeDate(0)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeImportedTask(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.title !== "string" || typeof raw.dueDate !== "string") return null;
  return {
    ...raw,
    id: typeof raw.id === "string" && raw.id ? raw.id : `task-${Date.now()}-${index}`,
    subject: ["Mathematics", "Chemistry", "Physics", "Other"].includes(raw.subject) ? raw.subject : "Other",
    priority: ["High", "Medium", "Low"].includes(raw.priority) ? raw.priority : "Medium",
    completed: Boolean(raw.completed),
    notes: typeof raw.notes === "string" ? raw.notes : ""
  };
}

function handleImportFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const rawList = Array.isArray(parsed) ? parsed : parsed.tasks || [];
      const valid = rawList.map(normalizeImportedTask).filter(Boolean);

      if (valid.length === 0) {
        showToast("No tasks found in that file.", "error");
        importFileInput.value = "";
        return;
      }
      pendingImport = { tasks: valid, fileName: file.name };
      openImportModal();
    } catch (err) {
      showToast("That file isn't valid JSON.", "error");
      importFileInput.value = "";
    }
  };
  reader.readAsText(file);
}

function openImportModal() {
  importSummary.innerHTML = `Ready to import <strong>${pendingImport.tasks.length}</strong> tasks from <em>${escapeHtml(pendingImport.fileName)}</em>.`;
  showOverlay(importModal);
}

function closeImportModal() {
  hideOverlay(importModal);
  pendingImport = null;
  importFileInput.value = "";
}

function applyImport(mode) {
  if (!pendingImport) return;
  const incoming = pendingImport.tasks;

  if (mode === "replace") {
    tasks = incoming;
  } else {
    // Merge by id: existing tasks are updated, new ones are added
    const byId = new Map(tasks.map((t) => [t.id, t]));
    incoming.forEach((t) => byId.set(t.id, { ...byId.get(t.id), ...t }));
    tasks = Array.from(byId.values());
  }

  tasks.forEach(ensurePlannerFields);

  const count = incoming.length;
  closeImportModal();
  commit();
  showToast(`Imported ${count} task${count === 1 ? "" : "s"}.`, "success");
}

/* ==================================================
   RENDERING
================================================== */

const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 };

function renderApp() {
  renderStats();
  renderHome();
  renderWeekStrip();
  renderWeekBoard();
  renderTasksView();
  renderBadges();
  if (currentView === "planner") renderPlanner();
  AnalyticsEngine.invalidate();
  if (currentView === "analytics") renderAnalytics();
}

function getFilteredTasks() {
  const query = searchInput.value.toLowerCase().trim();
  const selectedSubject = subjectFilter.value;
  const selectedPriority = priorityFilter.value;
  const todayStr = getRelativeDate(0);

  return tasks
    .filter((task) => {
      if (currentTab === "today" && task.dueDate !== todayStr) return false;
      if (currentTab === "pending" && task.completed) return false;
      if (currentTab === "completed" && !task.completed) return false;
      if (currentTab === "week") {
        const weekEndStr = getRelativeDate(7);
        if (task.dueDate < todayStr || task.dueDate > weekEndStr) return false;
      }

      if (activeDayFilter && task.dueDate !== activeDayFilter) return false;

      if (query) {
        const haystack = `${task.title} ${task.notes || ""} ${task.subject}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (selectedSubject !== "all" && task.subject !== selectedSubject) return false;
      if (selectedPriority !== "all" && task.priority !== selectedPriority) return false;

      return true;
    })
    .sort((a, b) => {
      const sortVal = sortSelect.value;
      if (sortVal === "dueDate-asc") return a.dueDate.localeCompare(b.dueDate);
      if (sortVal === "dueDate-desc") return b.dueDate.localeCompare(a.dueDate);
      if (sortVal === "title-asc") return a.title.localeCompare(b.title);
      if (sortVal === "priority-desc") {
        const diff = (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
        return diff !== 0 ? diff : a.dueDate.localeCompare(b.dueDate);
      }
      return 0;
    });
}

/* Today progress: counts recurring tasks you finished today, which move to next
   week and would otherwise vanish from both sides of the fraction. */
function getDayProgress() {
  const todayStr = getRelativeDate(0);
  let total = 0;
  let done = 0;

  tasks.forEach((task) => {
    if (task.dueDate === todayStr) {
      total++;
      if (task.completed) done++;
    } else if (task.lastDone === todayStr) {
      total++;
      done++;
    }
  });
  return { done, total };
}

function renderStats() {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const pending = total - completed;
  const todayStr = getRelativeDate(0);
  const overdue = tasks.filter((t) => !t.completed && t.dueDate < todayStr).length;

  $("stat-total").textContent = total;
  $("stat-completed").textContent = completed;
  $("stat-pending").textContent = pending;
  $("stat-overdue").textContent = overdue;

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  $("all-progress-text").textContent = `${pct}%`;
  $("all-progress-fill").style.width = `${pct}%`;

  const { done, total: dayTotal } = getDayProgress();
  const dayPct = dayTotal > 0 ? Math.round((done / dayTotal) * 100) : 0;
  $("day-progress-text").textContent = dayTotal > 0 ? `${done} of ${dayTotal} done today` : "Nothing scheduled today";
  $("day-progress-fill").style.width = `${dayPct}%`;
}

function renderBadges() {
  const todayStr = getRelativeDate(0);
  const overdue = tasks.filter((t) => !t.completed && t.dueDate < todayStr).length;
  document.querySelectorAll(".js-overdue").forEach((el) => {
    el.textContent = overdue > 99 ? "99+" : overdue;
    el.classList.toggle("hidden", overdue === 0);
    el.setAttribute("aria-label", `${overdue} overdue`);
  });
}

function renderHome() {
  const todayStr = getRelativeDate(0);

  $("home-date").textContent = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long"
  });

  const overdue = tasks
    .filter((t) => !t.completed && t.dueDate < todayStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));

  const dueToday = tasks
    .filter((t) => !t.completed && t.dueDate === todayStr)
    .sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));

  const { total: dayTotal } = getDayProgress();

  // Summary line under the date
  const parts = [];
  if (dueToday.length) parts.push(`${dueToday.length} left today`);
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  let summary;
  if (parts.length) {
    summary = parts.join(", ");
    summary = summary.charAt(0).toUpperCase() + summary.slice(1) + ".";
  } else {
    summary = dayTotal > 0 ? "Everything for today is done." : "Nothing is scheduled for today.";
  }
  $("home-summary").textContent = summary;

  // Notebook page
  const remaining = dueToday.length + overdue.length;
  $("today-count").textContent = remaining > 0 ? `${remaining} to do` : "";

  const list = $("today-list");
  let html = "";

  if (overdue.length) {
    html += `<h3 class="group-title is-late"><span>Overdue</span><span>${overdue.length}</span></h3>`;
    html += overdue.map((t) => taskHTML(t)).join("");
    if (dueToday.length) {
      html += `<h3 class="group-title"><span>Due today</span><span>${dueToday.length}</span></h3>`;
    }
  }
  html += dueToday.map((t) => taskHTML(t)).join("");

  if (!html) {
    const next = tasks
      .filter((t) => !t.completed && t.dueDate > todayStr)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const nextLine = next
      ? `Next up: <strong>${escapeHtml(next.title)}</strong> on ${escapeHtml(formatDayShort(next.dueDate))}.`
      : "No upcoming tasks are scheduled.";
    html = `
      <div class="notebook-empty">
        <h3>${dayTotal > 0 ? "Everything today is done" : "Nothing due today"}</h3>
        <p>${nextLine}</p>
      </div>`;
  }
  list.innerHTML = html;
}

function renderWeekStrip() {
  const grid = $("weekly-days-grid");
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = "";

  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const key = toDateKey(d);
    const count = tasks.filter((t) => t.dueDate === key && !t.completed).length;
    const label = i === 0 ? "Today" : names[d.getDay()];
    const classes = ["day-chip", i === 0 ? "is-today" : "", activeDayFilter === key ? "is-active" : ""].join(" ");

    html += `
      <button type="button" class="${classes}" data-day="${key}" aria-label="${escapeHtml(formatDayShort(key))}, ${count} open task${count === 1 ? "" : "s"}">
        <span class="day-chip-name">${label}</span>
        <span class="day-chip-num">${d.getDate()}</span>
        <span class="day-chip-count">${count}</span>
      </button>`;
  }
  grid.innerHTML = html;
}

function renderWeekBoard() {
  const board = $("week-board");
  const longNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let html = "";

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const key = toDateKey(d);
    const title = i === 0 ? "Today" : i === 1 ? "Tomorrow" : longNames[d.getDay()];
    const dayTasks = tasks
      .filter((t) => !t.completed && t.dueDate === key)
      .sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));

    html += `
      <section class="day-card ${i === 0 ? "is-today" : ""}">
        <header class="day-card-head">
          <div class="day-card-title">
            <h3>${title}</h3>
            <span>${escapeHtml(formatDayShort(key))}</span>
          </div>
          <span class="count-pill" aria-label="${dayTasks.length} open">${dayTasks.length}</span>
          <button type="button" class="icon-btn" data-action="add-on" data-date="${key}" aria-label="Add a task on ${escapeHtml(formatDayShort(key))}">
            <i class="fa-solid fa-plus"></i>
          </button>
        </header>
        <div class="day-card-body">
          ${dayTasks.length ? dayTasks.map((t) => taskHTML(t, { compact: true })).join("") : '<p class="day-empty">Nothing scheduled.</p>'}
        </div>
      </section>`;
  }
  board.innerHTML = html;
}

function renderTasksView() {
  const filtered = getFilteredTasks();
  const list = $("task-list");
  const empty = $("empty-state");

  $("task-count").textContent = `${filtered.length} ${filtered.length === 1 ? "task" : "tasks"} shown`;

  const note = $("day-filter-note");
  if (activeDayFilter) {
    $("day-filter-text").textContent = `Showing ${formatDayShort(activeDayFilter)}`;
    note.classList.remove("hidden");
  } else {
    note.classList.add("hidden");
  }

  if (filtered.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = filtered.map((t) => taskHTML(t)).join("");
}

/* ==================================================
   HTML BUILDERS
================================================== */

function subjectClass(subject) {
  if (subject === "Mathematics") return "s-maths";
  if (subject === "Chemistry") return "s-chem";
  if (subject === "Physics") return "s-phys";
  return "s-other";
}

function subjectChipHTML(subject) {
  const icons = { Mathematics: "fa-calculator", Chemistry: "fa-flask", Physics: "fa-atom" };
  const icon = icons[subject] || "fa-book";
  return `<span class="chip chip-subject ${subjectClass(subject)}"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${escapeHtml(subject)}</span>`;
}

function priorityHTML(priority) {
  const cls = priority === "High" ? "prio-high" : priority === "Medium" ? "prio-medium" : "prio-low";
  return `<span class="prio ${cls}">${escapeHtml(priority)}</span>`;
}

function getDeadlineBadgeHTML(dueDateStr, isCompleted) {
  if (isCompleted) {
    return `<span class="chip chip-due due-complete"><i class="fa-solid fa-check" aria-hidden="true"></i> Completed</span>`;
  }

  const diff = daysBetween(getRelativeDate(0), dueDateStr); // negative = late

  if (diff < 0) {
    const late = -diff;
    return `<span class="chip chip-due due-overdue"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${late === 1 ? "1 day late" : `${late} days late`}</span>`;
  }
  if (diff === 0) return `<span class="chip chip-due due-today">Due today</span>`;
  if (diff === 1) return `<span class="chip chip-due due-soon">Due tomorrow</span>`;
  return `<span class="chip chip-due due-upcoming">${escapeHtml(formatDateReadable(dueDateStr))}</span>`;
}

function taskHTML(task, { compact = false } = {}) {
  const id = escapeHtml(task.id);
  const title = escapeHtml(task.title);

  return `
    <article class="task ${subjectClass(task.subject)} ${task.completed ? "is-done" : ""} ${compact ? "is-compact" : ""}">
      <label class="check">
        <input type="checkbox" class="toggle-complete" data-id="${id}" ${task.completed ? "checked" : ""} aria-label="Mark ${title} as done" />
        <span class="check-box" aria-hidden="true"></span>
      </label>
      <button type="button" class="task-main" data-action="view" data-id="${id}">
        <span class="task-title">${title}</span>${task.recurring ? '<i class="fa-solid fa-arrows-rotate task-repeat" aria-hidden="true"></i><span class="sr-only"> ${escapeHtml(describeRepeat(repeatDaysOf(task)))}</span>' : ""}
      </button>
      <div class="task-meta">
        ${subjectChipHTML(task.subject)}
        ${getDeadlineBadgeHTML(task.dueDate, task.completed)}
        ${priorityHTML(task.priority)}
      </div>
      <div class="task-actions">
        <button type="button" class="icon-btn" data-action="edit" data-id="${id}" aria-label="Edit ${title}"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="icon-btn is-danger" data-action="delete" data-id="${id}" aria-label="Delete ${title}"><i class="fa-solid fa-trash"></i></button>
      </div>
    </article>`;
}

/* ==================================================
   WEEKLY PLANNER - VIEW + DRAG AND DROP
   Pointer events are used (not HTML5 drag) so the same code
   works with a mouse, a pen and a finger. On touch, press and
   hold a card or block for a moment, then drag.
================================================== */

let plannerWeekStart = mondayKeyOf(new Date());
let plannerFilter = "all";
const PLANNER_VIEWER_POS_KEY = "study_planner_viewer_pos"; // "top" | "bottom"
let plannerViewerPos = (() => {
  try { return localStorage.getItem(PLANNER_VIEWER_POS_KEY) === "top" ? "top" : "bottom"; } catch (err) { return "bottom"; }
})();

function applyPlannerViewerPos() {
  const layout = $("pl-layout");
  if (layout) layout.dataset.viewer = plannerViewerPos;
  document.querySelectorAll("[data-plpos]").forEach((btn) => {
    const on = btn.dataset.plpos === plannerViewerPos;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}
let plannerBusy = false;            // true while dragging / resizing: re-render waits
let plannerRenderQueued = false;
let plannerDidInitialScroll = false;
let plannerSuppressClickUntil = 0;
let drag = null;
let resize = null;

function mondayKeyOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateKey(d);
}

function plannerWeekDays() {
  return Array.from({ length: 7 }, (_, i) => {
    const key = shiftDateKey(plannerWeekStart, i);
    return { key, date: parseDateKey(key) };
  });
}

function plannerRangeLabel(days) {
  const a = days[0].date;
  const b = days[6].date;
  const fmt = (d, opts) => d.toLocaleDateString("en-US", opts);
  if (a.getFullYear() !== b.getFullYear()) {
    const o = { month: "short", day: "numeric", year: "numeric" };
    return `${fmt(a, o)} – ${fmt(b, o)}`;
  }
  if (a.getMonth() === b.getMonth()) {
    return `${fmt(a, { month: "long" })} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}`;
  }
  const o = { month: "short", day: "numeric" };
  return `${fmt(a, o)} – ${fmt(b, o)}, ${b.getFullYear()}`;
}

function plannerGo(command) {
  if (command === "plan-prev") plannerWeekStart = shiftDateKey(plannerWeekStart, -7);
  else if (command === "plan-next") plannerWeekStart = shiftDateKey(plannerWeekStart, 7);
  else plannerWeekStart = mondayKeyOf(new Date());
  renderPlanner();
}

/* ---------- Layout: overlapping tasks share the column side by side ---------- */

function plannerDayItems(dateKey) {
  return tasks
    .filter((t) => t.scheduledDate === dateKey && t.startTime)
    .map((t) => {
      const start = timeToMinutes(t.startTime);
      return { task: t, start, end: start + t.durationMinutes };
    });
}

function layoutPlannerDay(items) {
  items.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    cluster.forEach((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(it.end); } else { laneEnds[lane] = it.end; }
      it.lane = lane;
    });
    cluster.forEach((it) => {
      it.lanes = laneEnds.length;
      it.overlaps = cluster.some((o) => o !== it && o.start < it.end && o.end > it.start);
    });
    out.push(...cluster);
    cluster = [];
  };

  items.forEach((it) => {
    if (cluster.length && it.start >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  });
  flush();
  return out;
}

/* ---------- Rendering ---------- */

function plannerCheckHTML(task) {
  const id = escapeHtml(task.id);
  return `
    <label class="check pl-check">
      <input type="checkbox" class="toggle-complete" data-id="${id}" ${task.completed ? "checked" : ""} aria-label="Mark ${escapeHtml(task.title)} as done" />
      <span class="check-box" aria-hidden="true"></span>
    </label>`;
}

function plannerBlockHTML(it) {
  const t = it.task;
  const id = escapeHtml(t.id);
  const range = `${formatClock(it.start)} – ${formatClock(it.end)}`;
  const afterDue = !t.completed && t.dueDate && t.scheduledDate > t.dueDate;
  const classes = [
    "pl-block", subjectClass(t.subject),
    t.completed ? "is-done" : "",
    t.durationMinutes <= PLANNER_STEP ? "is-short" : "",
    it.overlaps ? "is-overlap" : "",
    it.lanes >= 3 ? "is-narrow" : "",
    afterDue ? "is-after-due" : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="${classes}" data-drag-id="${id}" data-kind="block"
         style="--row:${(it.start - PLANNER_DAY_START) / PLANNER_STEP};--span:${t.durationMinutes / PLANNER_STEP};--lane:${it.lane};--lanes:${it.lanes}"
         ${afterDue ? 'title="Planned after its deadline"' : ""}>
      ${plannerCheckHTML(t)}
      <button type="button" class="pl-block-main" data-action="edit" data-id="${id}" aria-label="Edit ${escapeHtml(t.title)}, ${range}">
        <span class="pl-block-title">${t.completed ? '<i class="fa-solid fa-check" aria-hidden="true"></i> ' : ""}${escapeHtml(t.title)}</span>
        <span class="pl-block-time">${range} · ${t.durationMinutes} min</span>
      </button>
      <span class="pl-resize" data-resize-id="${id}" aria-hidden="true"></span>
    </div>`;
}

function plannerCardHTML(task) {
  const id = escapeHtml(task.id);
  return `
    <article class="pl-card ${subjectClass(task.subject)}" data-drag-id="${id}" data-kind="card">
      ${plannerCheckHTML(task)}
      <button type="button" class="pl-card-main" data-action="edit" data-id="${id}" aria-label="Edit ${escapeHtml(task.title)}">${escapeHtml(task.title)}</button>
      <i class="fa-solid fa-grip-vertical pl-grip" aria-hidden="true"></i>
      <div class="pl-card-meta">
        ${subjectChipHTML(task.subject)}
        <span class="chip chip-dur"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${task.durationMinutes} min</span>
        ${priorityHTML(task.priority)}
        ${getDeadlineBadgeHTML(task.dueDate, false)}
      </div>
    </article>`;
}

function renderPlanner() {
  if (plannerBusy) { plannerRenderQueued = true; return; }
  const board = $("pl-board");
  const scroller = $("pl-scroll");
  if (!board || !scroller) return;

  const keepLeft = scroller.scrollLeft;
  const keepTop = scroller.scrollTop;
  const days = plannerWeekDays();
  const todayKey = getRelativeDate(0);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  $("pl-range").textContent = plannerRangeLabel(days);

  const head = `
    <div class="pl-head">
      <div class="pl-corner"></div>
      ${days.map(({ key, date }) => `
        <div class="pl-dayhead${key === todayKey ? " is-today" : ""}"${key === todayKey ? ' aria-current="date"' : ""}>
          <span class="pl-dow">${DAY_SHORT[date.getDay()]}</span>
          <span class="pl-date">${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>`).join("")}
    </div>`;

  let labels = "";
  for (let i = 0; i <= PLANNER_SLOTS; i++) {
    labels += `<div class="pl-time${(PLANNER_DAY_START + i * PLANNER_STEP) % 60 ? " is-half" : ""}" style="--row:${i}">${formatClock(PLANNER_DAY_START + i * PLANNER_STEP)}</div>`;
  }

  const cols = days.map(({ key }) => {
    const items = layoutPlannerDay(plannerDayItems(key));
    const isToday = key === todayKey;
    const nowLine = isToday && nowMin >= PLANNER_DAY_START && nowMin <= PLANNER_DAY_END
      ? `<div class="pl-now" style="--row:${(nowMin - PLANNER_DAY_START) / PLANNER_STEP}" aria-hidden="true"></div>`
      : "";
    return `<div class="pl-col${isToday ? " is-today" : ""}" data-date="${key}" aria-label="${escapeHtml(formatDayShort(key))}">${items.map(plannerBlockHTML).join("")}${nowLine}</div>`;
  }).join("");

  board.innerHTML = `${head}<div class="pl-body"><div class="pl-gutter" aria-hidden="true">${labels}</div>${cols}</div>`;

  if (!plannerDidInitialScroll && scroller.clientHeight > 0) {
    // First time the planner is shown: start near the morning (or just before "now")
    plannerDidInitialScroll = true;
    const slotH = board.querySelector(".pl-col").offsetHeight / PLANNER_SLOTS;
    const inThisWeek = days.some((d) => d.key === todayKey);
    const targetMin = Math.min(Math.max(7 * 60, inThisWeek ? nowMin - 60 : 0), PLANNER_DAY_END - 4 * 60);
    scroller.scrollTop = ((targetMin - PLANNER_DAY_START) / PLANNER_STEP) * slotH;
  } else {
    scroller.scrollTop = keepTop;
  }
  scroller.scrollLeft = keepLeft;

  renderPlannerViewer();
}

function renderPlannerViewer() {
  const list = $("pl-viewer-list");
  if (!list) return;
  const keepTop = list.scrollTop;
  const keepLeft = list.scrollLeft;

  const items = tasks
    .filter((t) => !t.completed && !isScheduled(t) && (plannerFilter === "all" || t.priority === plannerFilter))
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "") || (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));

  $("pl-viewer-count").textContent = items.length;
  document.querySelectorAll("[data-plfilter]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.plfilter === plannerFilter);
  });

  list.innerHTML = items.length
    ? items.map(plannerCardHTML).join("")
    : `<p class="pl-empty">${plannerFilter === "all" ? "Every pending task is on the planner." : `No ${plannerFilter.toLowerCase()} priority tasks waiting.`}</p>`;

  list.scrollTop = keepTop;
  list.scrollLeft = keepLeft;
}

function flushPlannerRender() {
  if (plannerRenderQueued) {
    plannerRenderQueued = false;
    renderPlanner();
  }
}

/* ---------- Drop-time maths (30-minute snapping) ---------- */

// pixels from the top of the day column -> nearest 30-minute line (0 = 4:30 AM)
function snapSlotIndex(pxFromTop, slotHeight) {
  return Math.max(0, Math.round(pxFromTop / slotHeight));
}

function plannerTargetAt(x, y, task, offsetY) {
  const viewer = $("pl-viewer").getBoundingClientRect();
  if (x >= viewer.left && x < viewer.right && y >= viewer.top && y < viewer.bottom) return { zone: "viewer" };

  const scroller = $("pl-scroll");
  const r = scroller.getBoundingClientRect();
  if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return null;

  const head = scroller.querySelector(".pl-head");
  const gutter = scroller.querySelector(".pl-gutter");
  if (!head || !gutter) return null;
  if (y < r.top + head.offsetHeight) return null;
  if (x < gutter.getBoundingClientRect().right) return null;

  for (const col of scroller.querySelectorAll(".pl-col")) {
    const cr = col.getBoundingClientRect();
    if (x < cr.left || x >= cr.right) continue;
    const slotH = cr.height / PLANNER_SLOTS;
    const idx = snapSlotIndex(y - offsetY - cr.top, slotH);
    const startMin = PLANNER_DAY_START + idx * PLANNER_STEP;
    const ok = startMin + task.durationMinutes <= PLANNER_DAY_END;
    return { zone: "grid", col, date: col.dataset.date, idx, startMin, ok };
  }
  return null;
}

/* ---------- Dragging ---------- */

function onPlannerPointerDown(e) {
  if (drag || resize) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;

  const handle = e.target.closest(".pl-resize");
  if (handle) { startResize(e, handle); return; }
  if (e.target.closest(".check")) return;

  const src = e.target.closest("[data-drag-id]");
  if (!src) return;
  const task = tasks.find((t) => t.id === src.dataset.dragId);
  if (!task) return;

  const rect = src.getBoundingClientRect();
  drag = {
    id: task.id,
    kind: src.dataset.kind,
    srcEl: src,
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    startX: e.clientX,
    startY: e.clientY,
    last: { x: e.clientX, y: e.clientY },
    // A block keeps the spot you grabbed it by; a card drops with its top at the pointer
    offsetY: src.dataset.kind === "block" ? e.clientY - rect.top : 0,
    active: false,
    target: null,
    label: "",
    timer: null,
    raf: 0
  };

  if (e.pointerType === "touch") drag.timer = setTimeout(activateDrag, 260);
  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragEnd);
  document.addEventListener("pointercancel", onDragCancel);
}

function activateDrag() {
  if (!drag || drag.active) return;
  const task = tasks.find((t) => t.id === drag.id);
  if (!task) { finishDrag(false); return; }

  drag.active = true;
  plannerBusy = true;
  clearTimeout(drag.timer);

  const ghost = document.createElement("div");
  ghost.className = `pl-ghost ${subjectClass(task.subject)}`;
  ghost.innerHTML = `<strong>${escapeHtml(task.title)}</strong><span>${task.durationMinutes} min</span>`;
  document.body.appendChild(ghost);
  drag.ghost = ghost;

  const drop = document.createElement("div");
  drop.className = "pl-drop";
  drag.dropEl = drop;

  document.body.classList.add("is-planner-dragging");
  drag.srcEl.classList.add("is-dragging");
  try { drag.srcEl.setPointerCapture(drag.pointerId); } catch (err) {}
  if (navigator.vibrate) navigator.vibrate(10);

  moveGhost();
  updateDragTarget();
  drag.raf = requestAnimationFrame(dragAutoScroll);
}

function onDragMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.last = { x: e.clientX, y: e.clientY };

  if (!drag.active) {
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (drag.pointerType === "touch") {
      if (moved > 8) finishDrag(false);   // finger moved before the hold finished: it's a scroll
    } else if (moved > 5) {
      activateDrag();
    }
    return;
  }
  if (e.cancelable) e.preventDefault();
  moveGhost();
  updateDragTarget();
}

function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.last = { x: e.clientX, y: e.clientY };
  if (drag.active) updateDragTarget();
  finishDrag(true);
}

function onDragCancel(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  finishDrag(false);
}

function moveGhost() {
  if (!drag || !drag.ghost) return;
  drag.ghost.style.transform = `translate(${drag.last.x + 14}px, ${drag.last.y + 14}px)`;
}

function clearTargetMarks() {
  document.querySelectorAll(".pl-col.is-target, .pl-col.is-target-bad").forEach((c) => c.classList.remove("is-target", "is-target-bad"));
}

function updateDragTarget() {
  if (!drag || !drag.active) return;
  const task = tasks.find((t) => t.id === drag.id);
  if (!task) return;

  const t = plannerTargetAt(drag.last.x, drag.last.y, task, drag.offsetY);
  drag.target = t;
  clearTargetMarks();
  $("pl-viewer").classList.toggle("is-return", Boolean(t && t.zone === "viewer" && drag.kind === "block"));

  if (!t || t.zone !== "grid") {
    drag.dropEl.remove();
    drag.label = "";
    return;
  }

  t.col.classList.add(t.ok ? "is-target" : "is-target-bad");
  if (drag.dropEl.parentElement !== t.col) t.col.appendChild(drag.dropEl);
  drag.dropEl.classList.toggle("is-invalid", !t.ok);
  drag.dropEl.style.setProperty("--row", Math.min(t.idx, PLANNER_SLOTS - 1));
  drag.dropEl.style.setProperty("--span", task.durationMinutes / PLANNER_STEP);

  const day = DAY_SHORT[parseDateKey(t.date).getDay()];
  const label = t.ok
    ? `${day} · ${formatClock(t.startMin)} – ${formatClock(t.startMin + task.durationMinutes)}`
    : `Would end after ${formatClock(PLANNER_DAY_END)}`;
  if (label !== drag.label) {
    drag.label = label;
    drag.dropEl.innerHTML = `<strong>${label}</strong>`;
  }
}

// Scroll the timetable (and the page) when dragging near an edge
function dragAutoScroll() {
  if (!drag || !drag.active) return;
  const { x, y } = drag.last;
  const speed = 14;
  const edge = 48;
  let scrolled = false;

  const scroller = $("pl-scroll");
  const r = scroller.getBoundingClientRect();
  if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) {
    const headH = scroller.querySelector(".pl-head").offsetHeight;
    const gutterW = scroller.querySelector(".pl-gutter").offsetWidth;
    let dx = 0;
    let dy = 0;
    if (y > r.bottom - edge) dy = speed;
    else if (y < r.top + headH + edge) dy = -speed;
    if (x > r.right - edge) dx = speed;
    else if (x < r.left + gutterW + edge) dx = -speed;
    if (dx || dy) { scroller.scrollBy(dx, dy); scrolled = true; }
  }
  if (y > window.innerHeight - 56) { window.scrollBy(0, speed); scrolled = true; }
  else if (y < 56) { window.scrollBy(0, -speed); scrolled = true; }

  if (scrolled) updateDragTarget();
  drag.raf = requestAnimationFrame(dragAutoScroll);
}

function finishDrag(drop) {
  const d = drag;
  if (!d) return;
  clearTimeout(d.timer);
  cancelAnimationFrame(d.raf);
  document.removeEventListener("pointermove", onDragMove);
  document.removeEventListener("pointerup", onDragEnd);
  document.removeEventListener("pointercancel", onDragCancel);

  if (d.ghost) d.ghost.remove();
  if (d.dropEl) d.dropEl.remove();
  if (d.srcEl) d.srcEl.classList.remove("is-dragging");
  try { if (d.active) d.srcEl.releasePointerCapture(d.pointerId); } catch (err) {}
  document.body.classList.remove("is-planner-dragging");
  clearTargetMarks();
  $("pl-viewer").classList.remove("is-return");

  drag = null;
  plannerBusy = false;
  if (d.active) plannerSuppressClickUntil = Date.now() + 350;

  if (d.active && drop) applyDrop(d);
  else flushPlannerRender();
}

function applyDrop(d) {
  const task = tasks.find((t) => t.id === d.id);
  const t = d.target;
  if (!task || !t) { flushPlannerRender(); return; }

  if (t.zone === "viewer") {
    if (d.kind === "block") {
      task.scheduledDate = null;
      task.startTime = null;
      commit();
      showToast("Moved back to the Task Viewer.", "success");
    } else {
      flushPlannerRender();
    }
    return;
  }

  if (!t.ok) {
    showToast(`A ${task.durationMinutes}-minute task can't start at ${formatClock(t.startMin)}. It would end after ${formatClock(PLANNER_DAY_END)}.`, "error");
    flushPlannerRender();
    return;
  }

  const time = minutesToTime(t.startMin);
  if (task.scheduledDate === t.date && task.startTime === time) { flushPlannerRender(); return; }

  // Same task object is updated in place, so nothing is ever duplicated
  task.scheduledDate = t.date;
  task.startTime = time;
  commit();
  showToast(`Planned for ${formatDayShort(t.date)} at ${formatClock(t.startMin)}.`, "success");
}

/* ---------- Resizing (drag the bottom edge of a block) ---------- */

function startResize(e, handle) {
  const block = handle.closest(".pl-block");
  const task = tasks.find((t) => t.id === handle.dataset.resizeId);
  if (!block || !task) return;
  e.preventDefault();
  e.stopPropagation();

  resize = {
    id: task.id,
    block,
    col: block.parentElement,
    handle,
    pointerId: e.pointerId,
    startMin: timeToMinutes(task.startTime),
    oldDur: task.durationMinutes,
    newDur: task.durationMinutes
  };
  plannerBusy = true;
  block.classList.add("is-resizing");
  document.body.classList.add("is-planner-resizing");
  try { handle.setPointerCapture(e.pointerId); } catch (err) {}
  handle.addEventListener("pointermove", onResizeMove);
  handle.addEventListener("pointerup", onResizeEnd);
  handle.addEventListener("pointercancel", onResizeCancel);
}

function onResizeMove(e) {
  if (!resize || e.pointerId !== resize.pointerId) return;
  const cr = resize.col.getBoundingClientRect();
  const slotH = cr.height / PLANNER_SLOTS;
  const endIdx = Math.round((e.clientY - cr.top) / slotH);
  const endMin = PLANNER_DAY_START + endIdx * PLANNER_STEP;
  const dur = Math.max(PLANNER_STEP, Math.min(endMin - resize.startMin, PLANNER_DAY_END - resize.startMin));
  resize.newDur = dur;

  resize.block.style.setProperty("--span", dur / PLANNER_STEP);
  resize.block.classList.toggle("is-short", dur <= PLANNER_STEP);
  const timeEl = resize.block.querySelector(".pl-block-time");
  if (timeEl) timeEl.textContent = `${formatClock(resize.startMin)} – ${formatClock(resize.startMin + dur)} · ${dur} min`;
}

function endResize(save) {
  const r = resize;
  if (!r) return;
  r.handle.removeEventListener("pointermove", onResizeMove);
  r.handle.removeEventListener("pointerup", onResizeEnd);
  r.handle.removeEventListener("pointercancel", onResizeCancel);
  try { r.handle.releasePointerCapture(r.pointerId); } catch (err) {}
  r.block.classList.remove("is-resizing");
  document.body.classList.remove("is-planner-resizing");

  resize = null;
  plannerBusy = false;
  plannerSuppressClickUntil = Date.now() + 350;

  const task = tasks.find((t) => t.id === r.id);
  if (save && task && r.newDur !== r.oldDur) {
    task.durationMinutes = r.newDur;
    commit();
  } else {
    plannerRenderQueued = false;
    renderPlanner();
  }
}
function onResizeEnd(e) { if (resize && e.pointerId === resize.pointerId) endResize(true); }
function onResizeCancel(e) { if (resize && e.pointerId === resize.pointerId) endResize(false); }

/* ---------- Wiring ---------- */

function populatePlanTimeOptions() {
  const select = $("form-plan-time");
  for (let m = PLANNER_DAY_START; m < PLANNER_DAY_END; m += PLANNER_STEP) {
    const opt = document.createElement("option");
    opt.value = minutesToTime(m);
    opt.textContent = formatClock(m);
    select.appendChild(opt);
  }
}

function setupPlannerEvents() {
  populatePlanTimeOptions();
  applyPlannerViewerPos();

  const view = $("view-planner");
  view.addEventListener("pointerdown", onPlannerPointerDown);
  view.addEventListener("dragstart", (e) => e.preventDefault());
  view.addEventListener("contextmenu", (e) => { if (drag) e.preventDefault(); });

  // A drag ends with a click on the block: swallow it so the edit dialog doesn't open
  view.addEventListener("click", (e) => {
    if (Date.now() < plannerSuppressClickUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // Once a touch drag has started, stop the page from scrolling under the finger
  document.addEventListener("touchmove", (e) => {
    if (drag && drag.active && e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drag) finishDrag(false);
  });

  $("pl-viewer").addEventListener("click", (e) => {
    const pos = e.target.closest("[data-plpos]");
    if (pos) {
      plannerViewerPos = pos.dataset.plpos === "top" ? "top" : "bottom";
      try { localStorage.setItem(PLANNER_VIEWER_POS_KEY, plannerViewerPos); } catch (err) { /* private mode */ }
      applyPlannerViewerPos();
      return;
    }
    const btn = e.target.closest("[data-plfilter]");
    if (!btn) return;
    plannerFilter = btn.dataset.plfilter;
    renderPlannerViewer();
  });

  // Keep the "now" line current
  setInterval(() => {
    if (currentView === "planner" && !plannerBusy) renderPlanner();
  }, 60000);
}

/* ==================================================
   HELPERS
================================================== */

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3400);
}

function formatDateReadable(dateStr) {
  if (!dateStr) return "";
  return parseDateKey(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDayShort(dateStr) {
  if (!dateStr) return "";
  return parseDateKey(dateStr).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ==================================================
   SUPER ANALYTICS
   Calculated only from the loaded `tasks` array plus a small
   completion log (kept on this device) because tasks do not store
   WHEN they were completed. Scheduled time = planned, never "actual".
   Anchors: task stats use the due date; activity (streaks, heatmap,
   completed-per-day) uses recorded completion dates.
================================================== */

const COMPLETION_LOG_KEY = "study_completion_log_v1";
const AN_SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Other"];
const AN_PRIOS = ["High", "Medium", "Low"];
const anFilter = { range: "30", subject: "all", from: "", to: "" };
const anCharts = {};

function anValidKey(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseDateKey(s);
  return !isNaN(d) && toDateKey(d) === s;
}
const anFmtMin = (m) => { m = Math.round(m || 0); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`; };
const anPct = (v) => (v == null ? "—" : `${v.toFixed(1)}%`);
const anRate = (d, t) => (t > 0 ? (d / t) * 100 : null);
const anSum = (list, f) => list.reduce((s, i) => s + f(i), 0);
const anCss = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const anSubjColor = (s) => anCss({ Mathematics: "--maths", Physics: "--phys", Chemistry: "--chem" }[s] || "--other");
const anLongDate = (k) => parseDateKey(k).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// One entry per completion, written when a task is ticked on this device.
const CompletionLog = {
  key() { return `${COMPLETION_LOG_KEY}:${currentUser ? currentUser.id : "local"}`; },
  read() { try { const a = JSON.parse(localStorage.getItem(this.key())); return Array.isArray(a) ? a : []; } catch (e) { return []; } },
  write(list) { try { localStorage.setItem(this.key(), JSON.stringify(list)); } catch (e) {} },
  snapshot(t) {
    const sched = isScheduled(t);
    return { taskId: t.id, title: t.title, subject: t.subject, priority: t.priority, recurring: !!t.recurring, dueDate: t.dueDate,
      scheduledDate: sched ? t.scheduledDate : null, duration: sched ? t.durationMinutes : null, date: getRelativeDate(0) };
  },
  record(s) { const l = this.read(); l.push(s); this.write(l); AnalyticsEngine.invalidate(); },
  removeLatest(id) {
    const l = this.read();
    for (let i = l.length - 1; i >= 0; i--) if (l[i].taskId === id) { l.splice(i, 1); break; }
    this.write(l); AnalyticsEngine.invalidate();
  }
};

const AnalyticsEngine = {
  _base: null,
  _cache: new Map(),
  invalidate() { this._base = null; this._cache.clear(); },

  // Turns tasks + log into "instances": one per open task, one per completed occurrence
  base() {
    if (this._base) return this._base;
    const log = CompletionLog.read().filter((e) => e && anValidKey(e.date));
    const byTask = new Map();
    log.forEach((e) => { if (!byTask.has(e.taskId)) byTask.set(e.taskId, []); byTask.get(e.taskId).push(e); });
    const inst = [], created = [], live = new Set();
    (Array.isArray(tasks) ? tasks : []).forEach((t) => {
      if (!t || typeof t !== "object") return;
      live.add(t.id);
      const subject = AN_SUBJECTS.includes(t.subject) ? t.subject : "Other";
      const priority = AN_PRIOS.includes(t.priority) ? t.priority : "Medium";
      const sched = isScheduled(t) && anValidKey(t.scheduledDate) && t.durationMinutes > 0;
      const mk = (o) => ({ taskId: t.id, title: t.title || "Untitled", subject, priority, recurring: !!t.recurring, ...o });
      const evs = byTask.get(t.id) || [];
      if (t.createdAt) { const d = new Date(t.createdAt); if (!isNaN(d)) created.push({ subject, date: toDateKey(d) }); }
      if (t.recurring) {
        if (!t.completed && anValidKey(t.dueDate)) inst.push(mk({ done: false, due: t.dueDate, sd: sched ? t.scheduledDate : null, dur: sched ? t.durationMinutes : null, cdate: null }));
        evs.forEach((e) => inst.push(mk({ done: true, due: anValidKey(e.dueDate) ? e.dueDate : e.date, sd: e.scheduledDate || null, dur: e.duration || null, cdate: e.date })));
        if (anValidKey(t.lastDone) && !evs.some((e) => e.date === t.lastDone)) inst.push(mk({ done: true, due: t.lastDone, sd: null, dur: null, cdate: t.lastDone }));
        else if (t.completed && !evs.length && anValidKey(t.dueDate)) inst.push(mk({ done: true, due: t.dueDate, sd: null, dur: null, cdate: null }));
      } else if (anValidKey(t.dueDate)) {
        const e = evs[evs.length - 1];
        inst.push(mk({ done: !!t.completed, due: t.dueDate, sd: sched ? t.scheduledDate : null, dur: sched ? t.durationMinutes : null, cdate: t.completed && e ? e.date : null }));
      }
    });
    // Completed work of tasks that were later deleted stays in the history
    log.forEach((e) => {
      if (live.has(e.taskId)) return;
      inst.push({ taskId: e.taskId, title: e.title || "Deleted task", subject: AN_SUBJECTS.includes(e.subject) ? e.subject : "Other",
        priority: AN_PRIOS.includes(e.priority) ? e.priority : "Medium", recurring: !!e.recurring, done: true,
        due: anValidKey(e.dueDate) ? e.dueDate : e.date, sd: e.scheduledDate || null, dur: e.duration || null, cdate: e.date });
    });
    this._base = { inst, created, undated: inst.filter((i) => i.done && !i.cdate).length,
      firstLog: log.reduce((m, e) => (!m || e.date < m ? e.date : m), null) };
    return this._base;
  },

  range(f) {
    const today = getRelativeDate(0);
    const n = { 7: 6, 30: 29, 90: 89 }[f.range];
    if (n !== undefined) return { from: shiftDateKey(today, -n), to: today };
    if (f.range === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
    if (f.range === "custom") return { from: anValidKey(f.from) ? f.from : null, to: anValidKey(f.to) ? f.to : null };
    return { from: null, to: null };
  },
  inR(d, r) { return !!d && (!r.from || d >= r.from) && (!r.to || d <= r.to); },
  prevRange(r) {
    if (!r.from || !r.to || r.to < r.from) return null;
    const len = daysBetween(r.from, r.to) + 1;
    return { from: shiftDateKey(r.from, -len), to: shiftDateKey(r.from, -1) };
  },
  agg(items, today) {
    const total = items.length, done = items.filter((i) => i.done).length;
    return { total, done, pending: total - done, overdue: items.filter((i) => !i.done && i.due < today).length, rate: anRate(done, total) };
  },
  slice(f, r) {
    const b = this.base(), sub = (i) => f.subject === "all" || i.subject === f.subject;
    return {
      items: b.inst.filter((i) => sub(i) && this.inR(i.due, r)),
      sched: b.inst.filter((i) => sub(i) && i.sd && i.dur && this.inR(i.sd, r)),
      comps: b.inst.filter((i) => sub(i) && i.done && i.cdate && this.inR(i.cdate, r)),
      created: b.created.filter((c) => sub(c) && this.inR(c.date, r))
    };
  },
  context(f) {
    const today = getRelativeDate(0), range = this.range(f), pr = this.prevRange(range);
    const all = this.base().inst.filter((i) => f.subject === "all" || i.subject === f.subject);
    return { f, today, range, ...this.slice(f, range), prev: pr ? this.slice(f, pr) : null, all, allComps: all.filter((i) => i.done && i.cdate) };
  },

  calculateStreaks(c) {
    const set = new Set(c.allComps.map((i) => i.cdate));
    let best = 0, run = 0, prev = null;
    [...set].sort().forEach((d) => { run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; });
    let cur = 0, d = set.has(c.today) ? c.today : shiftDateKey(c.today, -1);
    while (set.has(d)) { cur++; d = shiftDateKey(d, -1); }
    return { current: cur, best, set };
  },

  calculateTrends(a, p, sm, pm) {
    const none = { dir: "none", text: "No previous-period data" };
    if (!p || p.total === 0) return { rate: none, total: none, done: none, sched: none };
    const mk = (d, unit) => (Math.abs(d) < 0.05 ? { dir: "flat", text: "→ stable vs previous period" }
      : { dir: d > 0 ? "up" : "down", text: `${d > 0 ? "↑" : "↓"} ${Math.abs(d).toFixed(1)}${unit} vs previous period` });
    const pts = (x, y) => (x == null || y == null ? none : mk(x - y, " pts"));
    const rel = (x, y) => (!y ? none : mk(((x - y) / y) * 100, "%"));
    return { rate: pts(a.rate, p.rate), total: rel(a.total, p.total), done: rel(a.done, p.done), sched: rel(sm, pm) };
  },

  calculateOverview(c) {
    const a = this.agg(c.items, c.today), p = c.prev ? this.agg(c.prev.items, c.today) : null;
    const schedMin = anSum(c.sched, (i) => i.dur), pMin = c.prev ? anSum(c.prev.sched, (i) => i.dur) : null;
    const st = this.calculateStreaks(c);
    const act = new Set(c.comps.map((i) => i.cdate));
    const from = c.range.from || [...act].sort()[0] || null;
    const to = c.range.to && c.range.to < c.today ? c.range.to : c.today;
    const n = from && from <= to ? daysBetween(from, to) + 1 : 0;
    return { ...a, schedMin, streak: st, activeDays: act.size, inactiveDays: n ? Math.max(0, n - act.size) : null,
      trends: this.calculateTrends(a, p, schedMin, pMin) };
  },

  calculateSubjectStats(c) {
    const subs = c.f.subject === "all" ? AN_SUBJECTS : [c.f.subject];
    return subs.map((s) => {
      const it = c.items.filter((i) => i.subject === s), sc = c.sched.filter((i) => i.subject === s), a = this.agg(it, c.today);
      const pit = c.prev ? c.prev.items.filter((i) => i.subject === s) : [];
      const pa = pit.length ? this.agg(pit, c.today) : null, pm = anSum(sc, (i) => i.dur);
      return { subject: s, ...a, plannedMin: pm, avgDur: sc.length ? pm / sc.length : null,
        trend: pa && a.rate != null && pa.rate != null ? a.rate - pa.rate : null };
    });
  },

  calculatePriorityStats(c) {
    return AN_PRIOS.map((p) => {
      const sc = c.sched.filter((i) => i.priority === p);
      return { priority: p, ...this.agg(c.items.filter((i) => i.priority === p), c.today), plannedMin: anSum(sc, (i) => i.dur) };
    });
  },

  calculateDailyStats(c) {
    const dates = [...c.items.map((i) => i.due), ...c.comps.map((i) => i.cdate), ...c.created.map((i) => i.date)].sort();
    const from = c.range.from || dates[0];
    const to = c.range.to && c.range.to < c.today ? c.range.to : c.today;
    if (!from || from > to) return null;
    const n = daysBetween(from, to) + 1, unit = n <= 31 ? "day" : n <= 400 ? "week" : "month";
    const key = (d) => (unit === "day" ? d : unit === "week" ? mondayKeyOf(parseDateKey(d)) : `${d.slice(0, 7)}-01`);
    const keys = [], seen = new Set();
    for (let d = from; d <= to; d = shiftDateKey(d, 1)) { const k = key(d); if (!seen.has(k)) { seen.add(k); keys.push(k); } }
    const mk = () => Object.fromEntries(keys.map((k) => [k, 0]));
    const cr = mk(), co = mk(), tot = mk(), dn = mk();
    c.created.forEach((i) => { const k = key(i.date); if (k in cr) cr[k]++; });
    c.comps.forEach((i) => { const k = key(i.cdate); if (k in co) co[k]++; });
    c.items.forEach((i) => { if (i.due > to) return; const k = key(i.due); if (k in tot) { tot[k]++; if (i.done) dn[k]++; } });
    const label = (k) => (unit === "month" ? parseDateKey(k).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : `${unit === "week" ? "Wk " : ""}${parseDateKey(k).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    const hasData = keys.some((k) => cr[k] || co[k] || tot[k]);
    return hasData ? { unit, labels: keys.map(label), created: keys.map((k) => cr[k]), completed: keys.map((k) => co[k]),
      rate: keys.map((k) => (tot[k] ? (dn[k] / tot[k]) * 100 : null)) } : null;
  },

  calculatePlannerStats(c) {
    const s = c.sched, done = s.filter((i) => i.done).length;
    const wk = {};
    s.forEach((i) => { const k = mondayKeyOf(parseDateKey(i.sd)); wk[k] = (wk[k] || 0) + i.dur; });
    return { planned: s.length, done, remaining: s.length - done, rate: anRate(done, s.length), minutes: anSum(s, (i) => i.dur),
      bySubject: AN_SUBJECTS.map((x) => ({ subject: x, min: anSum(s.filter((i) => i.subject === x), (i) => i.dur) })),
      byDay: [1, 2, 3, 4, 5, 6, 0].map((d) => ({ day: d, min: anSum(s.filter((i) => parseDateKey(i.sd).getDay() === d), (i) => i.dur) })),
      byWeek: Object.keys(wk).sort().slice(-8).map((k) => ({ week: k, min: wk[k] })),
      avg: s.length ? anSum(s, (i) => i.dur) / s.length : null,
      longest: s.reduce((m, i) => (!m || i.dur > m.dur ? i : m), null),
      shortest: s.reduce((m, i) => (!m || i.dur < m.dur ? i : m), null) };
  },

  calculateTaskStats(c) {
    const grp = (list) => ({ ...this.agg(list, c.today) });
    const rec = c.items.filter((i) => i.recurring), per = {};
    rec.forEach((i) => { (per[i.taskId] = per[i.taskId] || { title: i.title, t: 0, d: 0 }).t++; if (i.done) per[i.taskId].d++; });
    const ranked = Object.values(per).filter((x) => x.t >= 3).map((x) => ({ title: x.title, rate: (x.d / x.t) * 100, n: x.t })).sort((a, b) => b.rate - a.rate);
    return { normal: grp(c.items.filter((i) => !i.recurring)), recurring: grp(rec), scheduled: grp(c.items.filter((i) => i.sd)),
      templates: (Array.isArray(tasks) ? tasks : []).filter((t) => t && t.recurring && (c.f.subject === "all" || t.subject === c.f.subject)).length,
      best: ranked[0] || null, worst: ranked.length > 1 ? ranked[ranked.length - 1] : null };
  },

  window(f, from, to) {
    const s = this.slice(f, { from, to }), a = this.agg(s.items, getRelativeDate(0)), pd = s.sched.filter((i) => i.done).length;
    return { created: s.created.length, completed: s.comps.length, ...a, planned: s.sched.length, plannedDone: pd,
      plannedMin: anSum(s.sched, (i) => i.dur), exec: anRate(pd, s.sched.length) };
  },

  calculateWeeklyStats(f) {
    const today = getRelativeDate(0), mon = mondayKeyOf(new Date()), el = daysBetween(mon, today), lm = shiftDateKey(mon, -7);
    return { cur: this.window(f, mon, today), prev: this.window(f, lm, shiftDateKey(lm, el)), days: el + 1 };
  },

  calculateMonthlyStats(f) {
    const now = new Date(), today = getRelativeDate(0), out = [];
    for (let i = 5; i >= 0; i--) {
      const first = new Date(now.getFullYear(), now.getMonth() - i, 1), last = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const to = toDateKey(last) > today ? today : toDateKey(last);
      out.push({ label: first.toLocaleDateString("en-US", { month: "short" }), ...this.window(f, toDateKey(first), to) });
    }
    return out;
  },

  calculateDayStats(c) {
    const cnt = Array(7).fill(0), min = Array(7).fill(0);
    c.comps.forEach((i) => cnt[parseDateKey(i.cdate).getDay()]++);
    c.sched.forEach((i) => { min[parseDateKey(i.sd).getDay()] += i.dur; });
    const ok = c.comps.length >= 7, ord = [1, 2, 3, 4, 5, 6, 0];
    const pick = (arr, cmp) => ord.reduce((m, d) => (m === null || cmp(arr[d], arr[m]) ? d : m), null);
    return { best: ok ? pick(cnt, (a, b) => a > b) : null, low: ok ? pick(cnt, (a, b) => a < b) : null,
      sched: anSum(c.sched, (i) => i.dur) > 0 ? pick(min, (a, b) => a > b) : null, cnt, min };
  },

  calculateRecords(c) {
    const st = this.calculateStreaks(c), per = {}, wk = {}, mo = {}, subj = {}, sday = {}, wi = {};
    c.allComps.forEach((i) => {
      per[i.cdate] = (per[i.cdate] || 0) + 1;
      const w = mondayKeyOf(parseDateKey(i.cdate)); wk[w] = (wk[w] || 0) + 1;
      const m = i.cdate.slice(0, 7); mo[m] = (mo[m] || 0) + 1;
      subj[i.subject] = (subj[i.subject] || 0) + 1;
    });
    c.all.forEach((i) => { if (i.sd && i.dur) sday[i.sd] = (sday[i.sd] || 0) + i.dur; const w = mondayKeyOf(parseDateKey(i.due)); (wi[w] = wi[w] || { t: 0, d: 0 }).t++; if (i.done) wi[w].d++; });
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0] || null;
    const wr = Object.entries(wi).filter(([, v]) => v.t >= 5).map(([k, v]) => [k, (v.d / v.t) * 100]).sort((a, b) => b[1] - a[1])[0] || null;
    return { streak: st.best, day: top(per), sched: top(sday), week: top(wk), month: top(mo), subject: top(subj), weekRate: wr };
  },

  calculateHeat(c) {
    const counts = {};
    c.allComps.forEach((i) => { counts[i.cdate] = (counts[i.cdate] || 0) + 1; });
    const end = c.range.to && c.range.to < c.today ? c.range.to : c.today;
    let start = c.range.from || shiftDateKey(end, -181);
    const span = daysBetween(start, end) + 1;
    if (span < 84) start = shiftDateKey(end, -83); else if (span > 371) start = shiftDateKey(end, -370);
    const cells = [];
    for (let d = mondayKeyOf(parseDateKey(start)); d <= end; d = shiftDateKey(d, 1)) {
      cells.push({ d, n: counts[d] || 0, out: (c.range.from && d < c.range.from) || d < start });
    }
    return { cells, max: Math.max(0, ...cells.filter((x) => !x.out).map((x) => x.n)), from: start, to: end };
  },

  generateInsights(r) {
    const out = [], o = r.overview, w = r.weekly, add = (cls, icon, text) => out.push({ cls, icon, text });
    if (w.prev.completed > 0) {
      const d = ((w.cur.completed - w.prev.completed) / w.prev.completed) * 100;
      if (Math.abs(d) >= 1) add(d > 0 ? "good" : "warn", d > 0 ? "🔥" : "⚠️", `You completed ${Math.abs(d).toFixed(0)}% ${d > 0 ? "more" : "fewer"} tasks than on the same days last week.`);
    }
    const ranked = r.subjects.filter((s) => s.total >= 5 && s.rate != null).sort((a, b) => a.rate - b.rate);
    if (ranked.length > 1 && ranked[0].rate < ranked[ranked.length - 1].rate) add("warn", "⚠️", `${ranked[0].subject} has the lowest completion rate among your subjects (${anPct(ranked[0].rate)}).`);
    if (r.days.sched !== null) add("info", "📅", `${getDayName(r.days.sched)} has the highest scheduled workload (${anFmtMin(r.days.min[r.days.sched])}).`);
    if (o.overdue > 0) add("warn", "⚠️", `You have ${o.overdue} overdue task${o.overdue === 1 ? "" : "s"} in this period.`);
    else if (o.total > 0) add("good", "✅", "No overdue tasks in this period.");
    if (o.streak.current >= 3) add("good", "🔥", `You have maintained a ${o.streak.current}-day completion streak.`);
    const hi = r.priority[0], lo = r.priority[2];
    if (hi.total >= 5 && lo.total >= 5 && lo.rate - hi.rate >= 10) add("warn", "⚠️", `High-priority tasks are completed less often (${anPct(hi.rate)}) than low-priority ones (${anPct(lo.rate)}).`);
    if (r.planner.planned >= 5 && r.planner.rate < 60) add("warn", "📅", `Only ${anPct(r.planner.rate)} of your scheduled tasks are completed.`);
    return out;
  },

  compute(f) {
    const key = JSON.stringify(f);
    if (this._cache.has(key)) return this._cache.get(key);
    const c = this.context(f);
    const res = { c, overview: this.calculateOverview(c), subjects: this.calculateSubjectStats(c), priority: this.calculatePriorityStats(c),
      daily: this.calculateDailyStats(c), tasks: this.calculateTaskStats(c), planner: this.calculatePlannerStats(c),
      weekly: this.calculateWeeklyStats(f), monthly: this.calculateMonthlyStats(f), days: this.calculateDayStats(c),
      records: this.calculateRecords(c), heat: this.calculateHeat(c), base: this.base() };
    res.insights = this.generateInsights(res);
    this._cache.set(key, res);
    return res;
  }
};

/* ---------- Rendering ---------- */

function anTrendHTML(t) { return `<span class="an-trend an-${t.dir}">${escapeHtml(t.text)}</span>`; }
function anCard(label, value, sub, cls = "") { return `<div class="an-card ${cls}"><span class="an-label">${label}</span><strong class="an-value">${value}</strong><span class="an-sub">${sub || ""}</span></div>`; }
function anPanel(title, body, extra = "") { return `<section class="panel an-panel ${extra}"><h2 class="panel-title">${title}</h2>${body}</section>`; }
function anChartBox(id, ok) { return ok ? `<div class="an-chart"><canvas id="${id}"></canvas></div>` : '<p class="an-empty">Not enough data yet</p>'; }
function anRow(label, value) { return `<div class="an-row"><span>${label}</span><strong>${value}</strong></div>`; }

function anDraw(id, cfg) {
  const el = $(id);
  if (!el) return;
  if (typeof Chart === "undefined") { el.parentElement.innerHTML = '<p class="an-empty">Charts unavailable (Chart.js did not load).</p>'; return; }
  const ink = anCss("--ink-3"), line = anCss("--line");
  cfg.options = { responsive: true, maintainAspectRatio: false, ...(cfg.options || {}) };
  cfg.options.plugins = { legend: { display: (cfg.data.datasets || []).length > 1, labels: { color: anCss("--ink-2"), boxWidth: 12 } }, ...(cfg.options.plugins || {}) };
  const sc = cfg.options.scales || {};
  Object.keys(sc).forEach((k) => { sc[k].ticks = { color: ink, ...(sc[k].ticks || {}) }; sc[k].grid = { color: line, ...(sc[k].grid || {}) }; });
  anCharts[id] = new Chart(el, cfg);
}

function renderAnalytics() {
  const root = $("an-root");
  if (!root) return;
  Object.keys(anCharts).forEach((k) => { try { anCharts[k].destroy(); } catch (e) {} delete anCharts[k]; });
  const r = AnalyticsEngine.compute(anFilter), o = r.overview, tk = r.tasks, pl = r.planner, wk = r.weekly, noData = !r.c.items.length && !r.c.comps.length;
  const subjLabel = anFilter.subject === "all" ? "" : ` ${anFilter.subject}`;

  if (noData && !r.c.sched.length) {
    root.innerHTML = `<div class="panel an-panel an-bigempty"><i class="fa-solid fa-chart-line"></i><h2>${anFilter.subject === "all" ? "No analytics available yet." : `No ${escapeHtml(anFilter.subject)} data available for this period.`}</h2><p>${anFilter.subject === "all" ? "Complete a few tasks to start building your Study Board analytics." : "Try another date range or subject."}</p></div>`;
    return;
  }
  const t = o.trends, ed = (v) => (v == null ? "Not enough data" : v);
  let h = '<div class="an-cards">';
  h += anCard("Total tasks", o.total, anTrendHTML(t.total));
  h += anCard("Completed", o.done, anTrendHTML(t.done), "is-ok");
  h += anCard("Completion rate", anPct(o.rate), anTrendHTML(t.rate));
  h += anCard("Pending", o.pending, "in this period");
  h += anCard("Overdue", o.overdue, "in this period", o.overdue ? "is-late" : "");
  h += anCard("Scheduled time", o.schedMin ? anFmtMin(o.schedMin) : "—", o.schedMin ? anTrendHTML(t.sched) : "Nothing scheduled");
  h += anCard("Current streak", `${o.streak.current}d`, `Best ${o.streak.best}d · from recorded completions`);
  h += anCard("Active days", o.activeDays, o.inactiveDays == null ? "" : `${o.inactiveDays} inactive`);
  h += "</div>";

  const notes = [];
  if (r.base.undated) notes.push(`${r.base.undated} completed task${r.base.undated === 1 ? " has" : "s have"} no recorded completion date, so ${r.base.undated === 1 ? "it is" : "they are"} left out of streaks, the heatmap and completed-per-day charts.`);
  notes.push(r.base.firstLog ? `Completion dates are recorded on this device from ${anLongDate(r.base.firstLog)}. Older completions only appear if a recurring task's last-done date is known.` : "Completion dates are recorded on this device from your next completed task onward.");
  notes.push("“Created” uses each task's cloud creation date. Scheduled time is planned time, not tracked study time.");
  h += `<p class="an-note"><i class="fa-solid fa-circle-info"></i> ${notes.map(escapeHtml).join(" ")}</p>`;

  h += `<div class="an-cols">${anPanel(`Daily task activity${subjLabel ? " ·" + escapeHtml(subjLabel) : ""}`, anChartBox("an-c-daily", r.daily))}${anPanel("Completion trend", anChartBox("an-c-rate", r.daily && r.daily.rate.some((v) => v != null)))}</div>`;

  h += anPanel("Subject analytics", `<div class="an-subjects">${r.subjects.map((s) => s.total === 0 && !s.plannedMin
    ? `<div class="an-subj ${subjectClass(s.subject)}"><h3>${escapeHtml(s.subject)}</h3><p class="an-empty">No ${escapeHtml(s.subject)} data available for this period.</p></div>`
    : `<div class="an-subj ${subjectClass(s.subject)}"><h3>${escapeHtml(s.subject)}</h3>${anRow("Completion", anPct(s.rate))}${anRow("Tasks", s.total)}${anRow("Completed", s.done)}${anRow("Pending", s.pending)}${anRow("Overdue", s.overdue)}${anRow("Planned time", s.plannedMin ? anFmtMin(s.plannedMin) : "—")}${anRow("Avg scheduled duration", s.avgDur ? anFmtMin(s.avgDur) : "—")}${anRow("Trend", s.trend == null ? "No previous-period data" : `${s.trend > 0 ? "↑" : s.trend < 0 ? "↓" : "→"} ${Math.abs(s.trend).toFixed(1)} pts`)}</div>`).join("")}</div>`);

  h += `<div class="an-cols">${anPanel("Subject completion rate", anChartBox("an-c-subj", r.subjects.some((s) => s.rate != null)))}${anPanel("Planned time by subject", anChartBox("an-c-plan", pl.minutes > 0))}</div>`;

  h += `<div class="an-cols">${anPanel("Planner execution", pl.planned ? `<div class="an-big">${anPct(pl.rate)}</div><p class="an-sub">of scheduled tasks completed (schedule completion, not study time)</p>${anRow("Planned tasks", pl.planned)}${anRow("Completed", pl.done)}${anRow("Remaining", pl.remaining)}${anRow("Total planned time", anFmtMin(pl.minutes))}${anRow("Average task duration", anFmtMin(pl.avg))}${anRow("Longest", pl.longest ? `${escapeHtml(pl.longest.title)} · ${pl.longest.dur} min` : "—")}${anRow("Shortest", pl.shortest ? `${escapeHtml(pl.shortest.title)} · ${pl.shortest.dur} min` : "—")}${anRow("Planned by weekday", pl.byDay.filter((x) => x.min).map((x) => `${DAY_SHORT[x.day]} ${anFmtMin(x.min)}`).join(" · ") || "—")}${anRow("Planned by week", pl.byWeek.map((x) => `${formatDayShort(x.week).replace(/^\w+ /, "")}: ${anFmtMin(x.min)}`).join(" · ") || "—")}` : '<p class="an-empty">Not enough data yet</p>')}`
    + anPanel("Priority analytics", `${anChartBox("an-c-prio", r.priority.some((p) => p.rate != null))}<div class="an-mini">${r.priority.map((p) => `<div><strong>${p.priority}</strong><span>${p.total} tasks · ${p.done} done · ${p.pending} pending · ${p.overdue} overdue</span></div>`).join("")}</div>`) + "</div>";

  const oi = r.c.items.filter((i) => !i.done && i.due < r.c.today).sort((a, b) => a.due.localeCompare(b.due));
  const thisMon = mondayKeyOf(new Date());
  h += anPanel("Overdue tasks", `<div class="an-cols an-tight"><div class="an-card ${oi.length ? "is-late" : ""}"><span class="an-label">Overdue</span><strong class="an-value">${oi.length}</strong><span class="an-sub">${oi.filter((i) => i.due >= thisMon).length} due this week</span></div><div>${AN_SUBJECTS.map((s) => anRow(s, oi.filter((i) => i.subject === s).length)).join("")}${AN_PRIOS.map((p) => anRow(`${p} priority`, oi.filter((i) => i.priority === p).length)).join("")}${anRow("Oldest", oi[0] ? `${escapeHtml(oi[0].title)} · ${daysBetween(oi[0].due, r.c.today)}d late` : "—")}</div></div>${oi.length ? '<button type="button" class="btn btn-secondary" data-cmd="analytics-overdue"><i class="fa-solid fa-list-check"></i> Open pending tasks</button>' : ""}`);

  const cmp = (a, b, pct) => `${pct ? anPct(a) : a} <span class="an-sub">vs ${pct ? anPct(b) : b} last week</span>`;
  h += `<div class="an-cols">${anPanel(`This week so far (${wk.days} day${wk.days === 1 ? "" : "s"}) vs same days last week`, anRow("Tasks created", cmp(wk.cur.created, wk.prev.created)) + anRow("Tasks completed", cmp(wk.cur.completed, wk.prev.completed)) + anRow("Completion rate", cmp(wk.cur.rate, wk.prev.rate, true)) + anRow("Planned time", `${anFmtMin(wk.cur.plannedMin)} <span class="an-sub">vs ${anFmtMin(wk.prev.plannedMin)}</span>`) + anRow("Scheduled · completed", `${wk.cur.planned} · ${wk.cur.plannedDone}`) + anRow("Execution rate", cmp(wk.cur.exec, wk.prev.exec, true)))}${anPanel("Monthly performance", anChartBox("an-c-month", r.monthly.some((m) => m.total || m.completed)) + `<div class="an-mini">${(() => { const m = r.monthly[r.monthly.length - 1]; return `<div><strong>This month</strong><span>${m.completed} completed · ${anPct(m.rate)} · ${anFmtMin(m.plannedMin)} planned · ${m.overdue} overdue</span></div>`; })()}</div>`)}</div>`;

  h += `<div class="an-cols">${anPanel("Task types", `${anRow("Normal tasks", `${tk.normal.total} · ${anPct(tk.normal.rate)}`)}${anRow("Recurring tasks", `${tk.recurring.total} · ${anPct(tk.recurring.rate)}`)}${anRow("Scheduled tasks", `${tk.scheduled.total} · ${anPct(tk.scheduled.rate)}`)}`)}`
    + anPanel("Recurring task performance", tk.recurring.total ? `${anRow("Recurring templates", tk.templates)}${anRow("Completed occurrences", tk.recurring.done)}${anRow("Pending occurrences", tk.recurring.pending)}${anRow("Completion rate", anPct(tk.recurring.rate))}${anRow("Most reliable", tk.best ? `${escapeHtml(tk.best.title)} · ${anPct(tk.best.rate)}` : "Not enough data")}${anRow("Least reliable", tk.worst ? `${escapeHtml(tk.worst.title)} · ${anPct(tk.worst.rate)}` : "Not enough data")}` : '<p class="an-empty">Not enough data yet</p>') + "</div>";

  const hm = r.heat, lvl = (n) => (!n ? 0 : Math.min(4, Math.ceil((n / hm.max) * 4)));
  h += anPanel("Activity heatmap", hm.max ? `<div class="an-heat" role="img" aria-label="Completed tasks per day">${hm.cells.map((x) => x.out ? '<span class="an-cell out"></span>' : `<span class="an-cell l${lvl(x.n)}" title="${anLongDate(x.d)}: ${x.n} task${x.n === 1 ? "" : "s"} completed"></span>`).join("")}</div><div class="an-legend">Less <span class="an-cell l0"></span><span class="an-cell l1"></span><span class="an-cell l2"></span><span class="an-cell l3"></span><span class="an-cell l4"></span> More · ${anLongDate(hm.from)} – ${anLongDate(hm.to)}</div>` : '<p class="an-empty">Not enough data yet</p>');

  const dy = r.days, nm = (d, a, u) => (d === null ? "Not enough data" : `${getDayName(d)} — ${a[d]}${u}`);
  h += anPanel("Best and lowest days", anRow("🔥 Most productive day", nm(dy.best, dy.cnt, " completed")) + anRow("📉 Lowest activity", nm(dy.low, dy.cnt, " completed")) + anRow("📅 Most scheduled day", dy.sched === null ? "Not enough data" : `${getDayName(dy.sched)} — ${anFmtMin(dy.min[dy.sched])}`));

  h += anPanel("Automatic insights", r.insights.length ? `<ul class="an-insights">${r.insights.map((i) => `<li class="an-ins an-${i.cls}"><span>${i.icon}</span>${escapeHtml(i.text)}</li>`).join("")}</ul>` : '<p class="an-empty">Not enough data yet</p>');

  const rc = r.records, rows = [];
  if (rc.streak) rows.push(["Longest streak", `${rc.streak} days`]);
  if (rc.day) rows.push(["Most completed in one day", `${rc.day[1]} · ${anLongDate(rc.day[0])}`]);
  if (rc.sched) rows.push(["Most scheduled time in one day", `${anFmtMin(rc.sched[1])} · ${anLongDate(rc.sched[0])}`]);
  if (rc.weekRate) rows.push(["Highest weekly completion rate", `${anPct(rc.weekRate[1])} · week of ${anLongDate(rc.weekRate[0])}`]);
  if (rc.week) rows.push(["Most productive week", `${rc.week[1]} completed · week of ${anLongDate(rc.week[0])}`]);
  if (rc.month) rows.push(["Most productive month", `${rc.month[1]} completed · ${parseDateKey(`${rc.month[0]}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`]);
  if (rc.subject) rows.push(["Subject with most completions", `${escapeHtml(rc.subject[0])} · ${rc.subject[1]}`]);
  h += anPanel("Personal records", rows.length ? rows.map((x) => anRow(x[0], x[1])).join("") : '<p class="an-empty">Not enough data yet</p>');

  root.innerHTML = h;

  const sc = (extra = {}) => ({ x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, ...extra } });
  if (r.daily) {
    anDraw("an-c-daily", { type: "bar", data: { labels: r.daily.labels, datasets: [{ label: "Created", data: r.daily.created, backgroundColor: anCss("--maths") }, { label: "Completed", data: r.daily.completed, backgroundColor: anCss("--ok") }] }, options: { scales: sc({ ticks: { precision: 0 } }) } });
    anDraw("an-c-rate", { type: "line", data: { labels: r.daily.labels, datasets: [{ label: "Completion %", data: r.daily.rate, borderColor: anCss("--focus"), backgroundColor: anCss("--focus"), spanGaps: true, tension: 0.25 }] }, options: { scales: sc({ max: 100, ticks: { callback: (v) => `${v}%` } }) } });
  }
  anDraw("an-c-subj", { type: "bar", data: { labels: r.subjects.map((s) => s.subject), datasets: [{ data: r.subjects.map((s) => (s.rate == null ? 0 : +s.rate.toFixed(1))), backgroundColor: r.subjects.map((s) => anSubjColor(s.subject)) }] }, options: { indexAxis: "y", scales: { x: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } }, y: { grid: { display: false } } } } });
  anDraw("an-c-plan", { type: "bar", data: { labels: pl.bySubject.map((s) => s.subject), datasets: [{ data: pl.bySubject.map((s) => +(s.min / 60).toFixed(2)), backgroundColor: pl.bySubject.map((s) => anSubjColor(s.subject)) }] }, options: { indexAxis: "y", scales: { x: { beginAtZero: true, ticks: { callback: (v) => `${v}h` } }, y: { grid: { display: false } } } } });
  anDraw("an-c-prio", { type: "bar", data: { labels: r.priority.map((p) => p.priority), datasets: [{ data: r.priority.map((p) => (p.rate == null ? 0 : +p.rate.toFixed(1))), backgroundColor: [anCss("--danger"), anCss("--warn"), anCss("--ok")] }] }, options: { scales: sc({ max: 100, ticks: { callback: (v) => `${v}%` } }) } });
  anDraw("an-c-month", { data: { labels: r.monthly.map((m) => m.label), datasets: [{ type: "bar", label: "Completed", data: r.monthly.map((m) => m.completed), backgroundColor: anCss("--ok"), yAxisID: "y" }, { type: "line", label: "Completion %", data: r.monthly.map((m) => (m.rate == null ? null : +m.rate.toFixed(1))), borderColor: anCss("--focus"), backgroundColor: anCss("--focus"), spanGaps: true, yAxisID: "y1" }] }, options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } }, y1: { position: "right", min: 0, max: 100, grid: { display: false }, ticks: { callback: (v) => `${v}%` } } } } });
}

function openAnalyticsOverdue() {
  if (anFilter.subject !== "all") subjectFilter.value = anFilter.subject; else subjectFilter.value = "all";
  priorityFilter.value = "all"; searchInput.value = ""; sortSelect.value = "dueDate-asc"; activeDayFilter = null;
  setTab("pending");
  renderApp();
  setView("tasks");
}

function setupAnalyticsEvents() {
  const sync = () => {
    anFilter.range = $("an-range").value; anFilter.subject = $("an-subject").value;
    anFilter.from = $("an-from").value; anFilter.to = $("an-to").value;
    $("an-custom").classList.toggle("hidden", anFilter.range !== "custom");
    renderAnalytics();
  };
  ["an-range", "an-subject", "an-from", "an-to"].forEach((id) => $(id).addEventListener("change", sync));
  $("an-range").value = anFilter.range;
}

/* ==================================================
   START
================================================== */

applyTheme(document.documentElement.getAttribute("data-theme") || "light");
setupEventListeners();
setupPlannerEvents();
setupAnalyticsEvents();
setView(VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home");
tasks = [];
renderApp();

(async function startApp() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await initializeAuthenticatedApp(session);
  } else {
    showLogin();
  }
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (session && !currentUser) await initializeAuthenticatedApp(session);
    else if (!session && currentUser) handleSignOut();
  });
})();
