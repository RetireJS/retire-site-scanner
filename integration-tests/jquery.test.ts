import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";

const JQUERY_URL = "https://code.jquery.com/jquery-1.8.3.min.js";

const html = `<!doctype html>
<html>
  <head>
    <title>retire-site-scanner integration test</title>
    <script src="${JQUERY_URL}"></script>
  </head>
  <body>
    <h1>Integration test page</h1>
  </body>
</html>`;

describe("integration: scan localhost page loading vulnerable jQuery", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it(
    "detects jquery 1.8.3 with known vulnerabilities in the SBOM",
    { timeout: 120_000 },
    async () => {
      const sbomFile = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "rss-integration-")),
        "sbom.json",
      );

      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "tsx",
          ["src/index.ts", baseUrl, "--sbom-file", sbomFile, "--docker"],
          {
            cwd: path.join(__dirname, ".."),
            stdio: ["ignore", "inherit", "inherit"],
          },
        );
        child.on("error", reject);
        child.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`scanner exited with code ${code}`));
        });
      });

      assert.ok(
        fs.existsSync(sbomFile),
        "expected the scanner to write an SBOM file",
      );
      const sbom = JSON.parse(fs.readFileSync(sbomFile, "utf-8"));

      assert.equal(sbom.bomFormat, "CycloneDX");

      const jquery = (
        sbom.components as Array<{
          name: string;
          version: string;
        }>
      ).find((c) => c.name === "jquery");
      assert.ok(jquery, "expected jquery to be reported as a component");
      assert.equal(jquery.version, "1.8.3");

      const jqueryRef = (
        sbom.components as Array<{
          name: string;
          version: string;
          "bom-ref": string;
        }>
      ).find((c) => c.name === "jquery" && c.version === "1.8.3")?.["bom-ref"];
      const jqueryVulns = (
        sbom.vulnerabilities as Array<{
          affects: Array<{ ref: string }>;
        }>
      ).filter((v) => v.affects.some((a) => a.ref === jqueryRef));
      assert.ok(
        jqueryVulns.length > 0,
        "expected at least one vulnerability affecting jquery 1.8.3",
      );
    },
  );
});
