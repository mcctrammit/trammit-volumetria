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
    let offset = 0;
    let continueLooping = true;
    let pageCount = 0;

    // ✅ CORREÇÃO CRÍTICA: Loop de paginação que busca TODAS as páginas
    // Continua até receber menos itens que o pageSize (última página)
    while (continueLooping) {
      let url = `https://runrun.it/api/v1.0/tasks?limit=${pageSize}&offset=${offset}&sort_by=updated_at&sort_order=desc`;
      
      if (client_id) {
        url += `&client_id=${client_id}`;
      }

      console.log(`[Timesheet] Fetching page ${pageCount + 1}, offset: ${offset}`);

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        console.error(`API Error: ${response.status}`, await response.text());
        break;
      }

      const data = await response.json();
      
      // Normalizar resposta (pode vir em diferentes formatos)
      const tasks = Array.isArray(data) ? data : (data.tasks || data.data || []);
      
      if (!tasks || tasks.length === 0) {
        console.log(`[Timesheet] No more tasks at offset ${offset}, stopping loop`);
        continueLooping = false;
        break;
      }

      console.log(`[Timesheet] Page ${pageCount + 1} returned ${tasks.length} tasks`);
      allTasks = [...allTasks, ...tasks];
      pageCount++;

      // ✅ CORREÇÃO: Parar somente quando recebemos MENOS itens que o limite
      if (tasks.length < pageSize) {
        console.log(`[Timesheet] Last page detected (${tasks.length} < ${pageSize}), stopping loop`);
        continueLooping = false;
      } else {
        // Continuar para próxima página
        offset += pageSize;
      }
    }

    console.log(`[Timesheet] Paginação completa. Total de páginas: ${pageCount}, Total de tarefas: ${allTasks.length}`);

    // ✅ FILTRO: Por tarefas com time_worked
    let filtered = allTasks.filter(t => {
      // Só incluir tarefas com tempo apontado
      if (!t.time_worked || t.time_worked === 0) return false;

      // ✅ FILTRO DE DATA: Usar updated_at (data real do apontamento)
      const dateStr = t.updated_at || t.close_date || t.created_at;
      if (!dateStr) return true;

      const date = new Date(dateStr);
      if (start_date && date < new Date(start_date)) return false;
      if (end_date && date > new Date(end_date + 'T23:59:59')) return false;

      return true;
    });

    console.log(`[Timesheet] Filtradas ${filtered.length} tarefas com time_worked no período`);

    // ✅ NORMALIZAR: Campos de usuário e cliente (trata variações)
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

    console.log(`[Timesheet API] ✅ SUCESSO: ${pageCount} páginas = ${allTasks.length} tarefas totais = ${entries.length} com apontamento`);

    return res.status(200).json(entries);
  } catch (err) {
    console.error('[Timesheet API Error]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
