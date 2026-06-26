// /api/digest-data.js
//
// Server-side filtered Notion query for the weekly digest.
//
// WHY THIS EXISTS:
// The Notion connector available in Claude chat only exposes the "AI tool"
// query endpoints (SQL query / database view query), which are gated behind
// Notion Business/Enterprise. The plain REST API query endpoint your Apps
// Script already uses (POST /v1/databases/{id}/query) has NO such gate — it
// works fine on Plus. This endpoint does that same kind of query, server-side,
// and hands back pre-filtered, pre-parsed JSON. That turns the digest from
// ~20+ search-and-fetch calls into a single request.
//
// USAGE: GET /api/digest-data
// Returns: { projects: [...], gear: [...], generatedAt: "..." }
//
// projects = every page in Projects with Status in [To Do, In Progress, Review]
// gear     = every page in Gear with Status = Checked Out
//
// No date-range filtering happens here on purpose — "this week" changes
// every time the digest runs, so that logic stays on the Claude side. This
// endpoint's job is just: give me everything currently active, fast.

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = '2022-06-28'; // stable version, matches the classic
                                      // single-database query endpoint your
                                      // Apps Script already relies on

const PROJECTS_DB_ID = '355b41f9-5ed6-80c7-a1e2-ec00430dd822';
const GEAR_DB_ID = '355b41f9-5ed6-803d-bc74-c508d213683b';

// Fallback name lookup in case the Notion API doesn't return a `name` on a
// person object (can happen depending on integration capabilities).
const KNOWN_USERS = {
  '47e8ca8f-9729-4208-a6a9-484564e9b077': 'Daniel',
  '229d872b-594c-812d-9b82-00021bbcf61c': 'Gavin',
  '37247952-f736-473b-adc9-44436d660369': 'Joel',
  '359d872b-594c-81f3-b868-000231611f31': 'Kyle',
  '35ad872b-594c-819f-b35b-000277c0388c': 'Josh'
};

async function queryNotion(databaseId, filter) {
  const results = [];
  let cursor;

  do {
    const body = { page_size: 100, ...(filter ? { filter } : {}) };
    if (cursor) body.start_cursor = cursor;

    const resp = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Notion query failed for ${databaseId} (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    results.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);

  return results;
}

function titleText(page, prop) {
  const p = page.properties[prop];
  return p && p.title ? p.title.map((t) => t.plain_text).join('') : '';
}

function richText(page, prop) {
  const p = page.properties[prop];
  return p && p.rich_text ? p.rich_text.map((t) => t.plain_text).join('') : '';
}

function statusName(page, prop) {
  const p = page.properties[prop];
  return p && p.status ? p.status.name : null;
}

function selectName(page, prop) {
  const p = page.properties[prop];
  return p && p.select ? p.select.name : null;
}

function multiSelectNames(page, prop) {
  const p = page.properties[prop];
  return p && p.multi_select ? p.multi_select.map((o) => o.name) : [];
}

function peopleNames(page, prop) {
  const p = page.properties[prop];
  if (!p || !p.people) return [];
  return p.people.map((person) => person.name || KNOWN_USERS[person.id] || person.id);
}

function dateStart(page, prop) {
  const p = page.properties[prop];
  return p && p.date ? p.date.start : null;
}

function checkboxValue(page, prop) {
  const p = page.properties[prop];
  return p ? !!p.checkbox : false;
}

function relationIds(page, prop) {
  const p = page.properties[prop];
  return p && p.relation ? p.relation.map((r) => r.id) : [];
}

module.exports = async function handler(req, res) {
  // NOTE: if counts.js uses `export default` instead of `module.exports`,
  // change this line to match — Vercel needs one consistent module style
  // across the api/ folder depending on how package.json is configured.

  if (!NOTION_TOKEN) {
    res.status(500).json({ error: 'NOTION_TOKEN env var is not set on this Vercel project.' });
    return;
  }

  try {
    const [projectPages, gearPages] = await Promise.all([
      queryNotion(PROJECTS_DB_ID, {
        or: [
          { property: 'Status', status: { equals: 'To Do' } },
          { property: 'Status', status: { equals: 'In Progress' } },
          { property: 'Status', status: { equals: 'Review' } }
        ]
      }),
      queryNotion(GEAR_DB_ID, {
        property: 'Status',
        select: { equals: 'Checked Out' }
      })
    ]);

    const projects = projectPages.map((page) => ({
      id: page.id,
      url: page.url,
      name: titleText(page, 'Project Name'),
      status: statusName(page, 'Status'),
      type: multiSelectNames(page, 'Type'),
      assignedTo: peopleNames(page, 'Assigned to'),
      shootDate: dateStart(page, 'Shoot Date'),
      dueDate: dateStart(page, 'Due Date'),
      doneDate: dateStart(page, 'Done Date'),
      hasShoot: checkboxValue(page, 'Has Shoot'),
      lastStatusChange: richText(page, 'Last Status Change')
    }));

    const gear = gearPages.map((page) => ({
      id: page.id,
      url: page.url,
      name: titleText(page, 'Item Name'),
      category: selectName(page, 'Category'),
      person: peopleNames(page, 'Person'),
      serialOrNotes: richText(page, 'Serial / Notes'),
      projectIds: relationIds(page, 'Projects')
    }));

    res.status(200).json({
      projects,
      gear,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
