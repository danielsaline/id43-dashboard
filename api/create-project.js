export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const PROJECTS_DB = '355b41f95ed680c7a1e2ec00430dd822';

  const { name, clientId, type, types, hasShoot, shootDatePayload, dueDate, assignedTo } = req.body;

  // Support both legacy single `type` and new multi-select `types` array
  const typeList = types && types.length > 0 ? types : type ? [type] : [];
  if (!name || typeList.length === 0) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const properties = {
      'Project Name': { title: [{ text: { content: name } }] },
      'Status':       { select: { name: 'To Do' } },
      'Type':         { multi_select: typeList.map(t => ({ name: t })) },
      'Has Shoot':    { checkbox: !!hasShoot }
    };

    if (clientId)              properties['Client']     = { relation: [{ id: clientId }] };
    if (shootDatePayload) properties['Shoot Date'] = { date: shootDatePayload };
    if (dueDate)               properties['Due Date']   = { date: { start: dueDate } };

    if (assignedTo && assignedTo.length > 0) {
      properties['Assigned to'] = {
        people: assignedTo.map(id => ({ object: 'user', id }))
      };
    }

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type':   'application/json'
      },
      body: JSON.stringify({ parent: { database_id: PROJECTS_DB }, properties })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.message });

    res.status(200).json({ url: data.url, id: data.id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
