/* INDEXED DB ENGINE */
        const DB_NAME = 'MarksAnalysisDB';
        const DB_VERSION = 2;
        const STORE_NAME = 'Papers';
        let db = null;
        let chartInstance = null;
        let activeComponentView = 'total'; // 'total', 'mcq', 'structured', 'essay'
        let activeSubjectsFilter = 'all'; // 'all', 'Combined Mathematics', 'Chemistry', 'Physics', 'Average'
        let papersCache = []; // BUG FIX: holds the last-fetched papers so row buttons can look records up by id
                               // instead of embedding a JSON.stringify(record) inside an onclick attribute,
                               // which broke (and could inject markup) whenever a paper name/subject contained
                               // a quote, angle bracket, or other HTML-special character.

        /* BUG FIX: escape user-supplied text before inserting it into innerHTML so paper
           names/subjects containing <, >, &, or quotes can't break the markup or inject HTML. */
        function escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = (e) => reject('Database opening error: ' + e.target.errorCode);
                request.onsuccess = (e) => {
                    db = e.target.result;
                    resolve(db);
                };
                request.onupgradeneeded = (e) => {
                    const dbInstance = e.target.result;
                    if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                        const store = dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('date', 'date', { unique: false });
                        store.createIndex('subject', 'subject', { unique: false });
                    }
                };
            });
        }

        /* CRUD OPERATIONS */
        function getAllPapers() {
            return new Promise((resolve, reject) => {
                const tx = db.transaction([STORE_NAME], 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject('Failed to fetch paper records');
            });
        }

        function savePaperRecord(record) {
            return new Promise((resolve, reject) => {
                const tx = db.transaction([STORE_NAME], 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = record.id ? store.put(record) : store.add(record);
                request.onsuccess = () => resolve();
                request.onerror = (e) => reject('Failed to save paper record: ' + e.target.error);
            });
        }

        function deletePaperRecord(id) {
            return new Promise((resolve, reject) => {
                const tx = db.transaction([STORE_NAME], 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject('Failed to delete paper record');
            });
        }

        /* TOAST NOTIFICATION HELPERS */
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            const bgColor = type === 'success' ? 'bg-emerald-600' : 'bg-rose-600';
            toast.className = `${bgColor} text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-sm font-medium transition duration-300 transform translate-y-2 opacity-0`;
            toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> <span>${message}</span>`;
            
            container.appendChild(toast);
            
            // Animate in
            setTimeout(() => {
                toast.classList.remove('translate-y-2', 'opacity-0');
            }, 10);

            // Remove after 3 seconds
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        /* INITIAL SEED SAMPLE DATA IF EMPTY */
        async function seedInitialDataIfEmpty() {
            const papers = await getAllPapers();
            if (papers.length === 0) {
                const samples = [
                    { date: '2026-09-01', subject: 'Combined Mathematics', name: 'Paper 01', totalObt: 58, totalMax: 100 },
                    { date: '2026-09-02', subject: 'Chemistry', name: 'Paper 01', mcqObt: 16, mcqMax: 25, structObt: 28, structMax: 50, essayObt: 10, essayMax: 25, totalObt: 54, totalMax: 100 },
                    { date: '2026-09-03', subject: 'Physics', name: 'Paper 01', mcqObt: 15, mcqMax: 25, structObt: 25, structMax: 50, essayObt: 10, essayMax: 25, totalObt: 50, totalMax: 100 },
                    { date: '2026-09-08', subject: 'Combined Mathematics', name: 'Paper 02', totalObt: 68, totalMax: 100 },
                    { date: '2026-09-09', subject: 'Chemistry', name: 'Paper 02', mcqObt: 19, mcqMax: 25, structObt: 35, structMax: 50, essayObt: 14, essayMax: 25, totalObt: 68, totalMax: 100 },
                    { date: '2026-09-10', subject: 'Physics', name: 'Paper 02', mcqObt: 17, mcqMax: 25, structObt: 31, structMax: 50, essayObt: 12, essayMax: 25, totalObt: 60, totalMax: 100 },
                    { date: '2026-09-15', subject: 'Combined Mathematics', name: 'Paper 03', totalObt: 72, totalMax: 100 },
                    { date: '2026-09-16', subject: 'Chemistry', name: 'Paper 03', mcqObt: 21, mcqMax: 25, structObt: 38, structMax: 50, essayObt: 15, essayMax: 25, totalObt: 74, totalMax: 100 },
                    { date: '2026-09-18', subject: 'Physics', name: 'Paper 03', mcqObt: 18, mcqMax: 25, structObt: 32, structMax: 50, essayObt: 12, essayMax: 25, totalObt: 62, totalMax: 100 }
                ];
                for (let item of samples) {
                    await savePaperRecord(item);
                }
            }
        }

        window.addEventListener('DOMContentLoaded', async () => {
            try {
                await initDB();
                await seedInitialDataIfEmpty();
                
                // Attach form submit listener explicitly
                const paperForm = document.getElementById('paperForm');
                if (paperForm) {
                    paperForm.addEventListener('submit', submitPaperForm);
                }

                refreshDashboard();
            } catch (err) {
                console.error("Initialization Error:", err);
            }
        });

        async function refreshDashboard() {
            const papers = await getAllPapers();
            papersCache = papers; // BUG FIX: keep a lookup cache for editPaperById()
            updateSummaryStats(papers);
            renderTable(papers);
            renderChart(papers);
        }

        /* STATS COMPUTATION */
        function updateSummaryStats(papers) {
            if (!papers || papers.length === 0) {
                document.getElementById('statLatestAvg').innerText = '-- %';
                document.getElementById('statBestScore').innerText = '-- %';
                document.getElementById('statTotalPapers').innerText = '0';
                document.getElementById('statTrend').innerText = '--';
                return;
            }

            document.getElementById('statTotalPapers').innerText = papers.length;

            const sorted = [...papers].sort((a, b) => new Date(a.date) - new Date(b.date));

            // Best Score
            let bestPct = 0;
            let bestSubj = '';
            papers.forEach(p => {
                const pct = (p.totalObt / p.totalMax) * 100;
                if (pct > bestPct) {
                    bestPct = pct;
                    bestSubj = `${p.subject} (${p.name})`;
                }
            });
            document.getElementById('statBestScore').innerText = `${bestPct.toFixed(1)}%`;
            document.getElementById('statBestSub').innerText = bestSubj || 'Highest individual paper';

            // Latest Average
            const lastThree = sorted.slice(-3);
            const latestAvg = lastThree.reduce((acc, p) => acc + (p.totalObt / p.totalMax) * 100, 0) / lastThree.length;
            document.getElementById('statLatestAvg').innerText = `${latestAvg.toFixed(1)}%`;
            document.getElementById('statLatestSub').innerText = `Average of recent ${lastThree.length} papers`;

            // Trend
            // BUG FIX: this used to trigger at sorted.length >= 4, but slice(-6, -3) only returns a
            // full, non-overlapping set of 3 "previous" papers once there are at least 6 records.
            // With 4 or 5 records it returned 1-2 papers that overlapped with the "latest 3" set,
            // producing a misleading trend percentage.
            if (sorted.length >= 6) {
                const prevThree = sorted.slice(-6, -3);
                const prevAvg = prevThree.reduce((acc, p) => acc + (p.totalObt / p.totalMax) * 100, 0) / prevThree.length;
                const diff = latestAvg - prevAvg;
                if (diff > 0) {
                    document.getElementById('statTrend').innerText = `+${diff.toFixed(1)}%`;
                    document.getElementById('statTrend').className = 'text-3xl font-extrabold text-emerald-400';
                    document.getElementById('statTrendSub').innerText = 'Upward momentum';
                } else if (diff < 0) {
                    document.getElementById('statTrend').innerText = `${diff.toFixed(1)}%`;
                    document.getElementById('statTrend').className = 'text-3xl font-extrabold text-rose-400';
                    document.getElementById('statTrendSub').innerText = 'Slight dip recently';
                } else {
                    document.getElementById('statTrend').innerText = '0.0%';
                    document.getElementById('statTrend').className = 'text-3xl font-extrabold text-amber-400';
                    document.getElementById('statTrendSub').innerText = 'Consistent performance';
                }
            } else {
                document.getElementById('statTrend').innerText = 'Steady';
                document.getElementById('statTrendSub').innerText = 'Needs more data records';
            }
        }

        /* TABLE RENDERING */
        function renderTable(papers) {
            const tbody = document.getElementById('papersTableBody');
            document.getElementById('paperCountBadge').innerText = `${papers.length} Papers`;

            if (papers.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-slate-500">No paper records stored yet. Click "Add Paper" to start.</td></tr>`;
                return;
            }

            const sorted = [...papers].sort((a, b) => new Date(b.date) - new Date(a.date));

            tbody.innerHTML = sorted.map(p => {
                const pct = ((p.totalObt / p.totalMax) * 100).toFixed(1);
                let compHtml = '<span class="text-slate-500 text-xs">Total only</span>';
                if (p.mcqObt !== undefined && p.mcqObt !== null && !isNaN(p.mcqObt)) {
                    compHtml = `<span class="text-xs text-slate-300">MCQ: <b class="text-white">${p.mcqObt}/${p.mcqMax}</b> | Str: <b class="text-white">${p.structObt}/${p.structMax}</b> | Essay: <b class="text-white">${p.essayObt}/${p.essayMax}</b></span>`;
                }

                const d = new Date(p.date);
                const dateFormatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                // BUG FIX: rows used to embed onclick='editPaper(${JSON.stringify(p)})' directly in
                // the HTML. Any apostrophe in a paper name/subject (e.g. "O'Level Style") broke out
                // of the attribute and threw a JS syntax error, so the Edit button silently stopped
                // working for that row (and any rows after it). Subject/name are also now escaped
                // before being inserted into innerHTML so special characters can't break the markup.
                return `
                    <tr class="hover:bg-slate-800/40 transition">
                        <td class="p-3.5 whitespace-nowrap text-xs font-medium text-slate-300">${dateFormatted}</td>
                        <td class="p-3.5 font-medium text-white">${escapeHtml(p.subject)}</td>
                        <td class="p-3.5 text-xs text-indigo-300 font-semibold">${escapeHtml(p.name)}</td>
                        <td class="p-3.5">${compHtml}</td>
                        <td class="p-3.5 text-right font-bold text-white">${p.totalObt} / ${p.totalMax}</td>
                        <td class="p-3.5 text-right font-bold ${pct >= 75 ? 'text-emerald-400' : pct >= 60 ? 'text-blue-400' : 'text-amber-400'}">${pct}%</td>
                        <td class="p-3.5 text-center whitespace-nowrap">
                            <button type="button" onclick="editPaperById(${p.id})" class="text-indigo-400 hover:text-indigo-300 p-1 mr-2 transition" title="Edit"><i class="fa-solid fa-pen"></i></button>
                            <button type="button" onclick="confirmDelete(${p.id})" class="text-rose-400 hover:text-rose-300 p-1 transition" title="Delete"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        /* CHART.JS UNIFIED GRAPH LOGIC */
        async function renderChart(papersData) {
            const papers = papersData || await getAllPapers();

            const dateFilter = document.getElementById('dateFilter').value;
            const now = new Date();
            let filtered = papers.filter(p => {
                if (dateFilter === 'month') {
                    const pd = new Date(p.date);
                    return pd.getMonth() === now.getMonth() && pd.getFullYear() === now.getFullYear();
                } else if (dateFilter === '3months') {
                    const pd = new Date(p.date);
                    const diffTime = Math.abs(now - pd);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays <= 90;
                }
                return true;
            });

            filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

            const timeMap = new Map();

            filtered.forEach(p => {
                const d = new Date(p.date);
                const dayMonth = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                const key = `${p.date}_${p.name}`;
                const compactLabel = `${dayMonth} • ${p.name}`;

                if (!timeMap.has(key)) {
                    timeMap.set(key, {
                        key: key,
                        rawDate: p.date,
                        label: compactLabel,
                        fullDate: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                        records: {}
                    });
                }
                timeMap.get(key).records[p.subject] = p;
            });

            let timeSlots = Array.from(timeMap.values());

            const rangeFilter = document.getElementById('rangeFilter').value;
            if (rangeFilter === '5') {
                timeSlots = timeSlots.slice(-5);
            } else if (rangeFilter === '10') {
                timeSlots = timeSlots.slice(-10);
            }

            const labels = timeSlots.map(ts => ts.label);

            // BUG FIX: previously, switching to the MCQ/Structured/Essay view for a paper with no
            // component breakdown (e.g. any Combined Mathematics record, which only ever stores a
            // total) silently fell back to plotting that paper's TOTAL percentage on the component
            // line. That made the "MCQ" view, for example, show Combined Mathematics' full-paper
            // score as if it were an MCQ score - misleading. Now it correctly plots no point (null)
            // for records that don't have that component recorded.
            const getVal = (paperObj) => {
                if (!paperObj) return null;
                if (activeComponentView === 'mcq') {
                    if (paperObj.mcqObt !== undefined && paperObj.mcqMax) {
                        return (paperObj.mcqObt / paperObj.mcqMax) * 100;
                    }
                    return null;
                }
                if (activeComponentView === 'structured') {
                    if (paperObj.structObt !== undefined && paperObj.structMax) {
                        return (paperObj.structObt / paperObj.structMax) * 100;
                    }
                    return null;
                }
                if (activeComponentView === 'essay') {
                    if (paperObj.essayObt !== undefined && paperObj.essayMax) {
                        return (paperObj.essayObt / paperObj.essayMax) * 100;
                    }
                    return null;
                }
                return (paperObj.totalObt / paperObj.totalMax) * 100;
            };

            const mathsData = timeSlots.map(ts => getVal(ts.records['Combined Mathematics']));
            const chemData = timeSlots.map(ts => getVal(ts.records['Chemistry']));
            const phyData = timeSlots.map(ts => getVal(ts.records['Physics']));

            // BUG FIX: only average the subjects that actually have a value for the active
            // component view. Previously this pushed getVal()'s old total% fallback for every
            // present subject; now that getVal() can return null (see above), a null had to be
            // filtered out here too, or it would silently count as 0 and drag the average down.
            const avgData = timeSlots.map(ts => {
                const vals = [
                    getVal(ts.records['Combined Mathematics']),
                    getVal(ts.records['Chemistry']),
                    getVal(ts.records['Physics'])
                ].filter(v => v !== null && v !== undefined);

                if (vals.length === 0) return null;
                return vals.reduce((a, b) => a + b, 0) / vals.length;
            });

            const datasets = [
                {
                    label: 'Combined Mathematics',
                    data: mathsData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.15)',
                    borderWidth: 3,
                    pointBackgroundColor: '#1d4ed8',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.3,
                    spanGaps: false,
                    hidden: activeSubjectsFilter !== 'all' && activeSubjectsFilter !== 'Combined Mathematics'
                },
                {
                    label: 'Chemistry',
                    data: chemData,
                    borderColor: '#9333ea',
                    backgroundColor: 'rgba(147, 51, 234, 0.15)',
                    borderWidth: 3,
                    pointBackgroundColor: '#7e22ce',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.3,
                    spanGaps: false,
                    hidden: activeSubjectsFilter !== 'all' && activeSubjectsFilter !== 'Chemistry'
                },
                {
                    label: 'Physics',
                    data: phyData,
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5, 150, 105, 0.15)',
                    borderWidth: 3,
                    pointBackgroundColor: '#047857',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.3,
                    spanGaps: false,
                    hidden: activeSubjectsFilter !== 'all' && activeSubjectsFilter !== 'Physics'
                },
                {
                    label: 'Average',
                    data: avgData,
                    borderColor: '#d97706',
                    backgroundColor: 'transparent',
                    borderWidth: 3.5,
                    borderDash: [6, 4],
                    pointBackgroundColor: '#b45309',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    tension: 0.3,
                    spanGaps: false,
                    hidden: activeSubjectsFilter !== 'all' && activeSubjectsFilter !== 'Average'
                }
            ];

            const ctx = document.getElementById('combinedChart').getContext('2d');

            if (chartInstance) {
                chartInstance.destroy();
            }

            chartInstance = new Chart(ctx, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: '#1e293b',
                                font: { family: 'Inter', weight: '600', size: 12 },
                                usePointStyle: true,
                                padding: 20
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.92)',
                            titleColor: '#f8fafc',
                            bodyColor: '#e2e8f0',
                            borderColor: 'rgba(255, 255, 255, 0.2)',
                            borderWidth: 1,
                            padding: 12,
                            cornerRadius: 12,
                            titleFont: { family: 'Inter', size: 13, weight: 'bold' },
                            bodyFont: { family: 'Inter', size: 12 },
                            callbacks: {
                                title: function(context) {
                                    const index = context[0].dataIndex;
                                    const slot = timeSlots[index];
                                    return `${slot.fullDate} (${slot.label.split('•')[1].trim()})`;
                                },
                                label: function(context) {
                                    const datasetLabel = context.dataset.label;
                                    const val = context.parsed.y;
                                    if (val === null || val === undefined) return null;

                                    const index = context.dataIndex;
                                    const slot = timeSlots[index];

                                    if (datasetLabel === 'Average') {
                                        return `Average Score: ${val.toFixed(1)}%`;
                                    }

                                    const paperObj = slot.records[datasetLabel];
                                    if (!paperObj) return `${datasetLabel}: No Data`;

                                    const lines = [`${datasetLabel} — ${paperObj.name}`];
                                    if (paperObj.mcqObt !== undefined && paperObj.mcqObt !== null) {
                                        lines.push(`  MCQ: ${paperObj.mcqObt}/${paperObj.mcqMax}`);
                                        lines.push(`  Structured: ${paperObj.structObt}/${paperObj.structMax}`);
                                        lines.push(`  Essay: ${paperObj.essayObt}/${paperObj.essayMax}`);
                                    }
                                    lines.push(`  Total: ${paperObj.totalObt}/${paperObj.totalMax}`);
                                    lines.push(`  Percentage: ${((paperObj.totalObt / paperObj.totalMax) * 100).toFixed(1)}%`);

                                    return lines;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(0, 0, 0, 0.06)' },
                            ticks: { color: '#475569', font: { family: 'Inter', size: 11, weight: '500' } }
                        },
                        y: {
                            min: 0,
                            max: 100,
                            grid: { color: 'rgba(0, 0, 0, 0.08)' },
                            ticks: {
                                color: '#475569',
                                font: { family: 'Inter', size: 11, weight: '500' },
                                callback: value => value + '%'
                            },
                            title: {
                                display: true,
                                text: 'Marks / Normalized Performance (%)',
                                color: '#334155',
                                font: { family: 'Inter', size: 12, weight: 'bold' }
                            }
                        }
                    }
                }
            });
        }

        /* TOGGLE FILTERS */
        function setComponentView(mode) {
            activeComponentView = mode;
            ['Total', 'Mcq', 'Structured', 'Essay'].forEach(m => {
                const btn = document.getElementById(`btnView${m}`);
                if (m.toLowerCase() === mode) {
                    btn.className = 'px-3 py-1.5 rounded-lg transition bg-white text-slate-900 shadow-sm font-bold';
                } else {
                    btn.className = 'px-3 py-1.5 rounded-lg transition hover:text-slate-900 font-medium';
                }
            });
            renderChart();
        }

        function toggleSubject(sub) {
            activeSubjectsFilter = sub;
            const btns = {
                'all': 'btnSubAll',
                'Combined Mathematics': 'btnSubMaths',
                'Chemistry': 'btnSubChem',
                'Physics': 'btnSubPhy',
                'Average': 'btnSubAvg'
            };

            Object.keys(btns).forEach(key => {
                const el = document.getElementById(btns[key]);
                if (key === sub) {
                    el.classList.add('ring-2', 'ring-indigo-600', 'font-extrabold');
                } else {
                    el.classList.remove('ring-2', 'ring-indigo-600', 'font-extrabold');
                }
            });

            renderChart();
        }

        /* MODAL & FORM LOGIC */
        function openModal() {
            document.getElementById('paperId').value = '';
            document.getElementById('paperForm').reset();
            document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-plus text-indigo-400"></i> Add New Paper Record';
            document.getElementById('formDate').valueAsDate = new Date();
            toggleFormComponents();
            document.getElementById('paperModal').classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('paperModal').classList.add('hidden');
        }

        function toggleFormComponents() {
            const subj = document.getElementById('formSubject').value;
            const compSection = document.getElementById('componentBreakdownSection');
            if (subj === 'Chemistry' || subj === 'Physics') {
                compSection.classList.remove('hidden');
            } else {
                compSection.classList.add('hidden');
            }
        }

        function calculateTotalFromComponents() {
            const subj = document.getElementById('formSubject').value;
            if (subj !== 'Chemistry' && subj !== 'Physics') return;

            const mcqObt = parseFloat(document.getElementById('formMcqObt').value) || 0;
            const mcqMax = parseFloat(document.getElementById('formMcqMax').value) || 0;
            const structObt = parseFloat(document.getElementById('formStructObt').value) || 0;
            const structMax = parseFloat(document.getElementById('formStructMax').value) || 0;
            const essayObt = parseFloat(document.getElementById('formEssayObt').value) || 0;
            const essayMax = parseFloat(document.getElementById('formEssayMax').value) || 0;

            const totalObt = mcqObt + structObt + essayObt;
            const totalMax = mcqMax + structMax + essayMax;

            if (totalMax > 0) {
                document.getElementById('formTotalObt').value = totalObt;
                document.getElementById('formTotalMax').value = totalMax;
            }
        }

        /* ROBUST FORM SUBMISSION HANDLER */
        async function submitPaperForm(e) {
            if (e) e.preventDefault();

            const idVal = document.getElementById('paperId').value;
            const subject = document.getElementById('formSubject').value;
            const date = document.getElementById('formDate').value;
            const name = document.getElementById('formName').value.trim();

            const totalObtVal = document.getElementById('formTotalObt').value;
            const totalMaxVal = document.getElementById('formTotalMax').value;

            // Form validation
            if (!date) {
                showToast('Please select a paper date.', 'error');
                return;
            }
            if (!name) {
                showToast('Please enter a paper name or code.', 'error');
                return;
            }
            if (totalObtVal === '' || totalMaxVal === '') {
                showToast('Please provide total marks obtained and maximum marks.', 'error');
                return;
            }

            const totalObt = parseFloat(totalObtVal);
            const totalMax = parseFloat(totalMaxVal);

            if (totalMax <= 0) {
                showToast('Maximum marks must be greater than zero.', 'error');
                return;
            }

            let record = {
                subject,
                date,
                name,
                totalObt,
                totalMax
            };

            if (idVal) record.id = parseInt(idVal, 10);

            if (subject === 'Chemistry' || subject === 'Physics') {
                const mcqObt = document.getElementById('formMcqObt').value;
                const mcqMax = document.getElementById('formMcqMax').value;
                const structObt = document.getElementById('formStructObt').value;
                const structMax = document.getElementById('formStructMax').value;
                const essayObt = document.getElementById('formEssayObt').value;
                const essayMax = document.getElementById('formEssayMax').value;

                if (mcqObt !== '' && structObt !== '' && essayObt !== '') {
                    record.mcqObt = parseFloat(mcqObt) || 0;
                    record.mcqMax = parseFloat(mcqMax) || 25;
                    record.structObt = parseFloat(structObt) || 0;
                    record.structMax = parseFloat(structMax) || 50;
                    record.essayObt = parseFloat(essayObt) || 0;
                    record.essayMax = parseFloat(essayMax) || 25;
                }
            }

            try {
                await savePaperRecord(record);
                closeModal();
                showToast(idVal ? 'Paper record updated successfully!' : 'Paper saved successfully!');
                await refreshDashboard();
            } catch (err) {
                console.error("Save Error:", err);
                showToast('Error saving record to database.', 'error');
            }
        }

        // BUG FIX: table rows now call editPaperById(id) instead of embedding the whole record as
        // JSON inside an onclick attribute (see renderTable). This looks the record up from the
        // in-memory cache populated by refreshDashboard().
        function editPaperById(id) {
            const p = papersCache.find(rec => rec.id === id);
            if (!p) {
                showToast('Could not find that paper record.', 'error');
                return;
            }
            editPaper(p);
        }

        function editPaper(p) {
            document.getElementById('paperId').value = p.id;
            document.getElementById('formSubject').value = p.subject;
            document.getElementById('formDate').value = p.date;
            document.getElementById('formName').value = p.name;
            document.getElementById('formTotalObt').value = p.totalObt;
            document.getElementById('formTotalMax').value = p.totalMax;

            toggleFormComponents();

            if (p.mcqObt !== undefined && p.mcqObt !== null) {
                document.getElementById('formMcqObt').value = p.mcqObt;
                document.getElementById('formMcqMax').value = p.mcqMax;
                document.getElementById('formStructObt').value = p.structObt;
                document.getElementById('formStructMax').value = p.structMax;
                document.getElementById('formEssayObt').value = p.essayObt;
                document.getElementById('formEssayMax').value = p.essayMax;
            } else {
                // BUG FIX: previously only the "obtained" fields were cleared here, leaving stale
                // "max" values (e.g. a custom mcqMax from a previously-edited paper) sitting in the
                // form the next time the component section became visible.
                document.getElementById('formMcqObt').value = '';
                document.getElementById('formMcqMax').value = 25;
                document.getElementById('formStructObt').value = '';
                document.getElementById('formStructMax').value = 50;
                document.getElementById('formEssayObt').value = '';
                document.getElementById('formEssayMax').value = 25;
            }

            document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-indigo-400"></i> Edit Paper Record';
            document.getElementById('paperModal').classList.remove('hidden');
        }

        async function confirmDelete(id) {
            if (window.confirm('Are you sure you want to delete this paper record?')) {
                try {
                    await deletePaperRecord(id);
                    showToast('Paper record deleted.', 'success');
                    refreshDashboard();
                } catch (err) {
                    showToast('Failed to delete paper record.', 'error');
                }
            }
        }

        /* IMPORT / EXPORT UTILITIES */
        async function exportData() {
            const papers = await getAllPapers();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(papers, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `AL_Marks_Backup_${new Date().toISOString().slice(0,10)}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            showToast('Backup JSON exported.');
        }

       async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const imported = JSON.parse(text);

        if (!Array.isArray(imported)) {
            throw new Error('JSON must contain an array of paper records.');
        }
        if (imported.length === 0) {
            showToast('The JSON file contains no paper records.', 'error');
            return;
        }

        // Look up existing records by a natural key so we update instead of duplicating
        const makeKey = (p) => `${p.subject}|${p.date}|${p.name}`.toLowerCase();
        const existing = await getAllPapers();
        const idByKey = new Map(existing.map(p => [makeKey(p), p.id]));
        const seenInFile = new Set();

        let added = 0, updated = 0;

        for (const item of imported) {
            if (
                !item.subject || !item.date || !item.name ||
                item.totalObt === undefined || item.totalMax === undefined
            ) {
                console.warn('Skipped invalid record:', item);
                continue;
            }

            const key = makeKey(item);
            if (seenInFile.has(key)) continue; // duplicate inside the file itself
            seenInFile.add(key);

            const record = {
                subject: item.subject,
                date: item.date,
                name: item.name,
                totalObt: Number(item.totalObt),
                totalMax: Number(item.totalMax)
            };

            if (
                item.mcqObt !== undefined && item.mcqMax !== undefined &&
                item.structObt !== undefined && item.structMax !== undefined &&
                item.essayObt !== undefined && item.essayMax !== undefined
            ) {
                record.mcqObt = Number(item.mcqObt);
                record.mcqMax = Number(item.mcqMax);
                record.structObt = Number(item.structObt);
                record.structMax = Number(item.structMax);
                record.essayObt = Number(item.essayObt);
                record.essayMax = Number(item.essayMax);
            }

            if (idByKey.has(key)) {
                record.id = idByKey.get(key); // put() -> overwrite the existing record
                updated++;
            } else {
                added++;                      // add() -> new record
            }

            await savePaperRecord(record);
        }

        if (added + updated === 0) {
            showToast('No valid paper records found in the JSON.', 'error');
            return;
        }

        await refreshDashboard();
        showToast(`Import done: ${added} added, ${updated} updated.`);

    } catch (error) {
        console.error('Import Error:', error);
        showToast('Failed to import JSON. Check the file format.', 'error');
    } finally {
        event.target.value = '';
    }
}