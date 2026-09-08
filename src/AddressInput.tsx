import { useEffect, useId, useRef, useState } from "react";

export function AddressInput({
  apiKey,
  value,
  label,
  placeholder,
  onChange,
}: {
  apiKey: string;
  value: string;
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const generation = useRef(0);
  const dismiss = () => {
    generation.current++;
    setEditing(false);
    setSuggestions([]);
    setStatus("");
    setActive(-1);
  };
  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    setSuggestions([]);
    setActive(-1);
    setStatus("");
    const input = value.trim();
    if (
      !editing ||
      composing ||
      !apiKey.trim() ||
      input.length < 2 ||
      /^[+-]?[\d.]+\s*[,，、]\s*[+-]?[\d.]+$/.test(input)
    )
      return;
    const timer = window.setTimeout(async () => {
      setStatus("正在查找地点…");
      try {
        const response = await fetch(
          "https://places.googleapis.com/v1/places:autocomplete",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey.trim(),
              "X-Goog-FieldMask": "suggestions.placePrediction.text.text",
            },
            body: JSON.stringify({ input, languageCode: "zh-CN" }),
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Autocomplete failed");
        const data = await response.json();
        if (request !== generation.current) return;
        const items: string[] = (data.suggestions ?? []).flatMap(
          (item: { placePrediction?: { text?: { text?: string } } }) =>
            item.placePrediction?.text?.text
              ? [item.placePrediction.text.text]
              : [],
        );
        setSuggestions([...new Set(items)]);
        setStatus(
          items.length ? "" : "未找到建议，请补充地址或直接使用当前输入。",
        );
      } catch {
        if (request === generation.current && !controller.signal.aborted)
          setStatus(
            "地址联想暂不可用，请检查 Key 和 Places API (New)，或继续手动输入。",
          );
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
      generation.current++;
    };
  }, [value, apiKey, editing, composing]);
  const select = (text: string) => {
    dismiss();
    onChange(text);
  };
  const open = editing && suggestions.length > 0;
  return (
    <div className="address-input">
      <input
        role="combobox"
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-describedby={status ? `${id}-status` : undefined}
        aria-activedescendant={
          open && active >= 0 ? `${id}-${active}` : undefined
        }
        onChange={(e) => {
          generation.current++;
          setSuggestions([]);
          setActive(-1);
          setEditing(true);
          onChange(e.target.value);
        }}
        onBlur={dismiss}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={(e) => {
          if (composing || e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            e.preventDefault();
            dismiss();
          }
          if (!open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive(
              (index) =>
                (index +
                  (e.key === "ArrowDown" ? 1 : index < 0 ? 0 : -1) +
                  suggestions.length) %
                suggestions.length,
            );
          }
          if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            select(suggestions[active]);
          }
        }}
      />
      {open && (
        <div className="address-dropdown">
          <ul id={`${id}-list`} role="listbox" aria-label={`${label}建议`}>
            {suggestions.map((text, index) => (
              <li
                key={text}
                id={`${id}-${index}`}
                role="option"
                aria-selected={active === index}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(text)}
              >
                {text}
              </li>
            ))}
          </ul>
          <div className="places-attribution">Google Maps</div>
        </div>
      )}
      {status && (
        <div className="address-status" id={`${id}-status`} role="status">
          {status}
        </div>
      )}
    </div>
  );
}
