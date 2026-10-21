import https from "node:https";

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body, headers: res.headers }),
        );
      })
      .on("error", reject);
  });
}

const hosts = [
  "https://industrial.forgepublicsafety.com",
  "https://producersrice.forgepublicsafety.com",
];

for (const host of hosts) {
  const page = await get(`${host}/admin/walkthrough-studio/`);
  const chunks = [
    ...page.body.matchAll(
      /_next\/static\/chunks\/app\/admin\/walkthrough-studio\/page-[^"']+\.js/g,
    ),
  ].map((m) => m[0]);
  console.log("\nHOST", host, "page", page.status, "chunks", chunks);
  for (const chunk of chunks.slice(0, 1)) {
    const js = await get(`${host}/${chunk}`);
    const hasCode =
      js.body.includes("forge-industrial-safety-complete-platform-overview");
    const usesItems0Id = /items\[0\]\.id/.test(js.body);
    const usesPrimaryCode = /\.code/.test(js.body) && /get\(/.test(js.body);
    console.log("js", js.status, "len", js.body.length, {
      hasCode,
      usesItems0Id,
      cache: js.headers["cache-control"],
      etag: js.headers.etag,
    });
    const idx = js.body.search(/walkthroughStudioApi|list\.items|primary/);
    console.log("snippet", js.body.slice(Math.max(0, idx), idx + 350));
  }
}
