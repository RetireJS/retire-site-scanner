type LogLevel = "DBG" | "INF" | "ERR" | "WRN" | "TRC";
import crypto, { randomUUID } from "crypto";
import { Component } from "retire/lib/types";
import { generatePURL } from "retire/lib/reporters/utils";
import { unique } from "./utils";
const pjson = require("../package.json");

const logId = crypto.randomUUID().split("-").slice(-1)[0];
let color = false;

function logMsg(logger: () => void, level: LogLevel, ...args: Array<unknown>) {
  if (level == "WRN" && color) {
    process.stdout.write("\x1b[31m");
  }
  // @ts-ignore
  logger(new Date().toISOString(), logId, level, ...args);
  if (level == "WRN" && color) {
    process.stdout.write("\x1b[0m");
  }
}
let level = "INF";

export type Services = Record<
  string,
  Array<{
    url: string;
    inboundContentType: string;
    outboundContentType?: string;
  }>
>;

type Logger = {
  open: (url: string) => void;
  enableColor: () => void;
  trace: (...args: Array<unknown>) => void;
  debug: (...args: Array<unknown>) => void;
  info: (...args: Array<unknown>) => void;
  warn: (...args: Array<unknown>) => void;
  logResults: (
    url: string,
    initiator: string | undefined,
    results: Array<Component>,
  ) => void;
  logServices: (services: Services) => void;
  setLevel: (l: LogLevel) => void;
  traceEnabled: () => boolean;
  close: () => void;
};
const traceEnabled = () => {
  return level == "TRC";
};
const setLevel = (l: LogLevel) => (level = l);

const collectedResults: {
  url?: string;
  components: Array<{
    url: string;
    initiator?: string;
    results: Array<Component>;
  }>;
  services: Services;
} = {
  url: undefined,
  components: [],
  services: {},
};

const started = new Date().toISOString();

type CycloneDXComponent = {
  type: string;
  name: string;
  version: string;
  "bom-ref": string;
  group?: string;
  purl?: string;
  licenses?: Array<{
    license?: {
      name: string;
    };
    expression?: string;
  }>;
  properties: Array<{
    name: string;
    value: string;
  }>;
};
type CycloneDXVulnerability = {
  "bom-ref"?: string;
  id: string;
  references?: Array<{
    id: string;
    source: {
      url: string;
    };
  }>;
  ratings: Array<{
    severity: string;
  }>;
  cwes: Array<number>;
  description?: string;
  advisories?: Array<{
    url: string;
  }>;
  affects: Array<{
    ref: string;
    versions: Array<
      | {
          version: string;
          range?: string;
          status?: "affected" | "unaffected" | "unknown";
        }
      | {
          version?: string;
          range: string;
          status?: "affected" | "unaffected" | "unknown";
        }
    >;
  }>;
};

export type CycloneDXService = {
  name: string;
  services?: Array<CycloneDXService>;
  description?: string;
  endpoints?: Array<string>;
};

export function simplifyServiceEndpoint(url: string): string {
  const u = url.split("/");
  const a = u
    .slice(3)
    .join("/")
    .replace(/;[^/]+/, "") //Drop query parameters or path parameters starting with ;
    .replace(/\/[^/]+$/, "/") //Drop file names
    .replace(/\/[0-9]+\/.*/, "/") // Stop at numeric paths
    .replace(/(v[0-9]+(\.[0-9]+)?\/).*/, "$1") // Stop at version like /v1/ or /v3.2/
    .replace(
      /\/[^/]*[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}[^/]*\/.*/, //Stop at UUID paths
      "/",
    );
  return u.slice(0, 3).join("/") + "/" + a;
}

function filterDuplicates(u: Array<string>): Array<string> {
  return unique(u.filter((x) => !u.some((v) => v != x && x.startsWith(v))));
}

const contentTypeMapping = {
  javascript: /^[^/]+\/(x-)?javascript.*/,
  images: /^image\/.*/,
  videos: /^video\/.*/,
  fonts: /^font\/.*/,
  "data (json)": /^application\/json.*/,
  "data (xml)": /^(application|text)\/xml.*/,
  HTML: /^text\/html.*/,
  text: /^text\/plain.*/,
  "binary data": /application\/octet-stream.*/,
  stylesheets: /text\/css.*/,
};

