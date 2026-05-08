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
    let allEntries = [];
    let page = 1;
    const limit = 200;

    // Busca todos os apontamentos paginando até acabar
    while (true) {
      let url = `https://runrun.it/api/v1.0/timesheets?limit=${limit}&page=${page}&sort_by=created_at&sort_order=desc`;
      if (start_date) url += '&start_date=' + start_date;
      if (end_date)   url += '&end_date='   + end_date;
      if (client_id)  url += '&client_id='  + client_id;

      const r = await fetch(url, { headers });
      if (!r.ok) {
        const text = await r.text();
        return res.status(r.status).json({ error: text });
      }

      const data = await r.json();
      const entries = Array.isArray(data) ? data : (data.timesheets || data.data || []);

      if (!entries.length) break;
      allEntries = allEntries.concat(entries);

      // Se retornou menos que o limite, não há mais páginas
      if (entries.length < limit) break;
      page++;

      // Segurança: máximo 20 páginas (4000 registros)
      if (page > 20) break;
    }

    // Normaliza os campos para o front
    const normalized = allEntries.map(t => ({
      id:           t.id,
      task_id:      t.task_id,
      task_title:   t.task_title || t.task_name || 'Task #' + t.task_id,
      user_name:    t.user_name  || t.user      || 'Desconhecido',
      client_name:  t.client_name || t.client   || 'Sem cliente',
      project_name: t.project_name || t.project || '',
      amount:       t.amount || t.seconds || t.time_worked || 0, // segundos
      created_at:   t.created_at || t.date || t.started_at,
    }));

    return res.status(200).json(normalized);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
