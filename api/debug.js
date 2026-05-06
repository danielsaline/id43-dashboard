export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const PROJECTS_DB = '355b41f95ed680c7a1e2ec00430dd822';

  const today = new Date();
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayMidnight);
  weekEnd.setDate(todayMidnight.getDate() + (7 - todayMidnight.getDay()));
  weekEnd.setHours(23, 59, 59, 999);

  const pRes = await fetch(`https://api.notion.com/v1/databases/${PROJECTS_DB}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_size: 100 })
  });
  const pData = await pRes.json();
  const projects = pData.results || [];

  const shootProjects = projects
    .filter(p => p.properties?.['Has Shoot']?.checkbox)
    .map(p => {
      const s = p.properties?.['Shoot Date']?.date?.start;
      const name = p.properties?.['Project Name']?.title?.[0]?.plain_text || 'Untitled';
      const status = p.properties?.Status?.select?.name;
      const d = s ? new Date(s) : null;
      const dMidnight = d ? new Date(d) : null;
      if (dMidnight) dMidnight.setHours(0, 0, 0, 0);
      return {
        name,
        status,
        rawStart: s,
        parsedUTC: d ? d.toISOString() : null,
        normalizedMidnight: dMidnight ? dMidnight.toISOString() : null,
        inRange: dMidnight ? (dMidnight >= todayMidnight && dMidnight <= weekEnd) : false,
      };
    });

  res.status(200).json({
    serverNow: today.toISOString(),
    todayMidnight: todayMidnight.toISOString(),
    weekEnd: weekEnd.toISOString(),
    shootProjects,
  });
}
