import https, { RequestOptions as HttpsRequestOptions } from "https";
import http2, {
  ClientHttp2Session,
  IncomingHttpHeaders,
  IncomingHttpStatusHeader,
} from "http2";
import URL from "url";
import http from "http";
import log from "./log";
import { UserAgent } from "./browser";

import("cacheable-lookup").then((m) => {
  const cacheable = new m.default();
  log.debug("Configuing globalAgent to used cached lookups");
  cacheable.install(https.globalAgent);
  cacheable.install(http.globalAgent);
  //cacheable.servers.push("1.1.1.1", "8.8.8.8");
});

https.globalAgent.options.keepAlive = true;

export default async function request(
  url: string,
  headers: Record<string, string> = {},
): Promise<{
  statusCode: number;
  content: string;
  contentType: string | undefined;
}> {
  try {
    return await _http2Request(url, headers);
  } catch (err) {
    log.warn("Request failed: " + url, err);
  }
  return sleep(200, () => _request(url, headers));
}

function sleep<T>(time: number, func: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      func()
        .then((r) => resolve(r))
        .catch((err) => reject(err));
    }, time);
  });
}

function _request(
  url: string,
  headers: Record<string, string> = {},
): Promise<{
  statusCode: number;
  content: string;
  contentType: string | undefined;
}> {
  const defaultOptions: HttpsRequestOptions = {
    method: "GET",
    headers: {
      "user-agent": UserAgent,
      "cache-control": "no-cache",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      accept: "*/*",
      ...headers,
    },
    rejectUnauthorized: false,
  };
  return new Promise((resolve, reject) => {
    try {
      if (url.startsWith("blob:")) {
        return resolve({
          statusCode: 404,
          content: "",
          contentType: undefined,
        });
      }
      log.trace("Requesting " + url + " ...");
      const req = (url.startsWith("http:") ? http : https)
        .request(url, defaultOptions, (res) => {
          log.trace("Got response for download " + url + " " + res.statusCode);
          const content: Array<Buffer> = [];
          res.on("error", (err) => {
            log.warn(err);
          });
          res.on("data", (d) => {
            content.push(d);
          });
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode || 404,
              content: Buffer.concat(content).toString(),
              contentType: res.headers["content-type"],
            });
          });
        })
        .on("close", () => {
          log.trace("Closed: " + url);
        })
        .on("timeout", () => {
          log.trace("Timeout: " + url);
          reject("timeout");
        })
        .on("error", (err) => {
          log.trace("Failed to download " + url, err);
          reject(err);
        });
      req.setTimeout(10000);
      req.end();
    } catch (err) {
      log.trace("Failed to download " + url, err);
      reject(err);
    }
  });
}

const sessions: Record<string, ClientHttp2Session> = {};
const disableHttp2For = new Set<string>();

function _http2Request(
  url: string,
  headers: Record<string, string> = {},
): Promise<{
  statusCode: number;
  content: string;
  contentType: string | undefined;
}> {
  return new Promise((resolve, reject) => {
    try {
      if (url.startsWith("blob:")) {
        resolve({ statusCode: 404, content: "", contentType: undefined });
        return;
      }
      const parsedURL = URL.parse(url);
      const origin = `${parsedURL.protocol}//${parsedURL.hostname}${
        parsedURL.port ? ":" + parsedURL.port : ""
      }`;

      if (disableHttp2For.has(origin) || parsedURL.protocol != "https:") {
        return _request(url, headers).then(resolve).catch(reject);
      }

      const runRequest = (session: ClientHttp2Session) => {
        const defaultOptions = {
          ":path": (parsedURL.path || "/") + ("?" + parsedURL.query),
          "user-agent": UserAgent,
          "cache-control": "no-cache",
          "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
          accept: "*/*",
          ...headers,
        };

        log.trace("Requesting " + url + " ...");
        const req = session.request(defaultOptions);
        req.setTimeout(3000, () => {
          req.close(http2.constants.NGHTTP2_CANCEL);
        });

        //req.setEncoding("utf8");
        let resHeaders: IncomingHttpHeaders & IncomingHttpStatusHeader = {};
        req.on("response", (headers) => {
          resHeaders = headers;
          log.trace(
            "Got response for download " + url + " ",
            resHeaders[":status"],
          );
        });
        const content: Array<Buffer> = [];
        req.on("data", (d) => {
          content.push(d);
        });
        req.on("end", () => {
          resolve({
            statusCode: resHeaders[":status"] || 404,
            content: Buffer.concat(content).toString(),
            contentType: resHeaders["content-type"],
          });
        });
        req.on("error", (err) => {
          if (
            err.errno == -505 ||
            err.code == "ECONNRESET" ||
            err.code == "ERR_HTTP2_STREAM_CANCEL"
          ) {
            if (!disableHttp2For.has(origin)) {
              log.debug(
                "HTTP2 session failed for " +
                  origin +
                  ". Disabling HTTP/2 for this origin",
              );
              disableHttp2For.add(origin);
            }
            _request(url, headers).then(resolve).catch(reject);
            session.close();
          } else {
            log.info("Error getting " + url, err);
            reject(err);
          }
        });
        req.end();
      };

      if (!sessions[origin]) {
        sessions[origin] = http2.connect(origin, {
          rejectUnauthorized: false,
          settings: {
            initialWindowSize: 1024 * 1024 * 10,
          },
        });
        sessions[origin].on("error", (err) => {
          delete sessions[origin];
          if (
            err.errno == -505 ||
            err.code == "ECONNRESET" ||
            err.code == "ERR_HTTP2_STREAM_CANCEL"
          ) {
            if (!disableHttp2For.has(origin)) {
              log.warn(
                "HTTP2 session failed for " +
                  origin +
                  ". Disabling HTTP/2 for this origin",
              );
              disableHttp2For.add(origin);
            }
            _request(url, headers).then(resolve).catch(reject);
          } else {
            log.warn("HTTP2 session failed for " + origin, err);
            reject(err);
          }
        });
        sessions[origin].on("connect", () => {
          log.trace("HTTP2 connected for " + origin);
          runRequest(sessions[origin]);
        });
        sessions[origin].on("close", () => {
          log.trace("HTTP2 session closed for " + origin);
          delete sessions[origin];
        });
        sessions[origin].on("goaway", () => {
          log.trace("HTTP2 session goaway for " + origin);
          delete sessions[origin];
        });
        sessions[origin].on("timeout", () => {
          log.trace("HTTP2 session timed out " + origin);
          delete sessions[origin];
        });
        sessions[origin].on("aborted", () => {
          log.trace("HTTP2 session aborted " + origin);
          delete sessions[origin];
        });
        sessions[origin].on("frameError", () => {
          log.trace("HTTP2 session frameError " + origin);
          delete sessions[origin];
        });
      } else {
        runRequest(sessions[origin]);
      }
    } catch (err) {
      log.trace("Failed to download " + url, err);
      reject(err);
    }
  });
}
