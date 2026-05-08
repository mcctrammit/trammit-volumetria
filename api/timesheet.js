export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN  = process.env.RUNRUNIT_TOKEN;
  const APPKEY = process.env.RUNRUNIT_APPKEY;
  const headers = { 'App-Key': APPKEY, 'User-Token': TOKEN, 'Content-Type': 'application/json' };
  const { start_date, end_date, client_id } = req.query;

  const start = start_date ? new Date(start_date + 'T00:00:00') : null;
  const end   = end_date   ? new Date(end_date   + 'T23:59:59') : null;

  try {
    // PASSO 1: busca todos os usuários da empresa
    const usersR = await fetch('https://runrun.it/api/v1.0/users?limit=100', { headers });
    const usersData = usersR.ok ? await usersR.json() : [];
    const users = Array.isArray(usersData) ? usersData : (usersData.users || []);

    // PASSO 2: para cada usuário, busca as tasks com tempo apontado
    const allTasks = [];

    await Promise.all(users.map(async (user) => {
      let page = 1;
      while (true) {
        let url = `https://runrun.it/api/v1.0/tasks?limit=200&page=${page}&responsible_id=${user.id}&sort_by=updated_at&sort_order=desc`;
        if (client_id) url += '&client_id=' + client_id;

        const r = await fetch(url, { headers });
        if (!r.ok) break;
        const d = await r.json();
        const tasks = Array.isArray(d) ? d : (d.tasks || d.data || []);
        if (!tasks.length) break;

        tasks
          .filter(t => t.time_worked > 0)
          .forEach(t => allTasks.push({ ...t, _user_name: user.name }));

        if (tasks.length < 200) break;
        page++;
        if (page > 5) break;
      }

      // Busca tasks fechadas do usuário também
      page = 1;
      while (true) {
        let url = `https://runrun.it/api/v1.0/tasks?limit=200&page=${page}&responsible_id=${user.id}&is_closed=true&sort_by=updated_at&sort_order=desc`;
        if (client_id) url += '&client_id=' + client_id;

        const r = await fetch(url, { headers });
        if (!r.ok) break;
        const d = await r.json();
        const tasks = Array.isArray(d) ? d : (d.tasks || d.data || []);
        if (!tasks.length) break;

        tasks
          .filter(t => t.time_worked > 0)
          .forEach(t => allTasks.push({ ...t, _user_name: user.name }));

        if (tasks.length < 200) break;
        page++;
        if (page > 5) break;
      }
    }));

    // Remove duplicatas por id
    const unique = [...new Map(allTasks.map(t => [t.id, t])).values()];

    // Filtra por data usando updated_at
    const filtered = unique.filter(t => {
      const dateStr = t.updated_at || t.close_date || t.created_at;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (start && d < start) return false;
      if (end   && d > end)   return false;
      return true;
    });

    const normalized = filtered.map(t => ({
      id:           t.id,
      task_id:      t.id,
      task_title:   t.title || t.name || 'Task #' + t.id,
      user_name:    (t._user_name || t.user_name || t.responsible_name || 'Desconhecido').trim(),
      client_name:  t.client_name || 'Sem cliente',
      project_name: t.project_name || '',
      amount:       t.time_worked || 0,
      created_at:   t.updated_at || t.close_date || t.created_at,
    }));

    res.setHeader('X-Total-Users', users.length);
    res.setHeader('X-Total-Tasks', normalized.length);
    return res.status(200).json(normalized);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
