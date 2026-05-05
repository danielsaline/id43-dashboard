export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const PROJECTS_DB = '355b41f95ed680c7a1e2ec00430dd822';
  const GEAR_DB = '355b41f95ed6803dbc74c508d213683b';
  try {
    const [pRes, gRes] = await Promise.all([
      fetch(`https://api.notion.com/v1/databases/${PROJECTS_DB}/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_size: 100 })
      }),
      fetch(`https://api.notion.com/v1/databases/${GEAR_DB}/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_size: 100 })
      })
    ]);
    const [pData, gData] = await Promise.all([pRes.json(), gRes.json()]);
    const projects = pData.results || [];
    const gear = gData.results || [];
    const now = new Date();
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
    const activeStatuses = ['To Do', 'In Progress', 'Review'];
    const activeProjects = projects.filter(p => activeStatuses.includes(p.properties?.Status?.select?.name)).length;
    const shootsThisWeek = projects.filter(p => {
      const s = p.properties?.['Shoot Date']?.date?.start;
      const h = p.properties?.['Has Shoot']?.checkbox;
      if (!s || !h) return false;
      const d = new Date(s);
      return d >= now && d <= weekEnd;
    }).length;
    const gearOut = gear.filter(g => g.properties?.Status?.select?.name === 'Checked Out').length;
    const dueThisWeek = projects.filter(p => {
      const d = p.properties?.['Due Date']?.date?.start;
      if (!d || p.properties?.Status?.select?.name === 'Done') return false;
      const due = new Date(d);
      return due >= now && due <= weekEnd;
    }).length;
    res.status(200).json({ activeProjects, shootsThisWeek, gearOut, dueThisWeek });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
