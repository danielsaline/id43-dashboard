const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID = '2e1f4206-910f-41b3-a4c0-deb2ede4a451';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  try {
    const totals = { pending: { sum: 0, count: 0 }, sent: { sum: 0, count: 0 }, paid: { sum: 0, count: 0 } };
    let cursor;

    do {
      const resp = await notion.databases.query({
        database_id: DB_ID,
        start_cursor: cursor,
        page_size: 100
      });

      for (const page of resp.results) {
        const status = (page.properties.Status?.select?.name || '').toLowerCase();
        const amount = page.properties.Amount?.number || 0;
        if (totals[status] !== undefined) {
          totals[status].sum += amount;
          totals[status].count += 1;
        }
      }

      cursor = resp.has_more ? resp.next_cursor : undefined;
    } while (cursor);

    res.json(totals);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
