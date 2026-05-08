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

    // Fetch open tasks
    let url1 = 'https://runrun.it/api/v1.0/tasks?limit=200&sort_by=updated_at&sort_order=desc';
    if (client_id) url1 += '&client_id=' + client_id;

    // Fetch closed tasks (where most time is logged)
    let url2 = url1 + '&is_closed=true';

    const [r1, r2] = await Promise.all([
      fetch(url1, { headers }),
      fetch(url2, { headers }),
    ]);

    const d1 = r1.ok ? await r1.json() : [];
    const d2 = r2.ok ? await r2.json() : [];

    const open   = Array.isArray(d1) ? d1 : (d1.tasks || d1.data || []);
    const closed = Array.isArray(d2) ? d2 : (d2.tasks || d2.data || []);
    allTasks = [...open, ...closed];

    // Filter by date range using updated_at or close_date
    let filtered = allTasks.filter(t => {
      // Only include tasks with actual time worked
      if (!t.time_worked || t.time_worked === 0) return false;

      // Date filtering
      const dateStr = t.close_date || t.updated_at || t.created_at;
      if (!dateStr) return true;
      const date = new Date(dateStr);
      if (start_date && date < new Date(start_date)) return false;
      if (end_date   && date > new Date(end_date + 'T23:59:59')) return false;
      return true;
    });

    // Normalize into timesheet-like entries
    const entries = filtered.map(t => ({
      id:          t.id,
      task_id:     t.id,
      task_title:  t.title || t.name || 'Task #' + t.id,
      user_name:   t.user_name || t.responsible_name || 'Desconhecido',
      client_name: t.client_name || 'Sem cliente',
      project_name: t.project_name || '',
      time_worked:  t.time_worked || 0,          // seconds
      amount:       t.time_worked || 0,          // alias
      created_at:   t.close_date || t.updated_at || t.created_at,
      state:        t.state || '',
    }));

    return res.status(200).json(entries);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
