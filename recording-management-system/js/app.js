const KEY="recordFlow_v1";
const defaults={
  subjects:[
    {id:"sub_cm",name:"Combined Maths",description:"Pure and Applied Mathematics"},
    {id:"sub_ph",name:"Physics",description:"Physics theory and problem solving"},
    {id:"sub_ch",name:"Chemistry",description:"Chemistry theory and revision"}
  ],
  recordings:[],
  reviews:[],
  settings:{theme:"dark",reviewIntervals:[1,3,7,14,30]}
};
let db=loadDB();
let currentView="dashboard";
let editingId=null;

function loadDB(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY));
    if(x) return {...defaults,...x,settings:{...defaults.settings,...x.settings}};
  }catch(e){}
  return structuredClone(defaults);
}
function saveDB(){localStorage.setItem(KEY,JSON.stringify(db))}
function uid(prefix="id"){return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7)}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function fmt(sec=0){sec=Math.max(0,Math.round(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h}h ${String(m).padStart(2,"0")}m`:m?`${m}m ${String(s).padStart(2,"0")}s`:`${s}s`}
function dateStr(d=new Date()){return new Date(d).toISOString().slice(0,10)}
function subject(id){return db.subjects.find(s=>s.id===id)}
function pct(r){return r.duration?Math.min(100,Math.round((r.watchedSeconds||0)/r.duration*100)):0}
function status(r){const p=pct(r);return p>=100?"completed":p>0?"in-progress":"not-started"}
function statusBadge(r){const s=status(r), map={"completed":["Completed","green"],"in-progress":["In Progress","yellow"],"not-started":["Not Started",""]};return `<span class="badge ${map[s][1]}">${map[s][0]}</span>`}
function toast(msg,kind="success"){const el=document.createElement("div");el.className=`toast ${kind}`;el.textContent=msg;document.getElementById("toastContainer").appendChild(el);setTimeout(()=>el.remove(),2200)}
function setView(v){
  currentView=v;
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  const titles={dashboard:["Dashboard","Your recording progress at a glance."],recordings:["Recordings","Track, search and continue every lesson."],subjects:["Subjects","Organize recordings by subject."],calendar:["Calendar","Classes and spaced-repetition reviews."],analytics:["Analytics","Understand your recording workload."],settings:["Settings","Customize and back up your data."]};
  document.getElementById("pageTitle").textContent=titles[v][0];document.getElementById("pageSubtitle").textContent=titles[v][1];
  render();
  if(innerWidth<=700){
    document.getElementById("sidebar").classList.remove("open");
    updateSidebarToggle();
  }
}
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.getElementById("quickAddBtn").onclick=()=>openRecordingModal();
function updateSidebarToggle(){
  const sidebar=document.getElementById("sidebar"),button=document.getElementById("sidebarToggle");
  const expanded=innerWidth<=700?sidebar.classList.contains("open"):!sidebar.classList.contains("collapsed");
  button.setAttribute("aria-expanded",String(expanded));
  button.setAttribute("aria-label",expanded?"Collapse navigation":"Expand navigation");
}
function toggleSidebar(){
  const sidebar=document.getElementById("sidebar");
  if(innerWidth<=700) sidebar.classList.toggle("open");
  else sidebar.classList.toggle("collapsed");
  updateSidebarToggle();
}
document.getElementById("sidebarToggle").onclick=toggleSidebar;
window.addEventListener("resize",updateSidebarToggle);

function totals(){
  const total=db.recordings.reduce((a,r)=>a+r.duration,0),watched=db.recordings.reduce((a,r)=>a+(r.watchedSeconds||0),0);
  return {total,watched,remaining:Math.max(0,total-watched),done:db.recordings.filter(r=>status(r)==="completed").length};
}
function render(){({dashboard:renderDashboard,recordings:renderRecordings,subjects:renderSubjects,calendar:renderCalendar,analytics:renderAnalytics,settings:renderSettings}[currentView])()}
function renderDashboard(){
  const t=totals(), total=db.recordings.length, overall=total?Math.round(t.done/total*100):0;
  const due=db.reviews.filter(x=>!x.completed&&x.date<=dateStr()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  const recent=[...db.recordings].sort((a,b)=>(b.lastWatched||"").localeCompare(a.lastWatched||"")).filter(r=>pct(r)<100).slice(0,5);
  document.getElementById("appView").innerHTML=`
    <div class="grid stats">
      ${stat("Total Recordings",total,"Lessons tracked")}
      ${stat("Completed",t.done,`${overall}% overall`)}
      ${stat("Hours Watched",fmt(t.watched),"Across all subjects")}
      ${stat("Hours Remaining",fmt(t.remaining),"Estimated from progress")}
    </div>
    <div class="grid two">
      <div class="card">
        <div class="section-title"><h2>Continue Watching</h2><small>${recent.length} active</small></div>
        ${recent.length?recent.map(recordCard).join(""):empty("Nothing in progress","Add a recording or start your first lesson.")}
      </div>
      <div class="card">
        <div class="section-title"><h2>Reviews Due</h2><small>${due.length} due</small></div>
        ${due.length?due.map(reviewCard).join(""):empty("No reviews due","You're caught up for now.")}
      </div>
    </div>
    <div class="grid two">
      <div class="card">
        <div class="section-title"><h2>Subject Progress</h2></div>
        ${db.subjects.length?db.subjects.map(subjectProgress).join(""):empty("No subjects","Create your first subject.")}
      </div>
      <div class="card">
        <div class="section-title"><h2>Last 7 Days</h2><small>Watched hours</small></div>
        ${miniChart()}
      </div>
    </div>`;
}
function stat(label,value,sub){return `<div class="card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`}
function empty(title,text){return `<div class="empty"><strong>${title}</strong>${text}</div>`}
function recordCard(r){
  return `<div class="record-card"><div><strong>${esc(r.number?`#${r.number} · `:"")}${esc(r.title)}</strong><div class="record-meta">${esc(subject(r.subjectId)?.name||"Unknown")} · ${fmt(r.duration)} · ${pct(r)}%</div><div class="progress" style="margin-top:8px"><i style="width:${pct(r)}%"></i></div></div><div class="record-actions"><button class="btn secondary" onclick="openDetail('${r.id}')">View</button></div></div>`
}
function reviewCard(x){
  const r=db.recordings.find(r=>r.id===x.recordingId);
  return `<div class="record-card"><div><strong>${esc(r?.title||"Deleted recording")}</strong><div class="record-meta">${esc(subject(r?.subjectId)?.name||"")} · Review #${x.index} · ${x.date}</div></div><button class="btn secondary" onclick="completeReview('${x.id}')">Done</button></div>`
}
function subjectProgress(s){
  const rs=db.recordings.filter(r=>r.subjectId===s.id),done=rs.filter(r=>status(r)==="completed").length,total=rs.reduce((a,r)=>a+r.duration,0),watched=rs.reduce((a,r)=>a+(r.watchedSeconds||0),0),p=total?Math.round(watched/total*100):0;
  return `<div class="subject-row"><div class="subject-head"><strong>${esc(s.name)}</strong><span>${done}/${rs.length} · ${p}%</span></div><div class="progress"><i style="width:${p}%"></i></div><div class="record-meta">${fmt(watched)} watched · ${fmt(Math.max(0,total-watched))} remaining</div></div>`
}
function miniChart(){
  const vals=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=dateStr(d);let sec=0;db.recordings.forEach(r=>{if((r.progressLog||{})[ds])sec+=(r.progressLog[ds]||0)});vals.push({d:d.toLocaleDateString(undefined,{weekday:"short"}).slice(0,3),v:sec})}
  const max=Math.max(1,...vals.map(x=>x.v));return `<div class="chart">${vals.map(x=>`<div class="bar-wrap"><b>${x.v?Math.round(x.v/60)+"m":""}</b><div class="bar" style="height:${Math.max(3,x.v/max*170)}px"></div><small>${x.d}</small></div>`).join("")}</div>`
}

function renderRecordings(){
  document.getElementById("appView").innerHTML=`
  <div class="card">
    <div class="filters">
      <input id="recSearch" class="input search" placeholder="Search recordings..." oninput="filterRecordings()">
      <select id="recSubject" class="select" style="max-width:210px" onchange="filterRecordings()"><option value="">All subjects</option>${db.subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>
      <select id="recStatus" class="select" style="max-width:180px" onchange="filterRecordings()"><option value="">All statuses</option><option value="not-started">Not Started</option><option value="in-progress">In Progress</option><option value="completed">Completed</option></select>
      <select id="recSort" class="select" style="max-width:180px" onchange="filterRecordings()">
        <option value="date-asc">Class Date (Oldest)</option>
        <option value="date-desc">Class Date (Newest)</option>
        <option value="title">Title (A-Z)</option>
        <option value="number">Recording Number</option>
      </select>
      <button class="btn primary" onclick="openRecordingModal()">＋ Add Recording</button>
    </div>
    <div id="recordingTable"></div>
  </div>`;
  filterRecordings();
}
function filterRecordings(){
  const q=(document.getElementById("recSearch")?.value||"").toLowerCase(),sid=document.getElementById("recSubject")?.value||"",st=document.getElementById("recStatus")?.value||"",sort=document.getElementById("recSort")?.value||"date-asc";
  const dateValue=r=>r.classDate?new Date(`${r.classDate}T00:00:00`).getTime():0;
  const rs=db.recordings
    .filter(r=>(!q||`${r.title} ${r.number} ${r.tags||""}`.toLowerCase().includes(q))&&(!sid||r.subjectId===sid)&&(!st||status(r)===st))
    .sort((a,b)=>{
      if(sort==="date-asc") return dateValue(a)-dateValue(b);
      if(sort==="date-desc") return dateValue(b)-dateValue(a);
      if(sort==="title") return a.title.localeCompare(b.title,undefined,{sensitivity:"base"});
      if(sort==="number") return String(a.number||"").localeCompare(String(b.number||""),undefined,{numeric:true});
      return 0;
    });
  document.getElementById("recordingTable").innerHTML=rs.length?`<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Recording</th><th>Subject</th><th>Duration</th><th>Progress</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>${rs.map(r=>`<tr><td>${esc(r.number||"—")}</td><td><strong>${esc(r.title)}</strong></td><td>${esc(subject(r.subjectId)?.name||"—")}</td><td>${fmt(r.duration)}</td><td>${pct(r)}%</td><td>${statusBadge(r)}</td><td>${r.classDate||"—"}</td><td><button class="btn secondary" onclick="openDetail('${r.id}')">Open</button></td></tr>`).join("")}</tbody></table></div>`:empty("No recordings found","Try another filter or add a recording.")
}

function renderSubjects(){
  document.getElementById("appView").innerHTML=`<div class="section-title"><h2>Your Subjects</h2><button class="btn primary" onclick="openSubjectModal()">＋ Add Subject</button></div><div class="grid three">${db.subjects.map(s=>{const rs=db.recordings.filter(r=>r.subjectId===s.id),t=rs.reduce((a,r)=>a+r.duration,0),w=rs.reduce((a,r)=>a+(r.watchedSeconds||0),0),p=t?Math.round(w/t*100):0;return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px"><div><strong>${esc(s.name)}</strong><div class="record-meta">${esc(s.description||"")}</div></div><button class="icon-btn danger" onclick="deleteSubject('${s.id}')">×</button></div><div style="margin:18px 0 8px" class="progress"><i style="width:${p}%"></i></div><div class="record-meta">${rs.length} recordings · ${fmt(t)} total · ${p}% watched</div><div style="margin-top:15px"><button class="btn secondary" onclick="setView('recordings');setTimeout(()=>{document.getElementById('recSubject').value='${s.id}';filterRecordings()},0)">View Recordings</button></div></div>`}).join("")}${!db.subjects.length?empty("No subjects","Create a subject to organize recordings."): ""}</div>`
}
function renderCalendar(){
  const now=new Date(),y=now.getFullYear(),m=now.getMonth(),first=new Date(y,m,1),start=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),cells=[];
  for(let i=0;i<start;i++)cells.push(`<div class="day muted"></div>`);
  for(let d=1;d<=days;d++){const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,events=[...db.recordings.filter(r=>r.classDate===ds).map(r=>`🎬 ${r.title}`),...db.reviews.filter(x=>x.date===ds&&!x.completed).map(x=>{const r=db.recordings.find(r=>r.id===x.recordingId);return `↻ ${r?.title||"Review"}`})];cells.push(`<div class="day ${ds===dateStr()?"today":""}"><div class="day-num">${d}</div>${events.slice(0,3).map(e=>`<div class="event">${esc(e)}</div>`).join("")}</div>`)}
  document.getElementById("appView").innerHTML=`<div class="card"><div class="section-title"><h2>${now.toLocaleString(undefined,{month:"long",year:"numeric"})}</h2></div><div class="calendar">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x=>`<div class="day-head">${x}</div>`).join("")}${cells.join("")}</div></div>`
}
function renderAnalytics(){
  const t=totals(),avg=db.recordings.length?Math.round(t.watched/db.recordings.length):0;
  document.getElementById("appView").innerHTML=`<div class="grid stats">${stat("Total Hours",fmt(t.total),"All recordings")}${stat("Watched",fmt(t.watched),t.total?Math.round(t.watched/t.total*100)+"% of total":"0%")}${stat("Remaining",fmt(t.remaining),"Across all subjects")}${stat("Avg. Watched",fmt(avg),"Per recording")}</div><div class="grid two"><div class="card"><div class="section-title"><h2>Subject Comparison</h2></div>${db.subjects.map(subjectProgress).join("")||empty("No data","Add recordings to see analytics.")}</div><div class="card"><div class="section-title"><h2>7-Day Activity</h2></div>${miniChart()}</div></div>`
}
function renderSettings(){
  const dark=db.settings.theme!=="light";
  document.getElementById("appView").innerHTML=`<div class="card"><div class="settings-row"><div><h3>Theme</h3><p>Switch between dark and light appearance.</p></div><button class="toggle ${dark?"on":""}" onclick="toggleTheme()"><i></i></button></div><div class="settings-row"><div><h3>Review Schedule</h3><p>After completion: ${db.settings.reviewIntervals.join("d → ")}d</p></div><button class="btn secondary" onclick="editIntervals()">Edit</button></div><div class="settings-row"><div><h3>Export Backup</h3><p>Download all subjects, recordings, reviews and settings as JSON.</p></div><button class="btn secondary" onclick="exportData()">Export</button></div><div class="settings-row"><div><h3>Import Backup</h3><p>Restore a previously exported RecordFlow JSON file.</p></div><button class="btn secondary" onclick="document.getElementById('importFile').click()">Import</button></div><div class="settings-row"><div><h3>Reset Application</h3><p>Delete all local RecordFlow data.</p></div><button class="btn secondary danger" onclick="resetData()">Reset</button></div><input id="importFile" type="file" accept=".json" hidden onchange="importData(event)"></div>`
}

function openRecordingModal(id=null){
  editingId=id;const r=id?db.recordings.find(x=>x.id===id):null;
  document.getElementById("modal").innerHTML=`<div class="modal-head"><h2>${r?"Edit Recording":"Add Recording"}</h2><button class="icon-btn" onclick="closeModal()">×</button></div>
  <form onsubmit="saveRecording(event)">
    <div class="form-grid">
      <div class="field"><label>Subject *</label><select class="select" id="fSubject" required>${db.subjects.map(s=>`<option value="${s.id}" ${r?.subjectId===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Recording Number</label><input class="input" id="fNumber" type="number" min="1" value="${r?.number||""}"></div>
      <div class="field full"><label>Title *</label><input class="input" id="fTitle" required value="${esc(r?.title||"")}"></div>
      <div class="field"><label>Class Date</label><input class="input" id="fDate" type="date" value="${r?.classDate||dateStr()}"></div>
      <div class="field"><label>Duration (minutes) *</label><input class="input" id="fDuration" type="number" min="1" required value="${r?Math.round(r.duration/60):""}"></div>
      <div class="field full"><label>Video URL (optional)</label><input class="input" id="fUrl" type="url" value="${esc(r?.videoUrl||"")}"></div>
      <div class="field"><label>Priority</label><select class="select" id="fPriority"><option ${r?.priority==="low"?"selected":""}>low</option><option ${!r||r?.priority==="medium"?"selected":""}>medium</option><option ${r?.priority==="high"?"selected":""}>high</option></select></div>
      <div class="field"><label>Tags</label><input class="input" id="fTags" value="${esc(r?.tags||"")}"></div>
      <div class="field full"><label>Notes</label><textarea class="textarea" id="fNotes">${esc(r?.notes||"")}</textarea></div>
    </div>
    <div class="modal-actions"><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary">${r?"Save Changes":"Add Recording"}</button></div>
  </form>`;
  showModal();
}
function saveRecording(e){e.preventDefault();const old=editingId?db.recordings.find(r=>r.id===editingId):null;const r=old||{id:uid("rec"),watchedSeconds:0,progressLog:{},createdAt:new Date().toISOString()};
  Object.assign(r,{subjectId:fSubject.value,number:Number(fNumber.value)||null,title:fTitle.value.trim(),classDate:fDate.value,duration:Number(fDuration.value)*60,videoUrl:fUrl.value.trim(),priority:fPriority.value,tags:fTags.value.trim(),notes:fNotes.value.trim(),lastWatched:old?.lastWatched||null});
  if(old && r.watchedSeconds>r.duration)r.watchedSeconds=r.duration;
  if(!old)db.recordings.push(r);saveDB();closeModal();toast(old?"Recording updated":"Recording added");render();
}
function openSubjectModal(id=null){
  editingId=id;const s=id?subject(id):null;document.getElementById("modal").innerHTML=`<div class="modal-head"><h2>${s?"Edit Subject":"Add Subject"}</h2><button class="icon-btn" onclick="closeModal()">×</button></div><form onsubmit="saveSubject(event)"><div class="field"><label>Subject Name *</label><input class="input" id="sName" required value="${esc(s?.name||"")}"></div><div class="field" style="margin-top:13px"><label>Description</label><input class="input" id="sDesc" value="${esc(s?.description||"")}"></div><div class="modal-actions"><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary">${s?"Save":"Create Subject"}</button></div></form>`;showModal()
}
function saveSubject(e){e.preventDefault();if(editingId){const s=subject(editingId);s.name=sName.value.trim();s.description=sDesc.value.trim()}else db.subjects.push({id:uid("sub"),name:sName.value.trim(),description:sDesc.value.trim()});saveDB();closeModal();toast("Subject saved");render()}
function deleteSubject(id){if(db.recordings.some(r=>r.subjectId===id)){toast("Delete or move its recordings first","danger");return}if(confirm("Delete this subject?")){db.subjects=db.subjects.filter(s=>s.id!==id);saveDB();render();toast("Subject deleted")}}
function openDetail(id){
  const r=db.recordings.find(x=>x.id===id);if(!r)return;editingId=id;
  const p=pct(r),remain=Math.max(0,r.duration-r.watchedSeconds);
  document.getElementById("modal").innerHTML=`<div class="modal-head"><div><h2>${esc(r.title)}</h2><div class="record-meta">${esc(subject(r.subjectId)?.name||"")} · ${statusBadge(r)}</div></div><button class="icon-btn" onclick="closeModal()">×</button></div>
  <div class="big-progress"><div class="ring" style="--pct:${p}%"><span>${p}%</span></div><div><div class="quick-stats"><div class="mini"><small>Watched</small><strong>${fmt(r.watchedSeconds)}</strong></div><div class="mini"><small>Remaining</small><strong>${fmt(remain)}</strong></div><div class="mini"><small>Total</small><strong>${fmt(r.duration)}</strong></div></div><div style="margin-top:16px"><div class="progress"><i style="width:${p}%"></i></div></div></div></div>
  <div style="margin-top:20px" class="card"><strong>Update watch progress</strong><div class="form-grid" style="margin-top:12px"><div class="field"><label>Watched minutes</label><input class="input" id="watchedMin" type="number" min="0" max="${Math.ceil(r.duration/60)}" value="${Math.round(r.watchedSeconds/60)}"></div><div class="field"><label>Video</label><div style="display:flex;gap:8px">${r.videoUrl?`<button type="button" class="btn secondary" onclick="window.open('${esc(r.videoUrl)}','_blank')">▶ Open Video</button>`:"<span class='record-meta'>No video URL</span>"}</div></div></div><div class="modal-actions"><button class="btn secondary" onclick="saveProgress('${r.id}')">Save Progress</button><button class="btn primary" onclick="markComplete('${r.id}')">✓ Mark Complete</button></div></div>
  <div style="margin-top:15px"><div class="section-title"><h2>Notes</h2><button class="btn secondary" onclick="openRecordingModal('${r.id}')">Edit</button></div><div class="card" style="white-space:pre-wrap">${esc(r.notes||"No notes yet.")}</div></div>
  <div class="modal-actions"><button class="btn secondary danger" onclick="deleteRecording('${r.id}')">Delete Recording</button></div>`;
  showModal();
}
function saveProgress(id){const r=db.recordings.find(x=>x.id===id);const old=r.watchedSeconds||0;r.watchedSeconds=Math.min(r.duration,Math.max(0,Number(document.getElementById("watchedMin").value)*60));const diff=r.watchedSeconds-old;if(diff>0){const d=dateStr();r.progressLog=r.progressLog||{};r.progressLog[d]=(r.progressLog[d]||0)+diff}r.lastWatched=new Date().toISOString();if(r.watchedSeconds>=r.duration&&old<r.duration)scheduleReviews(r);saveDB();toast("Progress saved");openDetail(id)}
function markComplete(id){const r=db.recordings.find(x=>x.id===id);r.watchedSeconds=r.duration;r.lastWatched=new Date().toISOString();scheduleReviews(r);saveDB();toast("Recording completed");openDetail(id)}
function scheduleReviews(r){const existing=db.reviews.filter(x=>x.recordingId===r.id);if(existing.length)return;db.settings.reviewIntervals.forEach((n,i)=>{const d=new Date();d.setDate(d.getDate()+n);db.reviews.push({id:uid("rev"),recordingId:r.id,index:i+1,date:dateStr(d),completed:false})})}
function completeReview(id){const x=db.reviews.find(x=>x.id===id);if(x){x.completed=true;saveDB();toast("Review completed");render()}}
function deleteRecording(id){if(confirm("Delete this recording and its review schedule?")){db.recordings=db.recordings.filter(r=>r.id!==id);db.reviews=db.reviews.filter(x=>x.recordingId!==id);saveDB();closeModal();toast("Recording deleted");render()}}
function showModal(){document.getElementById("modalBackdrop").classList.remove("hidden")}
function closeModal(){document.getElementById("modalBackdrop").classList.add("hidden");editingId=null}
document.getElementById("modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal()})
function toggleTheme(){db.settings.theme=db.settings.theme==="light"?"dark":"light";applyTheme();saveDB();render()}
function applyTheme(){document.body.classList.toggle("light",db.settings.theme==="light")}
function editIntervals(){const x=prompt("Enter review intervals in days, separated by commas:",db.settings.reviewIntervals.join(","));if(x===null)return;const a=x.split(",").map(v=>Number(v.trim())).filter(v=>v>0&&Number.isFinite(v));if(!a.length)return toast("Invalid schedule","danger");db.settings.reviewIntervals=a;saveDB();render();toast("Review schedule updated")}
function exportData(){const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`recordflow-backup-${dateStr()}.json`;a.click();URL.revokeObjectURL(a.href);toast("Backup exported")}
function importData(e){const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const x=JSON.parse(reader.result);if(!x.subjects||!x.recordings)throw Error();db=x;saveDB();applyTheme();render();toast("Backup imported")}catch{toast("Invalid backup file","danger")}};reader.readAsText(file)}
function resetData(){if(confirm("This will permanently delete all local recordings. Continue?")){db=structuredClone(defaults);saveDB();render();toast("Application reset")}}
applyTheme();render();
