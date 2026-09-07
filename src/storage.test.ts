// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiKeyStorageKey, loadApiKey, saveApiKey } from "./storage";

describe("API key storage", () => {
  beforeEach(() => localStorage.clear());

  it("saves and restores the API key", () => {
    saveApiKey("browser-key");
    expect(localStorage.getItem(apiKeyStorageKey)).toBe("browser-key");
    expect(loadApiKey()).toBe("browser-key");
  });

  it("removes the saved key when the input is cleared", () => {
    localStorage.setItem(apiKeyStorageKey, "old-key");
    saveApiKey("");
    expect(loadApiKey()).toBe("");
  });

  it("keeps working when browser storage is unavailable", () => {
    const get = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(loadApiKey()).toBe("");
    get.mockRestore();
  });
});
