const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PROJECTS_DB = '355b41f95ed680c7a1e2ec00430dd822';
const GEAR_DB     = '355b41f95ed6803dbc74c508d213683b';

// Map URL key -> Notion user ID
// Add Mike, Josh, Dominic IDs once they join Notion
const PERSON_MAP = {
  daniel:  { name: 'daniel saline',    notionId: '47e8ca8f-9729-4208-a6a9-484564e9b077' },
  kyle:    { name: 'kyle moeller',     notionId: '359d872b-594c-81f3-b868-000231611f31' },
  gavin:   { name: 'gavin izzard',     notionId: '229d872b-594c-812d-9b82-00021bbcf61c' },
  joel:    { name: 'joel schneider',   notionId: '37247952-f736-473b-adc9-44436d660369' },
  josh:    { name: 'josh schneider',   notionId: null },
  mike:    { name: 'mike walsh',       notionId: null },
  dominic: { name: 'dominic shelden',  notionId: null },
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

// Match by Notion user ID if available, fall back to name match
function assignedTo(page, person) {
  const people = page.properties['Assigned to']?.people || [];
  if (person.notionId) {
    return people.some(p => p.id === person.notionId);
  }
  // Fallback: name match for users not yet in Notion
  const firstName = person.name.split(' ')[0];
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
  const person = PERSON_MAP[personKey];
  if (!person) {
    return res.status(400).json({
      error: `Unknown person: "${personKey}". Valid: ${Object.keys(PERSON_MAP).join(', ')}`
    });
  }

  const firstName = person.name.split(' ')[0];

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const dueEnd = new Date(today);
    dueEnd.setDate(today.getDate() + 7);
    dueEnd.setHours(23, 59, 59, 999);

    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr   = weekEnd.toISOString().split('T')[0];
    const todayStr     = today.toISOString().split('T')[0];
    const dueEndStr    = dueEnd.toISOString().split('T')[0];

    const activeStatuses = ['In Progress', 'To Do', 'Review'];

    // FIX: Status is a `status` type in Notion, not `select`
    const statusFilter = {
      or: activeStatuses.map(s => ({ property: 'Status', status: { equals: s } }))
    };

    const [allActive, allShoots, allGear, allDue] = await Promise.all([
      queryNotion(PROJECTS_DB, statusFilter),
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
          statusFilter,
          { property: 'Due Date', date: { on_or_after: todayStr } },
          { property: 'Due Date', date: { on_or_before: dueEndStr } },
        ]
      }),
    ]);

    const activeProjects = allActive.filter(p => assignedTo(p, person)).length;
    const shootsThisWeek = allShoots.filter(p => assignedTo(p, person)).length;
    const gearOut        = allGear.filter(p => gearAssignedTo(p, firstName)).length;
    const dueThisWeek    = allDue.filter(p => assignedTo(p, person)).length;

    return res.status(200).json({ activeProjects, shootsThisWeek, gearOut, dueThisWeek });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
