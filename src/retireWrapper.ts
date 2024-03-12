const loadrepository = require("retire/lib/repo").loadrepository;
import retire from "retire/lib/retire";
import { deepScan } from "retire/lib/deepscan";
import { type Repository, type Component } from "retire/lib/types";
import crypto from "crypto";
import log from "./log";
import { unique } from "./utils";
import path from "path";
import os from "os";

const cachedir = path.resolve(os.tmpdir(), ".retire-cache/");
const retireOptions = { log, cachedir };

const hasher = {
  sha1: function (data: string) {
    const shasum = crypto.createHash("sha1");
    shasum.update(data);
    return shasum.digest("hex");
  },
};

async function loadRetireJSRepo() {
  return await loadrepository(
    "https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository-v2.json",
    retireOptions,
  );
}

function scanUri(repo: Repository, uri: string): Array<Component> {
  const uriResults = retire.scanUri(uri, repo);
  return convertResults(uriResults || [], "scanning the URL");
}

function scanContent(repo: Repository, contents: string): Array<Component> {
  const contentResults = retire.scanFileContent(contents, repo, hasher);
  const deepScanResults = deepScan(contents, repo);
  const combined = contentResults.concat(deepScanResults).reduce((acc, c) => {
    if (
      !acc.some((a) => a.component === c.component && a.version === c.version)
    ) {
      acc.push(c);
    }
    return acc;
  }, [] as Component[]);

  return convertResults(combined || [], "scanning content");
}

function convertResults(
  res: Component[],
  detectedBy: string,
): Array<Component> {
  res.forEach((r) => {
    r.detection = r.detection ?? detectedBy;
  });
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
};

const scanner = () =>
  loadRetireJSRepo().then(
    (repo) =>
      ({
        scanUri: (uri: string) => scanUri(repo, uri),
        scanContent: (contents: string) => scanContent(repo, contents),
        runFuncs: (evaluate: Evaluator) => runFuncs(repo, evaluate),
      }) as Scanner,
  );

export default scanner;
