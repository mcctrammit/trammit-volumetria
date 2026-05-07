export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN  = process.env.RUNRUNIT_TOKEN;
  const APPKEY = process.env.RUNRUNIT_APPKEY;
  const headers = { 'App-Key': APPKEY, 'User-Token': TOKEN, 'Content-Type': 'application/json' };

  const { start_date, end_date, client_id } = req.query;

  let url = 'https://runrun.it/api/v1.0/time_entries?limit=500&sort_by=created_at&sort_order=desc';
  if (start_date) url += '&start_date=' + start_date;
  if (end_date)   url += '&end_date='   + end_date;
  if (client_id)  url += '&client_id='  + client_id;

  try {
    // Fetch up to 3 pages (1500 entries) to cover large periods
    let allEntries = [];
    for (let page = 1; page <= 3; page++) {
      const r = await fetch(url + '&page=' + page, { headers });
      if (!r.ok) {
        if (page === 1) return res.status(r.status).json({ error: await r.text() });
        break;
      }
      const data = await r.json();
      const entries = Array.isArray(data) ? data : (data.time_entries || data.data || []);
      if (entries.length === 0) break;
      allEntries = allEntries.concat(entries);
      if (entries.length < 500) break;
    }
    return res.status(200).json(allEntries);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
