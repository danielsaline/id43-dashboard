const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PROJECTS_DB = '355b41f95ed680c7a1e2ec00430dd822';
const GEAR_DB = '355b41f95ed6803dbc74c508d213683b';

const PERSON_MAP = {
  daniel:  'Daniel Saline',
  kyle:    'Kyle Moeller',
  gavin:   'Gavin Izzard',
  joel:    'Joel Schneider',
  josh:    'Josh',
  mike:    'Mike Walsh',
  dominic: 'Dominic Shelden',
};

async function queryNotion(databaseId, filter) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filter, page_size: 100 }),
  });
  if (!res.ok) throw new Error(`Notion error: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const personKey = (req.query.person || '').toLowerCase();
  const personName = PERSON_MAP[personKey];

  if (!personName) {
    return res.status(400).json({ error: `Unknown person: "${personKey}". Valid options: ${Object.keys(PERSON_MAP).join(', ')}` });
  }

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // End of this week (Sunday)
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

    // End of next 7 days for due this week
    const weekOut = new Date(today);
    weekOut.setDate(today.getDate() + 7);
    const weekOutStr = weekOut.toISOString().split('T')[0];

    const personFilter = { property: 'Assigned to', people: { contains: personName } };
    const activeStatusFilter = {
      or: [
        { property: 'Status', select: { equals: 'In Progress' } },
        { property: 'Status', select: { equals: 'To Do' } },
        { property: 'Status', select: { equals: 'Review' } },
      ],
    };

    // Active Projects assigned to this person
    const activeProjects = await queryNotion(PROJECTS_DB, {
      and: [personFilter, activeStatusFilter],
    });

    // Shoots this week assigned to this person
    const shootsThisWeek = await queryNotion(PROJECTS_DB, {
      and: [
        personFilter,
        { property: 'Has Shoot', checkbox: { equals: true } },
        { property: 'Shoot Date', date: { on_or_after: todayStr } },
        { property: 'Shoot Date', date: { on_or_before: endOfWeekStr } },
      ],
    });

    // Gear out checked out by this person
    const gearOut = await queryNotion(GEAR_DB, {
      and: [
        { property: 'Status', select: { equals: 'Checked Out' } },
        { property: 'Person', rich_text: { contains: personName.split(' ')[0] } },
      ],
    });

    // Due this week assigned to this person
    const dueThisWeek = await queryNotion(PROJECTS_DB, {
      and: [
        personFilter,
        activeStatusFilter,
        { property: 'Due Date', date: { on_or_after: todayStr } },
        { property: 'Due Date', date: { on_or_before: weekOutStr } },
      ],
    });

    return res.status(200).json({
      activeProjects: activeProjects.length,
      shootsThisWeek: shootsThisWeek.length,
      gearOut: gearOut.length,
      dueThisWeek: dueThisWeek.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
