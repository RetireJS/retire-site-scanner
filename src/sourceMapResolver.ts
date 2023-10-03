import request from "./request";
import log from "./log";
import { SourceMapConsumer } from "source-map";

const re = new RegExp("//# sourceMappingURL=([a-zA-Z/.0-9\\-_]+)", "g");

export async function tryToGetSourceMap(
  uri: string,
  content: string
): Promise<Array<string>> {
  const requests = {} as Record<string, boolean>;
  let inter;
  if (log.traceEnabled()) {
    inter = setInterval(() => {
      log.trace(
        "Sourcemap request for " + uri + ":",
        Object.entries(requests)
          .filter(([, e]) => e)
          .map(([u]) => u)
      );
    }, 2000);
  }
  try {
    let sourceMapUrls = [".map", ".js.map"].map((s) => {
      if (uri.includes("?")) {
        const a = uri.split("?");
        a[0] = a[0] + s;
        return a.join("?");
      }
      return uri + s;
    });
    if (content.includes("//# sourceMappingURL=")) {
      const m = content.matchAll(re);
      const u = uri.split("/");
      u.pop();
      const p = u.join("/");
      sourceMapUrls = Array.from(
        new Set(Array.from(m).map((x) => p + "/" + x[1]))
      );
    }
    const sources = [];
    for (const u of sourceMapUrls) {
      log.trace(`Trying source map URL: ${u}`);
      requests[u] = true;
      const res = await request(u);
      requests[u] = false;
      if (
        res.statusCode == 200 &&
        !(res.contentType || "").startsWith("text/html")
      ) {
        log.debug(
          `Found source map at URL: ${u} ${res.statusCode} ${res.contentType}`
        );
        sources.push(res.content);
      }
    }
    if (inter) clearTimeout(inter);
    return await unwrapSourceMaps(sources);
  } catch (err) {
    log.warn("Failed to handle source maps for " + uri, err);
    if (inter) clearTimeout(inter);
    return [];
  }
}

async function unwrapSourceMaps(maps: string[]): Promise<Array<string>> {
  const all = [] as Array<string>;
  for (const m of maps) {
    try {
      const content = await SourceMapConsumer.with(m, null, (consumer) => {
        const sources = consumer.sources;
        const content = sources.map((source) => {
          return consumer.sourceContentFor(source);
        });
        return content;
      });
      content.forEach((x) => {
        if (x != null) all.push(x);
      });
    } catch (e) {
      log.debug("Failed to parse one of the source maps");
    }
  }

  return all;
}
