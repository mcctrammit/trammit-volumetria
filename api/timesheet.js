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
    // DEBUG MODE: acesse /api/timesheet?debug=1&start_date=2026-05-01&end_date=2026-05-08
    if (debug === '1') {
      const urls = [
        `https://runrun.it/api/v1.0/timesheets?limit=5`,
        `https://runrun.it/api/v1.0/timesheets?limit=5&start_date=${start_date}&end_date=${end_date}`,
        `https://runrun.it/api/v1.0/timesheets?limit=5&created_at_start=${start_date}&created_at_end=${end_date}`,
        `https://runrun.it/api/v1.0/timesheets?limit=5&q[created_at_gteq]=${start_date}&q[created_at_lteq]=${end_date}`,
      ];

      const results = await Promise.all(urls.map(async (u) => {
        const r = await fetch(u, { headers });
        const d = r.ok ? await r.json() : { error: r.status };
        const arr = Array.isArray(d) ? d : (d.timesheets || d.data || []);
        return {
          url: u,
          status: r.status,
          count: arr.length,
          sample_keys: arr[0] ? Object.keys(arr[0]) : [],
          sample: arr[0] || null,
        };
      }));

      return res.status(200).json({ filter_tests: results });
    }

    // BUSCA REAL: pagina tudo e filtra por data no JS
    let allEntries = [];
    let page = 1;
    const limit = 200;

    while (true) {
      let url = `https://runrun.it/api/v1.0/timesheets?limit=${limit}&page=${page}&sort_by=created_at&sort_order=desc`;
      if (client_id) url += '&client_id=' + client_id;

      const r = await fetch(url, { headers });
      if (!r.ok) break;

      const data = await r.json();
      const entries = Array.isArray(data) ? data : (data.timesheets || data.data || []);
      if (!entries.length) break;

      allEntries = allEntries.concat(entries);
      if (entries.length < limit) break;
      page++;
      if (page > 20) break;
    }

    // Filtra por data usando todos os campos possíveis
    const start = start_date ? new Date(start_date + 'T00:00:00') : null;
    const end   = end_date   ? new Date(end_date   + 'T23:59:59') : null;

    const filtered = allEntries.filter(t => {
      const dateStr = t.created_at || t.date || t.started_at || t.updated_at;
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (start && d < start) return false;
      if (end   && d > end)   return false;
      return true;
    });

    const normalized = filtered.map(t => ({
      id:           t.id,
      task_id:      t.task_id,
      task_title:   t.task_title || t.task_name || 'Task #' + t.task_id,
      user_name:    t.user_name  || t.user      || 'Desconhecido',
      client_name:  t.client_name || t.client   || 'Sem cliente',
      project_name: t.project_name || t.project || '',
      amount:       t.amount || t.seconds || t.time_worked || 0,
      created_at:   t.created_at || t.date || t.started_at,
    }));

    res.setHeader('X-Debug-Total-Raw', allEntries.length);
    res.setHeader('X-Debug-Filtered', normalized.length);
    res.setHeader('X-Debug-Pages', page - 1);

    return res.status(200).json(normalized);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
