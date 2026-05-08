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
    // PASSO 1: Busca todas as tasks com tempo apontado (abertas + fechadas)
    let allTasks = [];
    let page = 1;

    while (true) {
      let url = `https://runrun.it/api/v1.0/tasks?limit=200&page=${page}&sort_by=updated_at&sort_order=desc`;
      if (client_id) url += '&client_id=' + client_id;

      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const d = await r.json();
      const tasks = Array.isArray(d) ? d : (d.tasks || d.data || []);
      if (!tasks.length) break;

      // Só tasks com tempo apontado
      const withTime = tasks.filter(t => t.time_worked && t.time_worked > 0);
      allTasks = allTasks.concat(withTime);
      if (tasks.length < 200) break;
      page++;
      if (page > 10) break;
    }

    // Busca tasks fechadas também
    page = 1;
    while (true) {
      let url = `https://runrun.it/api/v1.0/tasks?limit=200&page=${page}&is_closed=true&sort_by=updated_at&sort_order=desc`;
      if (client_id) url += '&client_id=' + client_id;

      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const d = await r.json();
      const tasks = Array.isArray(d) ? d : (d.tasks || d.data || []);
      if (!tasks.length) break;

      const withTime = tasks.filter(t => t.time_worked && t.time_worked > 0);
      allTasks = allTasks.concat(withTime);
      if (tasks.length < 200) break;
      page++;
      if (page > 10) break;
    }

    // Remove duplicatas por id
    const uniqueTasks = [...new Map(allTasks.map(t => [t.id, t])).values()];

    // PASSO 2: Busca work_periods de cada task em paralelo (lotes de 10)
    const start = start_date ? new Date(start_date + 'T00:00:00') : null;
    const end   = end_date   ? new Date(end_date   + 'T23:59:59') : null;

    const allEntries = [];
    const batchSize = 10;

    for (let i = 0; i < uniqueTasks.length; i += batchSize) {
      const batch = uniqueTasks.slice(i, i + batchSize);

      const results = await Promise.all(batch.map(async (task) => {
        try {
          const url = `https://runrun.it/api/v1.0/tasks/${task.id}/work_periods`;
          const r = await fetch(url, { headers });
          if (!r.ok) return [];

          const data = await r.json();
          const periods = Array.isArray(data) ? data : (data.work_periods || data.data || []);

          // Filtra pelo período de data
          return periods
            .filter(p => {
              const dateStr = p.created_at || p.date || p.started_at || p.start_time;
              if (!dateStr) return true;
              const d = new Date(dateStr);
              if (start && d < start) return false;
              if (end   && d > end)   return false;
              return true;
            })
            .map(p => ({
              id:           p.id || `${task.id}_${p.created_at}`,
              task_id:      task.id,
              task_title:   task.title || task.name || 'Task #' + task.id,
              user_name:    p.user_name || task.user_name || task.responsible_name || 'Desconhecido',
              client_name:  task.client_name || 'Sem cliente',
              project_name: task.project_name || '',
              amount:       p.amount || p.seconds || p.time_worked || 0,
              created_at:   p.created_at || p.date || p.started_at,
            }));
        } catch(e) {
          return [];
        }
      }));

      results.forEach(r => allEntries.push(...r));
    }

    // Se não encontrou nada via work_periods, fallback para tasks filtradas por updated_at
    if (allEntries.length === 0) {
      const fallback = uniqueTasks
        .filter(t => {
          const dateStr = t.updated_at || t.close_date || t.created_at;
          if (!dateStr) return true;
          const d = new Date(dateStr);
          if (start && d < start) return false;
          if (end   && d > end)   return false;
          return true;
        })
        .map(t => ({
          id:           t.id,
          task_id:      t.id,
          task_title:   t.title || t.name || 'Task #' + t.id,
          user_name:    t.user_name || t.responsible_name || 'Desconhecido',
          client_name:  t.client_name || 'Sem cliente',
          project_name: t.project_name || '',
          amount:       t.time_worked || 0,
          created_at:   t.updated_at || t.close_date || t.created_at,
        }));

      return res.status(200).json(fallback);
    }

    return res.status(200).json(allEntries);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
