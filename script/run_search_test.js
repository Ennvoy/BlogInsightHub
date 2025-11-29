(async () => {
  try {
    const payload = {
      coreKeywords: ["台北 美食 推薦"],
      minWords: 0,
      maxTrafficRank: 5000000,
      excludeGovEdu: true,
      mustContainImages: true,
      requireEmail: false,
      avoidDuplicates: false,
      longTailKeywords: [],
    };

    const res = await fetch('http://127.0.0.1:5001/api/search/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // timeout not available in fetch by default; rely on server
    });

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Non-JSON response:');
      console.log(text);
    }
  } catch (e) {
    console.error('Request failed:', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
