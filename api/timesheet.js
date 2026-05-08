export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN  = process.env.RUNRUNIT_TOKEN;
  const APPKEY = process.env.RUNRUNIT_APPKEY;
  const headers = { 'App-Key': APPKEY, 'User-Token': TOKEN, 'Content-Type': 'application/json' };
  const { start_date, end_date, client_id, debug } = req.query;

  try {
    // DEBUG: testa filtros de data direto na API de tasks
    if (debug === '1') {
      const tests = [
        `https://runrun.it/api/v1.0/tasks?limit=5&updated_at_start=${start_date}&updated_at_end=${end_date}`,
        `https://runrun.it/api/v1.0/tasks?limit=5&q[updated_at_gteq]=${start_date}&q[updated_at_lteq]=${end_date}`,
        `https://runrun.it/api/v1.0/tasks?limit=5&start_date=${start_date}&end_date=${end_date}`,
        `https://runrun.it/api/v1.0/tasks?limit=5&created_at_greater_than=${start_date}&created_at_less_than=${end_date}`,
        // testa work_periods de uma task conhecida
        `https://runrun.it/api/v1.0/tasks/39353/work_periods`,
      ];

      const results = await Promise.all(tests.map(async url => {
        const r = await fetch(url, { headers });
        const d = r.ok ? await r.json() : { error: r.status };
        const arr = Array.isArray(d) ? d : (d.tasks || d.data || d.work_periods || []);
        return { url, status: r.status, count: arr.length, sample: arr[0] || d };
      }));

      return res.status(200).json(results);
    }

    // ESTRATÉGIA: busca tasks atualizadas no período usando todos os filtros possíveis
    const start = start_date ? new Date(start_date + 'T00:00:00') : null;
    const end   = end_date   ? new Date(end_date   + 'T23:59:59') : null;

    let allTasks = [];
    let page = 1;

    // Busca abertas atualizadas no período
    while (true) {
      let url = `https://runrun.it/api/v1.0/tasks?limit=200&page=${page}&sort_by=updated_at&sort_order=desc`;
      if (client_id)  url += '&client_id='  + client_id;
      if (start_date) url += '&updated_at_start=' + start_date;
      if (end_date)   url += '&updated_at_end='   + end_date;

      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const d = await r.json();
      const tasks = Array.isArray(d) ? d : (d.tasks || d.data || []);
      if (!tasks.length) break;
      allTasks = allTasks.concat(tasks.filter(t => t.time_worked > 0));
      if (tasks.length < 200) break;
      page++;
      if (page > 10) break;
    }

    // Se não veio nada com filtro de data, busca sem filtro e filtra no JS
    if (allTasks.length === 0) {
      page = 1;
      while (true) {
        let url = `https://runrun.it/api/v1.0/tasks?limit=200&page=${page}&sort_by=updated_at&sort_order=desc`;
        if (client_id) url += '&client_id=' + client_id;

        const r = await fetch(url, { headers });
        if (!r.ok) break;
        const d = await r.json();
        const tasks = Array.isArray(d) ? d : (d.tasks || d.data || []);
        if (!tasks.length) break;

        // Filtra no JS por updated_at dentro do período
        const filtered = tasks.filter(t => {
          if (!t.time_worked || t.time_worked === 0) return false;
          const dateStr = t.updated_at || t.close_date || t.created_at;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          if (start && d < start) return false;
          if (end   && d > end)   return false;
          return true;
        });

        allTasks = allTasks.concat(filtered);

        // Para de paginar se a última task já saiu do período
        if (tasks.length < 200) break;
        const lastDate = new Date(tasks[tasks.length-1].updated_at || '');
        if (start && lastDate < start) break;
        page++;
        if (page > 20) break;
      }

      // Busca fechadas também
      page = 1;
      while (true) {
        let url = `https://runrun.it/api/v1.0/tasks?limit=200&page=${page}&is_closed=true&sort_by=updated_at&sort_order=desc`;
        if (client_id) url += '&client_id=' + client_id;

        const r = await fetch(url, { headers });
        if (!r.ok) break;
        const d = await r.json();
        const tasks = Array.isArray(d) ? d : (d.tasks || d.data || []);
        if (!tasks.length) break;

        const filtered = tasks.filter(t => {
          if (!t.time_worked || t.time_worked === 0) return false;
          const dateStr = t.close_date || t.updated_at;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          if (start && d < start) return false;
          if (end   && d > end)   return false;
          return true;
        });

        allTasks = allTasks.concat(filtered);

        const lastDate = new Date(tasks[tasks.length-1].updated_at || tasks[tasks.length-1].close_date || '');
        if (start && lastDate < start) break;
        if (tasks.length < 200) break;
        page++;
        if (page > 20) break;
      }
    }

    // Remove duplicatas
    const unique = [...new Map(allTasks.map(t => [t.id, t])).values()];

    const normalized = unique.map(t => ({
      id:           t.id,
      task_id:      t.id,
      task_title:   t.title || t.name || 'Task #' + t.id,
      user_name:    (t.user_name || t.responsible_name || 'Desconhecido').trim(),
      client_name:  t.client_name || 'Sem cliente',
      project_name: t.project_name || '',
      amount:       t.time_worked || 0,
      created_at:   t.updated_at || t.close_date || t.created_at,
    }));

    res.setHeader('X-Total', normalized.length);
    return res.status(200).json(normalized);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
