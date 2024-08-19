import { expect } from "chai";
// @typescript-eslint/no-var-requires
const jsonSchema = require("./schema/bom-1.4.schema.json");
const jsfSchema = require("./schema/jsf-0.82.schema.json");
const exampleData = require("./demoresults.json");
import { Validator } from "jsonschema";
import { convertToCycloneDX } from "../src/log";

describe("cyclonedx-json", () => {
  it("should generate according to schema", () => {
    // @ts-ignore
    const cycloneDx = convertToCycloneDX(exampleData);
    //console.log(cycloneDx);
    const validator = new Validator();
    validator.addSchema(
      jsfSchema,
      "jsf-0.82.schema.json#/definitions/signature",
    );
    const result = validator.validate(cycloneDx, jsonSchema);
    if (!result.valid) {
      console.log(result.errors);
    }
    expect(result.valid).to.eq(true);
  });
});
