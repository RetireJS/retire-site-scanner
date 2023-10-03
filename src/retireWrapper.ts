const loadrepository = require("retire/lib/repo").loadrepository;
import { type Vulnerability } from "retire/lib/types";
const retire = require("retire/lib/retire");
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
    "https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository.json",
    retireOptions
  );
}

export type Component = {
  name: string;
  version: string;
  vulnerabilities: Array<Vulnerability>;
  detectedBy: string;
};

function scanUri(repo: unknown, uri: string): Array<Component> {
  const uriResults = retire.scanUri(uri, repo);
  return convertResults(uriResults || [], "scanning the URL");
}

function scanContent(repo: unknown, contents: string): Array<Component> {
  const contentResults = retire.scanFileContent(contents, repo, hasher);
  return convertResults(contentResults || [], "scanning content");
}

function convertResults(res: unknown, detectedBy: string): Array<Component> {
  // @ts-ignore
  return res.map((r) => {
    return {
      name: r.component,
      version: r.version,
      // @ts-ignore
      vulnerabilities: (r.vulnerabilities || []).map((v) => ({
        severity: v.severity || "unknown",
        identifiers: v.identifiers || {},
        info: v.info || [],
      })),
      detectedBy,
    };
  });
}

function getFuncs(repo: unknown): Record<string, string[]> {
  //@ts-ignore
  return Object.entries(repo)
    .map(([k, des]) => {
      //@ts-ignore
      return [k, des.extractors.func];
    })
    .filter(([, funcs]) => funcs && funcs.length > 0)
    .reduce((a, [k, funcs]) => {
      a[k] = funcs;
      return a;
    }, {} as Record<string, string[]>);
}

function check(
  repo: unknown,
  version: string,
  component: string
): Array<Component> {
  const results = retire.check(component, version, repo);
  return convertResults(results, "querying the JavaScript on the page");
}

async function runFuncs(
  repo: unknown,
  evaluate: Evaluator
): Promise<Array<Component>> {
  const funcs = getFuncs(repo);
  const libs: [string, string][] = [];
  for (const [k, fs] of Object.entries(funcs)) {
    for (const f of fs) {
      const out = await evaluate(
        `(function() { try{ return ${f} } catch(err) { return undefined } })()`
      );
      if (out) {
        libs.push([k, out]);
      }
    }
  }
  if (libs.length > 0) {
    log.debug(
      "JavaScript libraries detected on page: " +
        unique(libs.map(([c, v]) => `${c}@${v}`)).join(", ")
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
      } as Scanner)
  );

export default scanner;