function convertContentType(contentType: string): string {
  if (contentType == "") return "";
  for (const [name, re] of Object.entries(contentTypeMapping)) {
    if (re.test(contentType)) return name;
  }
  return "[" + contentType + "]";
}

function formatContentTypes(
  data: { inboundContentType: string; outboundContentType?: string }[],
): string {
  const inbound = unique(
    data
      .map((x) => x.inboundContentType)
      .map((x) => convertContentType(x.split(";")[0]))
      .filter((x) => x != ""),
  );
  const outbound = unique(
    data
      .map((x) => x.outboundContentType)
      .filter((x): x is string => x != undefined && x != "")
      .map((x) => convertContentType(x.split(";")[0])),
  );
  return [
    inbound.length > 0 ? "Inbound: " + inbound.join(", ") + "." : "",
    outbound.length > 0 ? "Outbound: " + outbound.join(", ") + "." : "",
  ]
    .filter((x) => x != "")
    .join(" ");
}

export function convertToCycloneDX(resultToConvert: typeof collectedResults) {
  const components = new Map<string, CycloneDXComponent>();
  const vulnerabilities: Array<CycloneDXVulnerability> = [];
  const bomRef = randomUUID();
  const services: Array<CycloneDXService> = Object.entries(
    resultToConvert.services,
  ).map(([k, s]) => {
    return {
      name: k,
      endpoints: filterDuplicates(
        s.map((u) => simplifyServiceEndpoint(u.url)),
      ).sort(),
      description: formatContentTypes(s),
    };
  });
  resultToConvert.components.forEach((res) => {
    res.results.forEach((c) => {
      const key = c.component + "@" + c.version;
      const found = components.has(key);
      const nameParts = c.component.split("/").reverse();
      const comp: CycloneDXComponent = components.get(key) || {
        type: "library",
        "bom-ref": randomUUID(),
        name: nameParts[0],
        group: nameParts[1],
        version: c.version,
        purl: generatePURL(c),
        properties: [],
        licenses: mapLicenses(c.licenses),
      };
      components.set(key, comp);
      if (!comp.properties.some((c) => c.value == res.url))
        comp.properties.push({ name: "foundIn", value: res.url });
      if (
        res.initiator &&
        !comp.properties.some((c) => c.value == res.initiator)
      )
        comp.properties.push({ name: "initiator", value: res.initiator });
      if (!found) {
        (c.vulnerabilities ?? []).forEach((v) => {
          const ids = ([] as Array<string | undefined>)
            .concat(v.identifiers?.CVE || [])
            .concat([
              v.identifiers?.githubID,
              v.identifiers?.bug ? `bug-${v.identifiers.bug}` : undefined,
              v.identifiers?.issue
                ? `GH-issue-${v.identifiers.issue}`
                : undefined,
              "retid" in v.identifiers
                ? `retirejs-${v.identifiers.retid}`
                : undefined,
            ])
            .filter((s) => s != undefined) as Array<string>;
          const id = ids[0] || "missing id";
          const otherRefs = ids
            .filter((x) => x.startsWith("CVE-"))
            .map((i) => ({
              id: i,
              source: { url: `https://nvd.nist.gov/vuln/detail/${i}` },
            }));
          vulnerabilities.push({
            "bom-ref": randomUUID(),
            advisories: v.info.map((u) => ({ url: u })),
            id: id,
            ratings: [{ severity: v.severity }],
            description: v.identifiers.summary,
            references: otherRefs.length > 0 ? otherRefs : undefined,
            cwes: v.cwe?.map((c) => parseInt(c.split("-")[1], 10)),
            affects: [
              {
                ref: comp["bom-ref"],
                versions: [{ version: c.version }],
              },
            ],
          });
        });
      }
    });
  });
  return {
    $schema: "http://cyclonedx.org/schema/bom-1.4.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.4",
    serialNumber: "urn:uuid:" + randomUUID(),
    version: 1,
    metadata: {
      timestamp: started,
      tools: [{ name: pjson.name, version: pjson.version }],
      component: {
        type: "application",
        name: resultToConvert.url,
        version: `${Date.now()}`,
        "bom-ref": bomRef,
      },
    },
    components: Array.from(components.values()),
    dependencies: [
      {
        ref: bomRef,
        dependsOn: Array.from(components.values()).map((c) => c["bom-ref"]),
      },
    ],
    compositions: [
      {
        aggregate: "unknown",
        assemblies: [bomRef],
      },
    ],
    services: services,
    vulnerabilities: Array.from(vulnerabilities.values()),
  };
}

