// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { AddressInput } from "./AddressInput";
function Editor({ apiKey = "test-key" }) {
  const [value, setValue] = useState("");
  return (
    <AddressInput
      apiKey={apiKey}
      value={value}
      label="地点"
      placeholder="地址"
      onChange={setValue}
    />
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const result = (text: string) => ({
  ok: true,
  json: async () => ({
    suggestions: [{ placePrediction: { text: { text } } }],
  }),
});
it("selects a suggestion with the keyboard and retains editable text", async () => {
  const fetcher = vi.fn().mockResolvedValue(result("东京站，日本东京"));
  vi.stubGlobal("fetch", fetcher);
  render(<Editor />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "东京" } });
  await screen.findByRole("option");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect((input as HTMLInputElement).value).toBe("东京站，日本东京");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("ignores a stale response after input changes and supports pointer selection", async () => {
  let resolve!: (value: unknown) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue(result("京都站"));
  vi.stubGlobal("fetch", fetcher);
  render(<Editor />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "东京" } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "京都" } });
  resolve(result("东京站"));
  const option = await screen.findByRole("option");
  expect(option.textContent).toBe("京都站");
  fireEvent.click(option);
  expect((input as HTMLInputElement).value).toBe("京都站");
});
it("keeps manual input usable when requests fail", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  render(<Editor />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "东京" } });
  await screen.findByText(/地址联想暂不可用/);
  expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("东京");
});
it("skips coordinates and composing text", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<Editor />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "35.68,139.76" } });
  await new Promise((r) => setTimeout(r, 350));
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "东京" } });
  await new Promise((r) => setTimeout(r, 350));
  expect(fetcher).not.toHaveBeenCalled();
});
