import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";
import * as api from "./index.js";

describe("main", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("reports the underlying error and sets a non-zero exit code", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    main(["."]);

    expect(errorSpy).toHaveBeenCalledWith(
      "graphql-okf: not implemented yet (GOAL-M1 in progress)",
    );
    expect(process.exitCode).toBe(1);
  });

  it("defaults the output directory when none is given", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    main([]);

    expect(errorSpy).toHaveBeenCalled();
  });

  it("stringifies a non-Error throw", () => {
    vi.spyOn(api, "createOkfBundle").mockImplementation(() => {
      throw "boom";
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    main(["."]);

    expect(errorSpy).toHaveBeenCalledWith("boom");
    expect(process.exitCode).toBe(1);
  });
});
