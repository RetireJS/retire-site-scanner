#!/usr/bin/env node

import browser from "./browser";

import log, { Services, useJson } from "./log";
import retire, { Scanner } from "./retireWrapper";
import { Component } from "retire/lib/types";
import { tryToGetSourceMap } from "./sourceMapResolver";
import { clearInterval } from "timers";
import { Page } from "puppeteer";
import request from "./request";

const stats = {
  urlCount: 0,
};

const uniqueLibraries = new Set<string>();
const vulnerableLibraries = new Set<string>();

function shouldSkipSourcemap(url: string): boolean {
  if (!url.startsWith("http")) return true;
  if (url.startsWith("https://www.googletagmanager.com/")) return true;
  return false;
}

async function checkURL(
  scanner: Scanner,
  url: string,
  content: string,
  initiator: string | undefined,
): Promise<void> {
  try {
    const sources = [content];
    if (!shouldSkipSourcemap(url)) {
      log.trace(`Downloading sourcemaps for ${url} ...`);
      const sourceMaps = await tryToGetSourceMap(url, content);
      sources.push(...sourceMaps);
      log.trace(`Done downloading sourcemaps for: ${url}`);
    }
    if (content.startsWith("/*! For license information please see")) {
      const licenseFileName = content.split(" */")[0].split(" ").slice(-1)[0];
      log.debug(
        `License information found in content. Loading ${licenseFileName}`,
      );
      const [path, params] = url.split("?");
      const licenseURL =
        path.split("/").slice(0, -1).join("/") +
        "/" +
        licenseFileName +
        (params ? "?" + params : "");
      const licenseSource = await request(licenseURL);
      if (licenseSource.statusCode === 200) {
        sources.push(licenseSource.content);
      }
    }

    const uriResults = scanner.scanUri(url);
    const contentResults = sources
      .map((c) => scanner.scanContent(url, c))
      .reduce((a, b) => a.concat(b), []);
    const mRes = new Map<string, Component>();
    uriResults
      .concat(contentResults)
      .forEach((c) => mRes.set(`${c.component}@${c.version}`, c));
    const results = Array.from(mRes.values());
    if (results.length > 0) {
      log.logResults(url, initiator, results);
    }
    results.forEach((r) => {
      const key = r.component + "@" + r.version;
      uniqueLibraries.add(key);
      if ((r.vulnerabilities ?? []).length > 0) vulnerableLibraries.add(key);
    });
    return;
  } catch (err) {
    console.warn(err);
    return new Promise((r) => r());
  }
}

const [, , urlToScan] = process.argv.filter((s) => !s.startsWith("-"));
if (!urlToScan) {
  console.warn("ERROR: No url given");
  process.exit(1);
}
const knownArgs = ["--sbom", "-v", "-vv", "--docker", "--color"];
const unknownArgs = process.argv
  .filter((x) => x.startsWith("-"))
  .filter((x) => !knownArgs.includes(x));
if (unknownArgs.length > 0) {
  unknownArgs.forEach((a) => console.warn("ERROR: Unkown argument " + a));
  process.exit(1);
}

if (process.argv.includes("--sbom")) useJson();
if (process.argv.includes("-v")) log.setLevel("DBG");
if (process.argv.includes("-vv")) log.setLevel("TRC");
if (process.argv.includes("--color")) log.enableColor();
log.open(urlToScan);

let chromiumArgs: Array<string> = [];
if (process.argv.includes("--docker"))
  chromiumArgs = ["--no-sandbox", "--disable-setuid-sandbox"];
log.trace("Log level TRACE enabled");

const tracer: NodeJS.Timer | null = null;

const services = {} as Services;
async function onService(
  domain: string,
  url: string,
  inboundContentType: string,
  outboundContentType?: string,
): Promise<void> {
  services[domain] = services[domain] || [];
  services[domain].push({ url, inboundContentType, outboundContentType });
}

retire().then((scanner) => {
  const onJavaScript = async (
    url: string,
    contents: string,
    initiator: string | undefined,
  ) => {
    stats.urlCount++;
    return checkURL(scanner, url, contents, initiator);
  };

  const onPageLoaded = async (page: Page) => {
    const results = await scanner.runFuncs(
      (code) => page.evaluate(code) as Promise<string | undefined>,
    );
    if (results.length > 0) {
      log.logResults(page.url(), undefined, results);
    }
    log.logServices(services);
    results.forEach((r) => {
      const key = r.component + "@" + r.version;
      uniqueLibraries.add(key);
      if ((r.vulnerabilities ?? []).length > 0) vulnerableLibraries.add(key);
    });
  };

  async function checkRequestTarget(url: string): Promise<void> {
    const results = scanner.scanUrlBackdoored(url);
    if (results.length > 0) {
      log.logResults(url, undefined, results);
    }
  }

  browser
    .load(
      urlToScan,
      chromiumArgs,
      onJavaScript,
      onPageLoaded,
      onService,
      checkRequestTarget,
    )
    .then(() => {
      log.info(
        `Stats: urls: ${stats.urlCount}, libraries: ${uniqueLibraries.size}, Libraries with known vulnerabilities: ${vulnerableLibraries.size}`,
      );
      if (log.traceEnabled() && tracer) {
        clearInterval(tracer);
      }
      log.close();
      process.exit(0);
    })
    .catch((err) => {
      log.warn("Something rotten happened", err);
      process.exit(1);
    });
});
