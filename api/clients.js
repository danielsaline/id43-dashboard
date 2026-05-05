export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const CLIENTS_DB = '355b41f95ed680569b5dea8512a7904b';
  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${CLIENTS_DB}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_size: 100, filter: { property: 'Active', checkbox: { equals: true } }, sorts: [{ property: 'Client Name', direction: 'ascending' }] })
    });
    const data = await response.json();
    const clients = (data.results || []).map(page => ({
      name: page.properties?.['Client Name']?.title?.[0]?.plain_text || '',
      id: page.id
    })).filter(c => c.name);
    res.status(200).json({ clients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
