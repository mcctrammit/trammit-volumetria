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
    if (debug === '1') {
      // Testa todos os endpoints possíveis de timesheet no Runrunit
      const endpoints = [
        'timesheets',
        'time_entries',
        'task_time_entries',
        'activities',
        'time_logs',
        'worklogs',
        'time_trackings',
        'task_activities',
      ];

      const results = await Promise.all(endpoints.map(async (ep) => {
        const url = `https://runrun.it/api/v1.0/${ep}?limit=3`;
        const r = await fetch(url, { headers });
        const text = await r.text();
        let data = null;
        try { data = JSON.parse(text); } catch(e) { data = text.substring(0, 100); }
        const arr = Array.isArray(data) ? data : (data?.data || data?.items || []);
        return {
          endpoint: ep,
          status: r.status,
          count: arr.length,
          keys: arr[0] ? Object.keys(arr[0]).slice(0, 15) : [],
          sample: arr[0] || data,
        };
      }));

      return res.status(200).json({ endpoint_tests: results });
    }

    return res.status(200).json({ error: 'Use ?debug=1 para descobrir endpoints' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
