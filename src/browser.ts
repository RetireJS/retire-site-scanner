import log from "./log";
import puppeteer, { Browser, Page, TimeoutError } from "puppeteer";
import request from "./request";
import getDomain from "./suffix-list";
import URL from "node:url";

export const UserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";

function isJavascriptContentType(contentType: string): boolean {
  if (contentType.includes("/javascript")) return true;
  if (contentType.includes("/x-javascript")) return true;
  return false;
}

type JavaScriptCallback = (
  url: string,
  content: string,
  initiator: string | undefined
) => Promise<void>;

type ServiceCallback = (
  domain: string,
  url: string,
  inboundContentType: string,
  outboundContentType?: string
) => Promise<void>;

async function loadPage(
  browser: Browser,
  url: string,
  onJavaScript: JavaScriptCallback,
  onPageLoaded: (page: Page) => Promise<void>,
  onServiceInvoked: ServiceCallback
) {
  const page = await browser.newPage();
  try {
    const javascripts: [string, string, string | undefined][] = [];
    const needsRetry: [string, Record<string, string>, string | undefined][] =
      [];
    const promises: Promise<void>[] = [];
    await page.setUserAgent(UserAgent);
    await page.setCacheEnabled(false);
    const urlDomain = await getDomain(url, url);

    page.on("response", async (response) => {
      const contentType = response.headers()["content-type"] ?? "";
      if (
        response.request().method() == "GET" &&
        isJavascriptContentType(contentType)
      ) {
        log.debug(`${response.status()} ${response.url()} ${contentType}`);
        const initiator =
          response.request().initiator()?.url ||
          response.request().headers()["referer"];
        try {
          const text = await response.text();
          javascripts.push([response.url(), text, initiator]);
        } catch (err) {
          log.warn(
            "Will retry failed to load body for " + response.url(),
            response.status()
          );
          let cookieHeader = {};
          try {
            const cookies = await page.cookies(response.url());
            cookieHeader = {
              cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
            };
          } catch (err) {
            log.warn("Failed to get cookies. Ignoring the cookies");
          }
          needsRetry.push([
            response.url(),
            {
              ...cookieHeader,
              referer: response.request().headers()["referer"] || url,
            },
            initiator,
          ]);
        }
      }
      if (response.url().startsWith("http")) {
        const domain = await getDomain(response.url(), url);
        if (domain != urlDomain) {
          const u = URL.parse(response.url());
          onServiceInvoked(
            domain,
            `${u.protocol}//${u.hostname}${u.pathname}`,
            contentType,
            response.request().headers()["content-type"]
          );
        }
      }
    });

    log.info(`Loading ${url}...`);
    await page.goto(url);
    log.info(`Page loaded`);

    await onPageLoaded(page);

    await Promise.all(
      needsRetry.map(async ([url, headers, initiator]) => {
        try {
          log.debug("Retrying " + url + " headers: " + JSON.stringify(headers));
          const response = await request(url, headers);
          javascripts.push([url, response.content, initiator]);
        } catch (err) {
          log.warn("Failed to download body for: ", url);
        }
      })
    );
    await page.close();
    log.info(`Page closed ` + promises.length);
    log.info("Javascripts found: " + javascripts.length);
    javascripts.forEach(([url, content, initiator]) => {
      promises.push(onJavaScript(url, content, initiator));
    });
    await Promise.all(promises);
    log.trace("Page promises resolved: " + promises.length);
  } catch (error) {
    log.warn("Page error", error);
    await page.close();
    throw error;
  }
}

const defaultArgs: string[] = [
  // "--disable-features=IsolateOrigins",
  //"--disable-site-isolation-trials",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--unlimited-storage",
];

async function load(
  url: string,
  chromiumArgs: Array<string>,
  onJavaScript: JavaScriptCallback,
  onPageLoaded: (page: Page) => Promise<void>,
  onServiceInvoked: ServiceCallback
) {
  log.info("Launching browser...");
  const browser = await puppeteer.launch({
    headless: "new",
    ignoreHTTPSErrors: true,
    args: [...defaultArgs, ...chromiumArgs],
  });
  let attempts = 0;
  while (attempts < 2) {
    try {
      attempts++;
      await loadPage(
        browser,
        url,
        onJavaScript,
        onPageLoaded,
        onServiceInvoked
      );
      break;
    } catch (error) {
      if (error instanceof TimeoutError) {
        log.info("Timeout for navigation. Retrying...");
      } else {
        log.warn("Failed", error);
        process.exit(1);
      }
    }
  }
  await browser.close();
  log.info("Browser closed.");
}

export default {
  load,
};
