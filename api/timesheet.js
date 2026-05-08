export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN  = process.env.RUNRUNIT_TOKEN;
  const APPKEY = process.env.RUNRUNIT_APPKEY;
  const headers = { 'App-Key': APPKEY, 'User-Token': TOKEN, 'Content-Type': 'application/json' };

  const { start_date, end_date, client_id } = req.query;

  try {
    let allTasks = [];
    const pageSize = 100;
    let page = 0;
    let hasMore = true;

    // ✅ CORREÇÃO 1: Buscar TODAS as tarefas com tempo apontado (com ou sem closed)
    // Não filtramos por is_closed na API, buscamos todas e filtramos depois por time_worked
    while (hasMore) {
      const offset = page * pageSize;
      let url = `https://runrun.it/api/v1.0/tasks?limit=${pageSize}&offset=${offset}&sort_by=updated_at&sort_order=desc`;
      
      if (client_id) {
        url += `&client_id=${client_id}`;
      }

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        console.error(`API Error: ${response.status}`, await response.text());
        break;
      }

      const data = await response.json();
      
      // Normalizar resposta (pode vir em diferentes formatos)
      const tasks = Array.isArray(data) ? data : (data.tasks || data.data || []);
      
      if (!tasks || tasks.length === 0) {
        hasMore = false;
        break;
      }

      allTasks = [...allTasks, ...tasks];
      page++;

      // Parar se recebemos menos itens que o limite (última página)
      if (tasks.length < pageSize) {
        hasMore = false;
      }
    }

    // ✅ CORREÇÃO 2: Filtrar por tarefas que têm time_worked
    // ✅ CORREÇÃO 3: Filtrar por data do apontamento (updated_at ou close_date, não created_at)
    let filtered = allTasks.filter(t => {
      // Só incluir tarefas com tempo apontado
      if (!t.time_worked || t.time_worked === 0) return false;

      // Filtrar por intervalo de datas (usando updated_at como proxy para data do apontamento)
      const dateStr = t.updated_at || t.close_date || t.created_at;
      if (!dateStr) return true;

      const date = new Date(dateStr);
      if (start_date && date < new Date(start_date)) return false;
      if (end_date && date > new Date(end_date + 'T23:59:59')) return false;

      return true;
    });

    // ✅ CORREÇÃO 4: Normalizar campos de usuário e cliente
    // Alguns campos podem vir em diferentes chaves dependendo da estrutura
    const entries = filtered.map(t => ({
      id:           t.id,
      task_id:      t.id,
      task_title:   t.title || t.name || `Task #${t.id}`,
      user_name:    t.user_name || t.responsible_name || t.assigned_to || 'Desconhecido',
      client_name:  t.client_name || 'Sem cliente',
      project_name: t.project_name || '',
      time_worked:  t.time_worked || 0,  // segundos
      amount:       t.time_worked || 0,  // alias para compatibilidade
      seconds:      t.time_worked || 0,  // outro alias
      created_at:   t.updated_at || t.close_date || t.created_at,
      updated_at:   t.updated_at,
      closed_at:    t.close_date,
      state:        t.state || '',
      is_closed:    t.is_closed || false,
    }));

    console.log(`[Timesheet API] Fetched ${allTasks.length} total tasks, filtered to ${entries.length} with time_worked`);

    return res.status(200).json(entries);
  } catch (err) {
    console.error('[Timesheet API Error]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
