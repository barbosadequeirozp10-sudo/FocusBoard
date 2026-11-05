'use strict';
// Regras de negócio independentes da interface, também usadas nos testes.
const FocusCore = (() => {
  const STATUSES = Object.freeze({todo: 'A fazer', doing: 'Em andamento', done: 'Concluído'});
  const PRIORITIES = Object.freeze({alta: 'Alta', media: 'Média', baixa: 'Baixa'});
  const OLD_PRIORITY = Object.freeze({'Alta': 'alta', 'Média': 'media', 'Baixa': 'baixa'});
  const validDate = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T12:00:00`);
    return !Number.isNaN(d.getTime()) && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === s;
  };
  const localToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const createId = () => (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function normalizeTask(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
    if (typeof t.title !== 'string' || !t.title.trim()) return null;
    const priority = OLD_PRIORITY[t.priority] || t.priority;
    if (!Object.hasOwn(STATUSES, t.status) || !Object.hasOwn(PRIORITIES, priority)) return null;
    const due = typeof t.due === 'string' && validDate(t.due) ? t.due : '';
    return {
      id: typeof t.id === 'string' && t.id.length > 0 && t.id.length <= 100 ? t.id : createId(),
      title: t.title.trim().slice(0, 120),
      description: typeof t.description === 'string' ? t.description.trim().slice(0, 700) : '',
      status: t.status,
      priority,
      category: typeof t.category === 'string' ? t.category.trim().slice(0, 32) : '',
      due,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : new Date().toISOString(),
    };
  }
  function normalizeBackup(input) {
    const data = Array.isArray(input) ? input : input?.tasks;
    if (!Array.isArray(data)) throw new Error('Arquivo inválido: não foi encontrada uma lista de tarefas.');
    if (data.length > 2000) throw new Error('O backup excede o limite de 2.000 tarefas.');
    const tasks = [], used = new Set();
    for (const raw of data) {
      const task = normalizeTask(raw);
      if (!task) throw new Error('O backup contém uma tarefa com título, status ou prioridade inválidos.');
      if (used.has(task.id)) task.id = createId();
      used.add(task.id);
      tasks.push(task);
    }
    return tasks;
  }
  function filterTasks(tasks, {search = '', priority = '', due = '', today = localToday()} = {}) {
    const q = String(search).trim().toLocaleLowerCase('pt-BR');
    return tasks.filter(t => {
      if (priority && t.priority !== priority) return false;
      if (q && !(`${t.title} ${t.description} ${t.category}`).toLocaleLowerCase('pt-BR').includes(q)) return false;
      if (due === 'overdue' && !(t.due && t.due < today && t.status !== 'done')) return false;
      if (due === 'today' && t.due !== today) return false;
      if (due === 'upcoming' && !(t.due && t.due > today && t.status !== 'done')) return false;
      if (due === 'nodate' && t.due) return false;
      return true;
    });
  }
  function stats(tasks, today = localToday()) {
    const total = tasks.length, done = tasks.filter(t => t.status === 'done').length;
    return {total, done, doing: tasks.filter(t => t.status === 'doing').length,
      overdue: tasks.filter(t => t.status !== 'done' && t.due && t.due < today).length,
      rate: total ? Math.round(done * 100 / total) : 0};
  }
  return {STATUSES, PRIORITIES, escapeHtml, createId, localToday, normalizeTask, normalizeBackup, filterTasks, stats, validDate};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FocusCore;

if (typeof document !== 'undefined') {
  (() => {
    const {STATUSES, PRIORITIES, escapeHtml: esc, createId, localToday, normalizeTask, normalizeBackup, filterTasks, stats} = FocusCore;
    const STORE = 'focusboard.tasks.v2', OLD_STORE = 'focusboard.tasks.v1', THEME = 'focusboard.theme.v2';
    const $ = (id) => document.getElementById(id);
    let tasks = [], currentView = 'board', deletingId = null, toastTimer, storeAvailable = true;
    function readStore() {
      try {
        const saved = localStorage.getItem(STORE);
        if (saved !== null) return normalizeBackup(JSON.parse(saved));
        const old = localStorage.getItem(OLD_STORE);
        if (old !== null) {
          const migrated = normalizeBackup(JSON.parse(old));
          localStorage.setItem(STORE, JSON.stringify(migrated));
          return migrated;
        }
        return [];
      } catch (err) {
        console.warn('FocusBoard: não foi possível carregar os dados.', err);
        storeAvailable = false;
        return [];
      }
    }
    function persist(next) {
      if (storeAvailable) {
        try { localStorage.setItem(STORE, JSON.stringify(next)); }
        catch (err) { storeAvailable = false; showStorageWarning(); console.warn('Erro ao salvar:', err); }
      }
      tasks = next;
      render();
    }
    function showStorageWarning() { $('storageWarning').classList.remove('hidden'); }
    function toast(msg) {
      $('toast').textContent = msg;
      $('toast').classList.add('visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2700);
    }
    function formatDate(iso) { if (!iso) return 'Sem prazo'; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; }
    function dueClass(t) { return t.status === 'done' ? '' : t.due === localToday() ? 'today' : t.due && t.due < localToday() ? 'overdue' : ''; }
    function dueLabel(t) { return t.due ? `◷ ${formatDate(t.due)}${dueClass(t)==='overdue' ? ' · Atrasada' : dueClass(t)==='today' ? ' · Hoje' : ''}` : '◷ Sem prazo'; }
    function currentFilters() { return {search: $('searchInput').value, priority: $('priorityFilter').value, due: $('dueFilter').value}; }
    function card(t) {
      return `<article class="task-card" draggable="true" data-id="${esc(t.id)}" tabindex="0" aria-label="Tarefa: ${esc(t.title)}"><div class="task-meta"><span class="priority ${t.priority}">${PRIORITIES[t.priority]}</span>${t.category ? `<span class="category" title="${esc(t.category)}">${esc(t.category)}</span>`:''}</div><h3>${esc(t.title)}</h3>${t.description ? `<p>${esc(t.description)}</p>` : '<p>Sem descrição.</p>'}<div class="task-foot"><span class="due ${dueClass(t)}">${dueLabel(t)}</span></div><div class="task-actions"><select class="card-status" aria-label="Status de ${esc(t.title)}" data-action="status" data-id="${esc(t.id)}">${Object.entries(STATUSES).map(([id,label]) => `<option value="${id}" ${id===t.status?'selected':''}>${label}</option>`).join('')}</select><div class="card-action-buttons"><button class="icon-action" type="button" data-action="edit" data-id="${esc(t.id)}" aria-label="Editar ${esc(t.title)}" title="Editar">✎</button><button class="icon-action" type="button" data-action="delete" data-id="${esc(t.id)}" aria-label="Excluir ${esc(t.title)}" title="Excluir">⌫</button></div></div></article>`;
    }
    function renderMetrics() {
      const s=stats(tasks);
      const data=[['Total de tarefas',s.total,'Todas as atividades','▤'],['Concluídas',s.done,`${s.rate}% do total`,'✓'],['Em andamento',s.doing,'Em execução','◷'],['Atrasadas',s.overdue,'Precisam de atenção','!']];
      $('metrics').innerHTML=data.map(([label,count,note,icon])=>`<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-icon" aria-hidden="true">${icon}</span></div><strong>${count}</strong><small>${note}</small></article>`).join('');
      $('footerCount').textContent=`${s.total} ${s.total===1?'tarefa':'tarefas'}`;
    }
    function renderBoard(items) {
      const col=Object.entries(STATUSES).map(([id,label])=>{
        const inColumn=items.filter(t=>t.status===id);
        return `<section class="lane" data-status="${id}" aria-label="${label}"><div class="lane-header"><div class="lane-title"><span class="lane-dot ${id}"></span>${label}</div><span class="lane-count">${inColumn.length}</span></div>${inColumn.length?inColumn.map(card).join(''):'<div class="empty-lane">Nenhuma tarefa nesta etapa.<br>Seu próximo passo começa aqui.</div>'}<button class="lane-add" type="button" data-action="add" data-status="${id}">＋ Adicionar tarefa</button></section>`;
      }).join('');
      $('content').innerHTML=`<div class="board">${col}</div>`;
    }
    function renderEmpty(filtered) {
      $('content').innerHTML=`<div class="empty-state"><div class="empty-symbol">✦</div><h3>${filtered?'Nenhuma tarefa encontrada':'Seu quadro está pronto!'}</h3><p>${filtered?'Tente modificar ou limpar os filtros.':'Crie a primeira tarefa para começar a organizar sua rotina.'}</p><button type="button" class="btn btn-primary" data-action="${filtered?'clear':'add'}">${filtered?'Limpar filtros':'＋ Criar primeira tarefa'}</button></div>`;
    }
    function renderList(items) {
      if (!items.length) {renderEmpty(tasks.length>0);return;}
      const ordered=[...items].sort((a,b)=>(a.due||'9999-12-31').localeCompare(b.due||'9999-12-31'));
      $('content').innerHTML=`<div class="table-wrap"><table><thead><tr><th>TAREFA</th><th>ETAPA</th><th>PRIORIDADE</th><th>PRAZO</th><th>AÇÕES</th></tr></thead><tbody>${ordered.map(t=>`<tr><td><span class="table-title">${esc(t.title)}</span><span class="table-desc">${esc(t.description||t.category||'Sem detalhes')}</span></td><td>${STATUSES[t.status]}</td><td><span class="priority ${t.priority}">${PRIORITIES[t.priority]}</span></td><td><span class="due ${dueClass(t)}">${dueLabel(t)}</span></td><td><button class="icon-action" title="Editar" aria-label="Editar ${esc(t.title)}" type="button" data-action="edit" data-id="${esc(t.id)}">✎</button><button class="icon-action" title="Excluir" aria-label="Excluir ${esc(t.title)}" type="button" data-action="delete" data-id="${esc(t.id)}">⌫</button></td></tr>`).join('')}</tbody></table></div>`;
    }
    function bars(items,labels,source) {
      return labels.map(([id,label])=>{
        const count=items.filter(t=>t[source]===id).length, width=items.length?Math.round(count/items.length*100):0;
        return `<div class="bar-row"><span>${label}</span><div class="bar-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width}"><div class="bar-fill ${id}" style="width:${width}%"></div></div><strong>${count}</strong></div>`;
      }).join('');
    }
    function renderDashboard(items) {
      const s=stats(items);
      $('content').innerHTML=`<div class="dashboard-grid"><section class="panel"><h3>Distribuição por etapa</h3>${bars(items,Object.entries(STATUSES),'status')}</section><section class="panel"><h3>Distribuição por prioridade</h3>${bars(items,Object.entries(PRIORITIES),'priority')}</section><section class="panel"><h3>Seu progresso</h3><div class="progress-track"><div class="progress-fill" style="width:${s.rate}%" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.rate}" aria-label="Progresso de conclusão"></div></div><div class="progress-text"><span>${s.done} de ${s.total} tarefas concluídas</span><strong>${s.rate}%</strong></div><p class="dashboard-note">${s.total?'Continue acompanhando seu quadro: pequenos avanços constroem grandes resultados.':'Cadastre tarefas para começar a acompanhar os indicadores.'}</p></section><section class="panel"><h3>Visão rápida</h3><p class="dashboard-note">${s.overdue?`Você tem <strong>${s.overdue}</strong> ${s.overdue===1?'tarefa atrasada':'tarefas atrasadas'} nesta visualização.`:'Nenhuma tarefa atrasada nesta visualização.'}<br>Os gráficos respeitam a busca e os filtros selecionados. Os indicadores no alto mostram o total geral do seu quadro.</p></section></div>`;
    }
    function render() {
      renderMetrics();
      const items=filterTasks(tasks,currentFilters());
      if (currentView==='board') renderBoard(items);
      else if(currentView==='list') renderList(items);
      else renderDashboard(items);
    }
    function setView(view) {
      if (!['board','list','dashboard'].includes(view)) return;
      currentView=view;
      document.querySelectorAll('.nav-item').forEach(btn=>{
        const active=btn.dataset.view===view;btn.classList.toggle('active',active);btn.setAttribute('aria-current',active?'page':'false');
      });
      const copy={board:['Quadro Kanban','Mais clareza para suas tarefas, um passo por vez.','Meu quadro','Arraste os cartões ou altere o status para organizar.'],list:['Todas as tarefas','Veja suas atividades em uma lista simples.','Lista de atividades','As tarefas com prazo mais próximo aparecem primeiro.'],dashboard:['Dashboard','Acompanhe os seus resultados em um só lugar.','Indicadores de produtividade','Os gráficos consideram os filtros selecionados.']};
      [$('pageTitle').textContent,$('pageSubtitle').textContent,$('sectionTitle').textContent,$('sectionSubtitle').textContent]=copy[view];
      render();
    }
    function openEditor(id, presetStatus='todo') {
      const t=tasks.find(x=>x.id===id);
      $('taskId').value=t?.id||'';
      $('formHeading').textContent=t?'Editar tarefa':'Nova tarefa';
      $('taskTitle').value=t?.title||'';
      $('taskDescription').value=t?.description||'';
      $('taskStatus').value=t?.status||presetStatus;
      $('taskPriority').value=t?.priority||'media';
      $('taskDue').value=t?.due||'';
      $('taskCategory').value=t?.category||'';
      $('formError').hidden=true;
      $('taskDialog').showModal();
      $('taskTitle').focus();
    }
    function closeEditor() {$('taskDialog').close();}
    function submitForm(event) {
      event.preventDefault();
      const title=$('taskTitle').value.trim();
      if (!title) {$('formError').textContent='Informe o título da tarefa.';$('formError').hidden=false;$('taskTitle').focus();return;}
      const id=$('taskId').value;
      const now=new Date().toISOString();
      const original=tasks.find(t=>t.id===id);
      const item=normalizeTask({id:id||createId(),title,description:$('taskDescription').value,status:$('taskStatus').value,priority:$('taskPriority').value,due:$('taskDue').value,category:$('taskCategory').value,createdAt:original?.createdAt||now,updatedAt:now});
      if(!item){$('formError').textContent='Confira os campos informados.';$('formError').hidden=false;return;}
      if(id && !original){toast('Tarefa não encontrada.');return;}
      persist(id?tasks.map(t=>t.id===id?item:t):[item,...tasks]);
      closeEditor();toast(id?'Tarefa atualizada!':'Tarefa criada!');
    }
    function moveTask(id,status) {
      if(!Object.hasOwn(STATUSES,status))return;
      const t=tasks.find(t=>t.id===id);
      if(!t||t.status===status)return;
      persist(tasks.map(x=>x.id===id?{...x,status,updatedAt:new Date().toISOString()}:x));
      toast('Etapa atualizada!');
    }
    function deleteTask() {
      if(!deletingId)return;
      persist(tasks.filter(t=>t.id!==deletingId));
      $('deleteDialog').close();deletingId=null;toast('Tarefa excluída.');
    }
    function exportBackup() {
      const backup={app:'FocusBoard',version:2,exportedAt:new Date().toISOString(),tasks};
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`focusboard-backup-${localToday()}.json`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
      toast('Backup exportado!');
    }
    async function importBackup(event) {
      const file=event.target.files?.[0];
      event.target.value='';
      if(!file)return;
      if(file.size>2_000_000){toast('Arquivo muito grande (máximo: 2 MB).');return;}
      try {
        const parsed=JSON.parse(await file.text());
        const imported=normalizeBackup(parsed);
        if(!window.confirm(`Restaurar ${imported.length} tarefa(s)? Isso substituirá as ${tasks.length} tarefa(s) atuais. Exporte um backup antes, se quiser preservá-las.`))return;
        persist(imported);toast('Backup importado com sucesso!');
      } catch(err) {toast(`Falha na importação: ${err.message||'JSON inválido.'}`);}
    }
    function loadExample() {
      if(tasks.length && !window.confirm('Adicionar 4 tarefas de exemplo ao seu quadro atual?'))return;
      const base=new Date();
      const future=new Date(base);future.setDate(future.getDate()+3);
      const yesterday=new Date(base);yesterday.setDate(yesterday.getDate()-1);
      const dateOf=d=>localToday(d);
      const example=[
        ['Organizar minhas prioridades','Planejar as atividades da semana.','todo','alta',dateOf(base),'Planejamento'],
        ['Estudar JavaScript','Revisar variáveis, funções e eventos.','doing','media',dateOf(future),'Estudos'],
        ['Revisar tarefas atrasadas','Conferir itens pendentes no quadro.','todo','alta',dateOf(yesterday),'Rotina'],
        ['Criar meu primeiro projeto','Separar ideias para o portfólio.','done','baixa','','Projetos']
      ];
      const now=new Date().toISOString();
      const sample=example.map(([title,description,status,priority,due,category])=>({id:createId(),title,description,status,priority,due,category,createdAt:now,updatedAt:now}));
      persist([...sample,...tasks]);toast('4 exemplos adicionados. Você pode editá-los ou excluí-los.');
    }
    function setTheme(theme) {
      document.documentElement.dataset.theme=theme;
      $('themeBtn').textContent=theme==='dark'?'☀':'☾';
      $('themeBtn').setAttribute('aria-label',theme==='dark'?'Ativar tema claro':'Ativar tema escuro');
      try {localStorage.setItem(THEME,theme);}catch{}
    }
    // Eventos da interface
    $('taskForm').addEventListener('submit',submitForm);
    $('addBtn').addEventListener('click',()=>openEditor());
    $('cancelForm').addEventListener('click',closeEditor);
    $('closeForm').addEventListener('click',closeEditor);
    $('taskTitle').addEventListener('input',()=>$('formError').hidden=true);
    $('cancelDelete').addEventListener('click',()=>$('deleteDialog').close());
    $('confirmDelete').addEventListener('click',deleteTask);
    $('exportBtn').addEventListener('click',exportBackup);
    $('importBtn').addEventListener('click',()=>$('importFile').click());
    $('importFile').addEventListener('change',importBackup);
    $('demoBtn').addEventListener('click',loadExample);
    $('themeBtn').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
    document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
    ['searchInput','priorityFilter','dueFilter'].forEach(id=>$(id).addEventListener(id==='searchInput'?'input':'change',render));
    function clearFilters(){$('searchInput').value='';$('priorityFilter').value='';$('dueFilter').value='';render();}
    $('clearFilters').addEventListener('click',clearFilters);
    $('content').addEventListener('click',event=>{
      const target=event.target.closest('button[data-action]');if(!target)return;
      const {action,id,status}=target.dataset;
      if(action==='edit')openEditor(id);
      else if(action==='delete'){deletingId=id;$('deleteDialog').showModal();}
      else if(action==='add')openEditor(undefined,status||'todo');
      else if(action==='clear')clearFilters();
    });
    $('content').addEventListener('change',event=>{const sel=event.target.closest('select[data-action="status"]');if(sel)moveTask(sel.dataset.id,sel.value);});
    $('content').addEventListener('dragstart',event=>{
      const c=event.target.closest('.task-card');if(!c||!event.dataTransfer)return;
      event.dataTransfer.setData('text/plain',c.dataset.id);event.dataTransfer.effectAllowed='move';
    });
    $('content').addEventListener('dragover',event=>{
      const lane=event.target.closest('.lane');if(lane){event.preventDefault();event.dataTransfer.dropEffect='move';lane.classList.add('drop-target');}
    });
    $('content').addEventListener('dragleave',event=>{
      const lane=event.target.closest('.lane');if(lane&&!lane.contains(event.relatedTarget))lane.classList.remove('drop-target');
    });
    $('content').addEventListener('drop',event=>{
      const lane=event.target.closest('.lane');if(!lane||!event.dataTransfer)return;
      event.preventDefault();moveTask(event.dataTransfer.getData('text/plain'),lane.dataset.status);
      document.querySelectorAll('.lane.drop-target').forEach(x=>x.classList.remove('drop-target'));
    });
    $('content').addEventListener('dragend',()=>document.querySelectorAll('.lane.drop-target').forEach(x=>x.classList.remove('drop-target')));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')return;
      const el=document.activeElement,editing=el&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName);
      if(!editing&&!$('taskDialog').open&&!$('deleteDialog').open&&event.key.toLowerCase()==='n'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();openEditor();}
    });
    try {const savedTheme=localStorage.getItem(THEME);setTheme(savedTheme==='light'?'light':'dark');}catch{setTheme('dark');}
    tasks=readStore();
    if(!storeAvailable)showStorageWarning();
    setView('board');
  })();
}
