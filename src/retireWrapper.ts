const loadrepository = require("retire/lib/repo").loadrepository;
import retire from "retire/lib/retire";
import { deepScan } from "retire/lib/deepscan";
import { type Repository, type Component } from "retire/lib/types";
import crypto from "crypto";
import log from "./log";
import { unique } from "./utils";
import path from "path";
import os from "os";
import * as https from "https";

const cachedir = path.resolve(os.tmpdir(), ".retire-cache/");
const retireOptions = { log, cachedir };

const hasher = {
  sha1: function (data: string) {
    const shasum = crypto.createHash("sha1");
    shasum.update(data);
    return shasum.digest("hex");
  },
};



type CombinedRepository = { 
  advisories: Repository, 
  backdoored: Record<string, Array<{
    summary: string,
    severity: string,
    extractors: string[],
    info: string[]
  }>>
};

async function loadRetireJSRepo() : Promise<CombinedRepository>{
  return new Promise((resolve,reject) => {
    https.get("https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository-v3.json", (res) => {
      let data = [] as Buffer[];
      res.on("data", (d) => data.push(d));
      res.on("end", () => {
        const repoData = Buffer.concat(data).toString();
        const versioned = retire.replaceVersion(repoData);
        const repo = JSON.parse(versioned);
        resolve(repo);
      });
      res.on("error", (err) => reject(err));
    });
  });
}



function scanUrlBackdoored(repo: CombinedRepository, url: string) : Array<Component> {
  log.trace("Scanning URL for backdoors:", url);
  const backdoorData = repo.backdoored;
  const matches = Object.entries(backdoorData).filter(([title, advisories]) => {
    return advisories.some((advisory) => {
      return advisory.extractors.some((e) => {
        return new RegExp(e).test(url);
      });
    });
  });
  const remapped = matches.map(([title, advisories]) => {
    return {
      component: title,
      version: "0",
      detection: "url",
      vulnerabilities: advisories.map((a) => {
        return {
          ...a,
          identifiers: {
            summary: a.summary,
          },
          cwe: ["CWE-506"],
          below: "999.999.999",
          severity: "critical" as const,
        };
      }),
    };
  });
  return convertResults(remapped, "scanning the URL");
}


function scanUri(repo: CombinedRepository, uri: string): Array<Component> {
  const uriResults = retire.scanUri(uri, repo.advisories);
  const fileName = uri.split("/").slice(-1)[0].split("?")[0];
  const fileNameResults = retire.scanFileName(fileName, repo.advisories);
  return convertResults(uriResults.concat(fileNameResults), "scanning the URL");
}

function scanContent(repo: Repository, contents: string): Array<Component> {
  const contentResults = retire.scanFileContent(contents, repo, hasher);
  const deepScanResults = deepScan(contents, repo);
  const combined = contentResults.concat(deepScanResults);
  return convertResults(combined || [], "scanning content");
}

function convertResults(
  data: Component[],
  detectedBy: string,
): Array<Component> {
  const res = data.reduce((acc, c) => {
    if (
      !acc.some((a) => a.component === c.component && a.version === c.version)
    ) {
      c.detection = c.detection ?? detectedBy;
      acc.push(c);
    }
    return acc;
  }, [] as Component[]);
  return res;
}

function getFuncs(repo: Repository): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(repo)
      .map(([k, des]) => [k, des.extractors.func])
      .filter(([, funcs]) => funcs && funcs.length > 0),
  );
}

function check(
  repo: Repository,
  version: string,
  component: string,
): Array<Component> {
  const results = retire.check(component, version, repo);
  return convertResults(results, "querying the JavaScript on the page");
}

async function runFuncs(
  repo: Repository,
  evaluate: Evaluator,
): Promise<Array<Component>> {
  const funcs = getFuncs(repo);
  const libs: [string, string][] = [];
  for (const [k, fs] of Object.entries(funcs)) {
    for (const f of fs) {
      const out = await evaluate(
        `(function() { try{ return ${f} } catch(err) { return undefined } })()`,
      );
      if (out) {
        libs.push([k, out]);
      }
    }
  }
  if (libs.length > 0) {
    log.debug(
      "JavaScript libraries detected on page: " +
        unique(libs.map(([c, v]) => `${c}@${v}`)).join(", "),
    );
  }
  return libs
    .map(([component, version]) => check(repo, version, component))
    .reduce((a, b) => a.concat(b), []);
}

type Evaluator = (code: string) => Promise<string | undefined>;

export type Scanner = {
  scanUri: (uri: string) => Array<Component>;
  scanContent: (contents: string) => Array<Component>;
  runFuncs: (evaluate: Evaluator) => Promise<Array<Component>>;
  scanUrlBackdoored: (url: string) => Array<Component>;
};

const scanner = () =>
  loadRetireJSRepo().then(
    (repo) =>
      ({
        scanUri: (uri: string) => scanUri(repo, uri),
        scanContent: (contents: string) => scanContent(repo.advisories, contents),
        runFuncs: (evaluate: Evaluator) => runFuncs(repo.advisories, evaluate),
        scanUrlBackdoored: (url: string) => scanUrlBackdoored(repo, url),
      }) as Scanner,
  );

export default scanner;
