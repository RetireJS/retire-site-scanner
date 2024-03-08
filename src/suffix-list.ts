import https from "https";
import URL from "url";

async function getList(): Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    https
      .get(
        "https://publicsuffix.org/list/public_suffix_list.dat",
        (response) => {
          const data = [] as Array<Buffer>;
          response.on("data", (d) => data.push(d));
          response.on("end", () => {
            const all = Buffer.concat(data).toString();
            resolve(
              all
                .split("\n")
                .filter((n) => n.trim() != "")
                .filter((n) => !n.includes("//"))
                .sort((a, b) => b.length - a.length),
            );
          });
          response.on("error", (e) => reject(e));
        },
      )
      .on("error", (e) => reject(e));
  });
}

let data = [] as Array<string>;

async function getDomain(url: string, baseDomain: string): Promise<string> {
  if (data.length == 0) data = await getList();
  const u = URL.parse(url);
  const domain = u.hostname || baseDomain;
  for (const d of data) {
    if (d.startsWith("*.") && domain.endsWith(d.replace("*", ""))) {
      return domain.split(".").slice(-3).join(".");
    }
    if (domain.endsWith(d)) {
      const parts = d.split(".").length;
      return domain
        .split(".")
        .slice(-parts - 1)
        .join(".");
    }
  }
  throw new Error("Failed to find URL i TLD list: " + url);
}

export default getDomain;