function mapLicenses(licenses: string[] | undefined) {
  if (!licenses) return [];
  if (licenses.length == 0) return [];
  if (licenses[0] == "commercial") return [{ license: { name: "Commercial" } }];
  return [{ expression: licenses[0] }];
}

export const jsonLogger: Logger = {
  open: (url: string) => {
    collectedResults.url = url;
  },
  enableColor: () => {},
  trace: (...args: Array<unknown>) => {
    if (level == "TRC") logMsg(console.warn, "TRC", ...args);
  },
  debug: (...args: Array<unknown>) => {
    if (level == "DBG" || level == "TRC") logMsg(console.warn, "DBG", ...args);
  },
  info: (...args: Array<unknown>) => logMsg(console.warn, "INF", ...args),
  warn: (...args: Array<unknown>) => logMsg(console.warn, "WRN", ...args),
  setLevel,
  traceEnabled,
  close: () => {
    console.log(
      JSON.stringify(convertToCycloneDX(collectedResults), undefined, 2),
    );
  },
  logResults: (
    url: string,
    initiator: string | undefined,
    results: Array<Component>,
  ) => {
    collectedResults.components.push({ url, initiator, results });
  },
  logServices: (services: Services) => {
    collectedResults.services = { ...collectedResults.services, ...services };
  },
};

export const consoleLogger: Logger = {
  open: () => {
    return;
  },
  enableColor: () => {
    color = true;
  },
  trace: (...args: Array<unknown>) => {
    if (level == "TRC") logMsg(console.log, "TRC", ...args);
  },
  debug: (...args: Array<unknown>) => {
    if (level == "DBG" || level == "TRC") logMsg(console.log, "DBG", ...args);
  },
  info: (...args: Array<unknown>) => logMsg(console.log, "INF", ...args),
  warn: (...args: Array<unknown>) => logMsg(console.warn, "WRN", ...args),
  setLevel,
  traceEnabled,
  close: () => {
    return;
  },
  logResults: (
    url: string,
    initiator: string | undefined,
    results: Array<Component>,
  ) => {
    const vulnerableLibs = results.filter(
      (lib) => (lib.vulnerabilities ?? []).length > 0,
    );
    if (vulnerableLibs.length > 0) {
      const backdoorVulns = vulnerableLibs.filter((x) =>
        x.vulnerabilities?.some((v) => v.cwe?.includes("CWE-506")),
      );
      const otherVulns = vulnerableLibs.filter((x) =>
        x.vulnerabilities?.some((v) => !v.cwe?.every((s) => s == "CWE-506")),
      );

      if (backdoorVulns.length > 0) {
        logMsg(
          console.warn,
          "WRN",
          `Possibly backdoored libraries found in ${url} loaded by ${
            initiator ?? "page"
          }`,
        );
      }

      if (otherVulns.length > 0) {
        logMsg(
          console.warn,
          "WRN",
          `Libraries with known vulnerabilities found in ${url} loaded by ${
            initiator ?? "page"
          }:`,
        );
        vulnerableLibs.forEach((l) => {
          logMsg(console.warn, "WRN", ` * ${l.component}@${l.version}`);
        });
      }
    }
    const otherLibs = results.filter(
      (lib) => (lib.vulnerabilities ?? []).length == 0,
    );
    if (otherLibs.length > 0) {
      logMsg(
        console.warn,
        "INF",
        `Other libraries found in ${url} loaded by ${initiator ?? "page"}:`,
      );
      otherLibs.forEach((l) => {
        logMsg(console.warn, "INF", ` * ${l.component}@${l.version}`);
      });
    }
  },
  logServices: (services: Services) => {
    if (level == "TRC" || level == "DBG") {
      Object.entries(services).forEach(([k, s]) => {
        logMsg(
          console.log,
          "DBG",
          k +
            "\n" +
            s
              .map(
                (n) =>
                  " * " +
                  n.url +
                  " " +
                  n.inboundContentType +
                  " " +
                  n.outboundContentType,
              )
              .join(",\n"),
        );
      });
    }
  },
};

const wrapper = {
  log: consoleLogger,
};

export function useJson() {
  wrapper.log = jsonLogger;
}

export default new Proxy(consoleLogger, {
  get: (_: Logger, name: keyof Logger) => {
    return wrapper.log[name];
  },
});
