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

// Check if any assigned user's name matches the target (case-insensitive)
function assignedTo(page, personName) {
  const people = page.properties['Assigned to']?.people || [];
  const firstName = personName.split(' ')[0];
  return people.some(p => {
    const full = (p.name || '').toLowerCase();
    return full.includes(firstName);
  });
}

// Check if gear Person field contains the first name
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
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

    const weekOutStr = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];

    const activeStatuses = ['In Progress', 'To Do', 'Review'];

    const [allActive, allShoots, allGear, allDue] = await Promise.all([
      // Active projects — filter by status only, then filter by person client-side
      queryNotion(PROJECTS_DB, {
        or: activeStatuses.map(s => ({ property: 'Status', select: { equals: s } }))
      }),

      // Shoots this week — filter by date + has shoot server-side
      queryNotion(PROJECTS_DB, {
        and: [
          { property: 'Has Shoot', checkbox: { equals: true } },
          { property: 'Shoot Date', date: { on_or_after: todayStr } },
          { property: 'Shoot Date', date: { on_or_before: endOfWeekStr } },
        ]
      }),

      // All checked-out gear
      queryNotion(GEAR_DB, {
        property: 'Status', select: { equals: 'Checked Out' }
      }),

      // Due this week — filter by date + status server-side
      queryNotion(PROJECTS_DB, {
        and: [
          { or: activeStatuses.map(s => ({ property: 'Status', select: { equals: s } })) },
          { property: 'Due Date', date: { on_or_after: todayStr } },
          { property: 'Due Date', date: { on_or_before: weekOutStr } },
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
