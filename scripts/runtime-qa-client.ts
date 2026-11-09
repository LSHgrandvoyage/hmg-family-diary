import { readFile } from "node:fs/promises";
import { request } from "node:https";
export const qa = JSON.parse(await readFile(".tools/runtime/qa.json", "utf8"));
const ca = await readFile(".tools/runtime/local-ca.crt");
export async function qaRequest(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const data =
    body === undefined
      ? undefined
      : Buffer.isBuffer(body)
        ? body
        : Buffer.from(JSON.stringify(body));
  return await new Promise<any>((resolve, reject) => {
    const r = request(
      new URL(path, qa.origin),
      {
        method,
        ca,
        headers: {
          origin: qa.origin,
          cookie: qa.cookie,
          "content-type": "application/json",
          ...headers,
          ...(data ? { "content-length": String(data.length) } : {}),
        },
      },
      (res) => {
        const parts: Buffer[] = [];
        res.on("data", (b) => parts.push(b));
        res.on("end", () => {
          const result = Buffer.concat(parts);
          if (res.statusCode! >= 400)
            return reject(Error(`QA request failed: ${res.statusCode}`));
          resolve(result.length ? JSON.parse(result.toString()) : null);
        });
      },
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}
