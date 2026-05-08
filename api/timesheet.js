export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN  = process.env.RUNRUNIT_TOKEN;
  const APPKEY = process.env.RUNRUNIT_APPKEY;
  const headers = { 'App-Key': APPKEY, 'User-Token': TOKEN, 'Content-Type': 'application/json' };

  // Aceita tanto start_date/end_date (front) quanto period_start/period_end
  const start = req.query.start_date || req.query.period_start;
  const end   = req.query.end_date   || req.query.period_end;
  const client_id = req.query.client_id;

  try {
    let url = 'https://runrun.it/api/v1.0/reports/time_worked?group_by=task_id,user_id,client_id,date';
    if (start)     url += '&period_start=' + start;
    if (end)       url += '&period_end='   + end;
    if (client_id) url += '&client_id='    + client_id;

    const r = await fetch(url, { headers });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: text });
    }

    const data = await r.json();
    const results = data.result || [];

    const normalized = results
      .filter(t => t.time > 0)
      .map(t => ({
        id:           `${t.task_id}_${t.user_id}_${t.date}`,
        task_id:      t.task_id,
        task_title:   t.task_title || 'Task #' + t.task_id,
        user_name:    (t.user_name || 'Desconhecido').trim(),
        client_name:  t.client_name || 'Sem cliente',
        project_name: t.project_name || '',
        amount:       t.time || 0,
        automatic:    t.automatic_time || 0,
        manual:       t.manual_time || 0,
        created_at:   t.date,
      }));

    return res.status(200).json(normalized);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
