export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const INVOICES_DB = '2e1f4206910f41b3a4c0deb2ede4a451';

  try {
    const iRes = await fetch(`https://api.notion.com/v1/databases/${INVOICES_DB}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 100 })
    });

    const iData = await iRes.json();
    const invoices = iData.results || [];

    const totals = {
      pending: { sum: 0, count: 0 },
      sent:    { sum: 0, count: 0 },
      paid:    { sum: 0, count: 0 }
    };

    for (const page of invoices) {
      const status = (page.properties?.Status?.select?.name || '').toLowerCase();
      const amount = page.properties?.Amount?.number || 0;
      if (totals[status] !== undefined) {
        totals[status].sum   += amount;
        totals[status].count += 1;
      }
    }

    res.status(200).json(totals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
