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

    // Normalize to start of today (midnight) so date-only shoot dates aren't excluded
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // End of this Sunday (end of current week, matching Notion's week filter)
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + (7 - today.getDay()));
    weekEnd.setHours(23, 59, 59, 999);

    // Rolling 7 days for due this week (unchanged behavior)
    const dueEnd = new Date(today);
    dueEnd.setDate(today.getDate() + 7);
    dueEnd.setHours(23, 59, 59, 999);

    const activeStatuses = ['To Do', 'In Progress', 'Review'];

    const activeProjects = projects.filter(p =>
      activeStatuses.includes(p.properties?.Status?.select?.name)
    ).length;

    const shootsThisWeek = projects.filter(p => {
      const s = p.properties?.['Shoot Date']?.date?.start;
      if (!s) return false;
      const d = new Date(s);
      d.setHours(0, 0, 0, 0);
      return d >= today && d <= weekEnd;
    }).length;

    const gearOut = gear.filter(g =>
      g.properties?.Status?.select?.name === 'Checked Out'
    ).length;

    const dueThisWeek = projects.filter(p => {
      const d = p.properties?.['Due Date']?.date?.start;
      if (!d || p.properties?.Status?.select?.name === 'Done') return false;
      const due = new Date(d);
      due.setHours(0, 0, 0, 0);
      return due >= today && due <= dueEnd;
    }).length;

    res.status(200).json({ activeProjects, shootsThisWeek, gearOut, dueThisWeek });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
