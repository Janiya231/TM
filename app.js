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
  return list;
}

/* ==================================================
   STORAGE + SUPABASE CLOUD SYNC
================================================== */

const STORAGE_KEY = "study_tasks_v2";
const THEME_KEY = "study_theme";

function taskToRow(task) {
  return {
    id: task.id, user_id: currentUser.id, title: task.title || "", subject: task.subject || "Other",
    due_date: task.dueDate, priority: task.priority || "Medium", completed: !!task.completed,
    recurring: !!task.recurring, day_of_week: Number.isInteger(task.dayOfWeek) ? task.dayOfWeek : null,
    end_date: task.endDate || null, last_done: task.lastDone || null, notes: task.notes || "",
    updated_at: new Date().toISOString()
  };
}

function rowToTask(row) {
  return { id: row.id, title: row.title, subject: row.subject, dueDate: row.due_date, priority: row.priority,
    completed: row.completed, recurring: row.recurring, dayOfWeek: row.day_of_week, endDate: row.end_date,
    lastDone: row.last_done, notes: row.notes || "" };
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
      const { error } = await supabaseClient.from("tasks").upsert(tasks.map(taskToRow), { onConflict: "id" });
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
const detailsModal = $("details-modal");
const deleteModal = $("delete-modal");
const importModal = $("import-modal");
const moreSheet = $("more-sheet");
const importSummary = $("import-summary");
const importFileInput = $("import-file-input");
const toastContainer = $("toast-container");

const VIEWS = ["home", "week", "tasks"];

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
  [taskModal, detailsModal, deleteModal, importModal, moreSheet].forEach((el) => hideOverlay(el));
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
    if (e.target.closest("a, [data-cmd]")) hideOverlay(moreSheet);
  });

  // Task modal
  $("modal-close-btn").addEventListener("click", closeTaskModal);
  $("modal-cancel-btn").addEventListener("click", closeTaskModal);
  taskForm.addEventListener("submit", handleFormSubmit);

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
    const item = box.closest(".task");
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
    case "more": showOverlay(moreSheet); break;
    case "export": exportTasks(); break;
    case "import": importFileInput.click(); break;
    case "sync": syncToFile(); break;
    case "theme": toggleTheme(); break;
    case "clear-filters": clearFilters(); break;
    case "clear-day": activeDayFilter = null; renderApp(); break;
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

  if (task.recurring && !task.completed) {
    // Completing a recurring task moves it to the same weekday next week
    const next = parseDateKey(task.dueDate);
    next.setDate(next.getDate() + 7);
    const nextDueDate = toDateKey(next);
    const maxEndDate = task.endDate || END_SCHEDULE_DATE;

    task.lastDone = getRelativeDate(0); // lets the "today" progress bar count it

    if (nextDueDate <= maxEndDate) {
      task.dueDate = nextDueDate;
      task.completed = false;
      showToast(`Done. Next one is ${getDayName(task.dayOfWeek)}, ${formatDateReadable(nextDueDate)}.`, "success");
    } else {
      task.completed = true;
      showToast("Final occurrence completed.", "success");
    }
  } else {
    task.completed = !task.completed;
  }

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

  if (id) {
    tasks = tasks.map((t) => (t.id === id ? { ...t, title, subject, dueDate, priority, notes } : t));
  } else {
    tasks.push({
      id: `task-${Date.now()}`,
      title,
      subject,
      dueDate,
      priority,
      completed: false,
      notes
    });
  }

  closeTaskModal();
  commit();
  showToast(id ? "Task saved." : "Task added.", "success");
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
  } else {
    modalTitle.textContent = "Add task";
    taskIdInput.value = "";
    $("form-date").value = presetDate || getRelativeDate(0);
  }
  showOverlay(taskModal, "#form-title");
}

function closeTaskModal() {
  hideOverlay(taskModal);
}

function viewTaskDetails(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  detailsTaskId = id;

  $("detail-title").textContent = task.title;
  $("detail-subject").innerHTML = subjectChipHTML(task.subject);
  $("detail-date").textContent = formatDateReadable(task.dueDate);
  $("detail-priority").innerHTML = priorityHTML(task.priority);
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

  for (let i = 0; i < 7; i++) {
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
        <span class="task-title">${title}</span>${task.recurring ? '<i class="fa-solid fa-arrows-rotate task-repeat" aria-hidden="true"></i><span class="sr-only"> Repeats weekly</span>' : ""}
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
   START
================================================== */

applyTheme(document.documentElement.getAttribute("data-theme") || "light");
setupEventListeners();
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
