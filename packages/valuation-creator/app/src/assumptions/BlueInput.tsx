import type { CSSProperties, InputHTMLAttributes, SelectHTMLAttributes } from "react";

/**
 * Excel modelling convention: blue text marks a hardcoded input cell (as
 * opposed to a black-text formula cell). Every user-editable assumption in
 * the app uses this style so it's visually obvious what can be changed.
 */
export const BLUE_INPUT_STYLE: CSSProperties = {
  color: "#1a56db",
  fontWeight: 600,
  border: "1px solid #cbd5e1",
  borderRadius: 4,
  padding: "0.15rem 0.4rem",
  width: "6.5rem",
  fontFamily: "inherit",
};

export type BlueInputProps = InputHTMLAttributes<HTMLInputElement>;

/** A numeric/text input styled per the Excel blue-input convention. */
export function BlueInput({ style, ...rest }: BlueInputProps) {
  return <input style={{ ...BLUE_INPUT_STYLE, ...style }} {...rest} />;
}

/** A <select> styled per the Excel blue-input convention (e.g. the scenario toggle). */
export function BlueSelect({
  style,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select style={{ ...BLUE_INPUT_STYLE, width: "auto", ...style }} {...rest} />;
}
