import os
import sys
import json
from datetime import datetime

# Thêm path để import module
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from memory_manager import GlobalMemory, MEMORY_DIR

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧠 Antigravity Global Brain V4 ULTIMATE</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background-color: #0b1120; color: #e2e8f0; scroll-behavior: smooth; }
        .card { transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); }
        .card:hover { transform: translateY(-10px) scale(1.02); border-color: rgba(59, 130, 246, 0.6); box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.8); }
        #network-container { height: 600px; background: radial-gradient(circle at center, #1e293b 0%, #0b1120 100%); border-radius: 3rem; border: 1px solid rgba(255, 255, 255, 0.1); }
        .btn-action { transition: all 0.2s; }
        .btn-action:hover { transform: scale(1.1); }
    </style>
</head>
<body class="p-6 md:p-12">
    <div class="max-w-7xl mx-auto">
        <header class="mb-16 flex flex-col md:flex-row justify-between items-end gap-8">
            <div class="space-y-4">
                <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-black tracking-widest uppercase shadow-lg shadow-blue-500/10">Ultimate Version 4.0</div>
                <h1 class="text-6xl font-black bg-clip-text text-transparent bg-gradient-to-tr from-white via-blue-400 to-indigo-600 tracking-tighter">
                    Ultimate Brain
                </h1>
                <p class="text-slate-500 font-semibold text-lg">Hệ thống quản trị tri thức tối thượng của Sếp <span class="text-white">Việt</span>.</p>
            </div>
            <div class="flex items-center gap-10">
                <div class="text-right">
                    <div class="text-5xl font-black text-white glow-text" id="total-count">0</div>
                    <div class="text-xs uppercase tracking-[0.3em] text-slate-500 font-bold mt-1">Ghi nhớ chủ động</div>
                </div>
                <div class="flex flex-col gap-3">
                    <button onclick="toggleView()" id="view-toggle-btn" class="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-3xl font-black transition-all shadow-xl shadow-blue-900/40 text-sm tracking-wide">
                        🕸️ KHÁM PHÁ SƠ ĐỒ
                    </button>
                    <button onclick="pruneVault()" class="bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-400 px-8 py-3 rounded-2xl font-bold transition-all border border-slate-700 text-xs uppercase tracking-widest">
                        🧹 DỌN DẸP NÃO BỘ
                    </button>
                </div>
            </div>
        </header>

        <!-- Graph Section -->
        <div id="graph-section" class="mb-16 hidden animate-in fade-in zoom-in duration-500">
            <div id="network-container"></div>
        </div>

        <!-- Control Bar -->
        <div class="mb-16 flex flex-col md:flex-row gap-6">
            <div class="relative flex-grow group">
                <input type="text" id="search-input" placeholder="Tìm kiếm sâu trong tiềm thức..." 
                    class="w-full p-6 pl-16 rounded-[2.5rem] bg-slate-900/60 border border-white/5 focus:outline-none focus:border-blue-500/70 text-xl transition-all backdrop-blur-3xl group-hover:border-white/10 shadow-2xl">
                <div class="absolute left-6 top-1/2 -translate-y-1/2 text-2xl text-slate-600 group-hover:text-blue-400 transition-colors">🔍</div>
            </div>
            
            <select id="project-filter" class="p-6 rounded-[2.5rem] bg-slate-900/60 border border-white/5 focus:outline-none focus:border-blue-500/70 font-black text-sm min-w-[280px] appearance-none cursor-pointer shadow-2xl px-10">
                <option value="all">📁 TẤT CẢ DỰ ÁN</option>
            </select>
        </div>

        <!-- Content Grid -->
        <div id="memory-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            <!-- Dynamic Cards -->
        </div>
    </div>

    <script>
        let memories = __MEMORIES_JSON__;
        let isGraphView = false;
        let network = null;
        const API_URL = "http://localhost:5005/api";

        async function deleteMemory(id) {
            if (!confirm("Thưa Sếp, Sếp có chắc chắn muốn xóa vĩnh viễn ký ức này không ạ?")) return;
            
            try {
                const res = await fetch(`${API_URL}/memories/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    memories = memories.filter(m => m.id !== id);
                    render(memories);
                    if (network) network.body.data.nodes.remove(id);
                    alert("🧠 Dạ, Em đã xóa ký ức đó theo yêu cầu của Sếp rồi ạ!");
                }
            } catch (err) {
                alert("❌ Lỗi: Có vẻ như Server chưa được khởi động ạ! (Sếp hãy chạy brain_server.py nhé)");
            }
        }

        function pruneVault() {
            alert("🧹 Hệ thống dọn dẹp (Pruning) đang được Sếp gọi... Em sẽ quét các ký ức rác và gộp chúng lại cho Sếp nhé!");
            // Logic call tới server prune endpoint
        }

        function toggleView() {
            const grid = document.getElementById('memory-grid');
            const graph = document.getElementById('graph-section');
            const btn = document.getElementById('view-toggle-btn');
            
            isGraphView = !isGraphView;
            if (isGraphView) {
                grid.classList.add('hidden');
                graph.classList.remove('hidden');
                btn.innerText = '🔲 XEM DANH SÁCH';
                initGraph();
            } else {
                grid.classList.remove('hidden');
                graph.classList.add('hidden');
                btn.innerText = '🕸️ KHÁM PHÁ SƠ ĐỒ';
            }
        }

        function initGraph() {
            if (network) return;
            const nodes = [];
            const edges = [];
            const tagNodes = new Set();
            const projectNodes = new Set();

            memories.forEach(mem => {
                const isSnapshot = mem.metadata.tags && (mem.metadata.tags.includes('#SNAPSHOT') || mem.metadata.tags.includes('#MILESTONE'));
                nodes.push({ id: mem.id, label: mem.content.slice(0, 20) + '...', title: mem.content, group: 'memory', shape: isSnapshot ? 'diamond' : 'dot', size: isSnapshot ? 25 : 12, color: isSnapshot ? '#fbbf24' : '#3b82f6' });
                const proj = mem.metadata.project || 'Global';
                if (!projectNodes.has(proj)) { projectNodes.add(proj); nodes.push({ id: proj, label: proj, group: 'project', shape: 'hexagon', color: '#a855f7', size: 20 }); }
                edges.push({ from: mem.id, to: proj, color: { opacity: 0.1 } });
            });

            const container = document.getElementById('network-container');
            network = new vis.Network(container, { nodes, edges }, { physics: { stabilization: true }, interaction: { hover: true } });
        }

        function render(data) {
            const grid = document.getElementById('memory-grid');
            grid.innerHTML = data.map(mem => {
                const isSnapshot = mem.metadata.tags && (mem.metadata.tags.includes('#SNAPSHOT') || mem.metadata.tags.includes('#MILESTONE'));
                const tags = mem.metadata.tags ? mem.metadata.tags.split(',').map(t => `<span class="px-2 py-0.5 rounded-lg ${t.includes('#') ? 'bg-yellow-500/20 text-yellow-500' : 'bg-blue-500/10 text-blue-400'} text-[9px] font-black border border-current/10">${t.trim()}</span>`).join('') : '';

                return `
                <div class="card p-10 rounded-[3rem] relative group flex flex-col min-h-[320px] ${isSnapshot ? 'border-yellow-500/30 ring-1 ring-yellow-500/20' : ''}">
                    <div class="flex justify-between items-start mb-8">
                        <div class="px-4 py-1.5 bg-white/5 rounded-2xl text-[9px] font-black text-slate-500 border border-white/5 tracking-widest uppercase">
                            ${mem.metadata.project || 'GLOBAL'}
                        </div>
                        <div class="text-[10px] font-bold text-slate-700">${mem.metadata.timestamp.slice(0, 10)}</div>
                    </div>
                    <p class="text-slate-200 text-base leading-relaxed font-semibold mb-8 flex-grow">
                        ${mem.content}
                    </p>
                    <div class="space-y-6">
                        <div class="flex flex-wrap gap-2">${tags}</div>
                        ${mem.metadata.tech_stack ? `<div class="text-[10px] font-black text-slate-600 flex items-center gap-2 uppercase tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-blue-600 shadow-lg shadow-blue-500"></span> ${mem.metadata.tech_stack}</div>` : ''}
                    </div>
                    
                    <!-- Actions -->
                    <div class="absolute top-8 right-10 flex gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                        <button onclick="navigator.clipboard.writeText('${mem.id}')" class="btn-action p-2.5 bg-slate-900 border border-white/10 rounded-xl text-slate-400 hover:text-white" title="Copy ID">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                        </button>
                        <button onclick="deleteMemory('${mem.id}')" class="btn-action p-2.5 bg-red-900/20 border border-red-500/20 rounded-xl text-red-500 hover:bg-red-500 hover:text-white" title="Xóa Ký Ức">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>`;
            }).join('');
            document.getElementById('total-count').innerText = data.length;
        }

        render(memories);

        // Filters
        const projects = [...new Set(memories.map(m => m.metadata.project || 'Global'))];
        const filter = document.getElementById('project-filter');
        projects.forEach(p => { filter.innerHTML += `<option value="${p}">${p.toUpperCase()}</option>`; });

        document.getElementById('search-input').addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            render(memories.filter(m => m.content.toLowerCase().includes(val) || (m.metadata.tags && m.metadata.tags.toLowerCase().includes(val))));
        });

        filter.addEventListener('change', (e) => {
            const val = e.target.value;
            render(val === 'all' ? memories : memories.filter(m => m.metadata.project === val));
        });
    </script>
</body>
</html>
"""

def generate():
    gm = GlobalMemory()
    memories = gm.get_all_memories()
    memories.sort(key=lambda x: x['metadata']['timestamp'], reverse=True)
    json_str = json.dumps(memories, default=str)
    html_content = HTML_TEMPLATE.replace('__MEMORIES_JSON__', json_str)
    output_path = os.path.join(MEMORY_DIR, "dashboard.html")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"✅ Dashboard V4 ULTIMATE generated at: {output_path}")
    os.system(f"open {output_path}")

if __name__ == "__main__":
    generate()
