const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PROJECTS_DB = '355b41f95ed680c7a1e2ec00430dd822';
const GEAR_DB = '355b41f95ed6803dbc74c508d213683b';

const PERSON_MAP = {
  daniel:  'daniel saline',
  kyle:    'kyle moeller',
  gavin:   'gavin izzard',
  joel:    'joel schneider',
  josh:    'josh',
  mike:    'mike walsh',
  dominic: 'dominic shelden',
};

async function queryNotion(databaseId, filter) {
  const body = filter ? { filter, page_size: 100 } : { page_size: 100 };
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion error: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

function assignedTo(page, personName) {
  const people = page.properties['Assigned to']?.people || [];
  const firstName = personName.split(' ')[0];
  return people.some(p => (p.name || '').toLowerCase().includes(firstName));
}

function gearAssignedTo(page, firstName) {
  const text = page.properties['Person']?.rich_text?.[0]?.plain_text || '';
  return text.toLowerCase().includes(firstName);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const personKey = (req.query.person || '').toLowerCase();
  const personName = PERSON_MAP[personKey];

  if (!personName) {
    return res.status(400).json({
      error: `Unknown person: "${personKey}". Valid: ${Object.keys(PERSON_MAP).join(', ')}`
    });
  }

  const firstName = personName.split(' ')[0];

  try {
    // Normalize to midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start of this week (Sunday) — matches Notion's full week view
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    weekStart.setHours(0, 0, 0, 0);

    // End of this Saturday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Rolling 7 days for due this week
    const dueEnd = new Date(today);
    dueEnd.setDate(today.getDate() + 7);
    dueEnd.setHours(23, 59, 59, 999);

    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const dueEndStr = dueEnd.toISOString().split('T')[0];

    const activeStatuses = ['In Progress', 'To Do', 'Review'];

    const [allActive, allShoots, allGear, allDue] = await Promise.all([
      queryNotion(PROJECTS_DB, {
        or: activeStatuses.map(s => ({ property: 'Status', select: { equals: s } }))
      }),
      queryNotion(PROJECTS_DB, {
        and: [
          { property: 'Shoot Date', date: { on_or_after: weekStartStr } },
          { property: 'Shoot Date', date: { on_or_before: weekEndStr } },
        ]
      }),
      queryNotion(GEAR_DB, {
        property: 'Status', select: { equals: 'Checked Out' }
      }),
      queryNotion(PROJECTS_DB, {
        and: [
          { or: activeStatuses.map(s => ({ property: 'Status', select: { equals: s } })) },
          { property: 'Due Date', date: { on_or_after: todayStr } },
          { property: 'Due Date', date: { on_or_before: dueEndStr } },
        ]
      }),
    ]);

    const activeProjects = allActive.filter(p => assignedTo(p, personName)).length;
    const shootsThisWeek = allShoots.filter(p => assignedTo(p, personName)).length;
    const gearOut        = allGear.filter(p => gearAssignedTo(p, firstName)).length;
    const dueThisWeek    = allDue.filter(p => assignedTo(p, personName)).length;

    return res.status(200).json({ activeProjects, shootsThisWeek, gearOut, dueThisWeek });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
