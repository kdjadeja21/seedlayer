import { z } from "zod";

z.config({
  customError: readableZodError,
});

function readableZodError(issue: z.core.$ZodRawIssue): string | undefined {
  switch (issue.code) {
    case "invalid_type":
      if (issue.input === undefined) return "Required";
      if (issue.expected === "int") return "Expected an integer";
      return `Expected ${issue.expected}, received ${describeType(issue.input)}`;
    case "invalid_value":
      return invalidValueMessage(issue.values, issue.input);
    case "too_small":
      return boundMessage("small", issue.origin, issue.minimum, issue.inclusive, issue.exact);
    case "too_big":
      return boundMessage("big", issue.origin, issue.maximum, issue.inclusive, issue.exact);
    case "unrecognized_keys": {
      const label = issue.keys.length === 1 ? "key" : "keys";
      return `Unrecognized ${label}: ${issue.keys.map((key) => JSON.stringify(key)).join(", ")}`;
    }
    case "custom":
    case "invalid_format":
    case "invalid_union":
    case "invalid_key":
    case "invalid_element":
    case "not_multiple_of":
      return undefined;
    default: {
      const unreachable: never = issue;
      return unreachable;
    }
  }
}

function invalidValueMessage(values: readonly z.core.util.Primitive[], input: unknown): string {
  const received = describeValue(input);
  if (values.length === 1) return `Expected ${describeValue(values[0])}, received ${received}`;
  const expected = values.map((value) => describeValue(value)).join(", ");
  return `Expected one of: ${expected}. Received ${received}`;
}

function boundMessage(
  direction: "small" | "big",
  origin: string,
  bound: number | bigint,
  inclusive: boolean | undefined,
  exact: boolean | undefined,
): string | undefined {
  if (origin === "array") {
    const count = Number(bound);
    const noun = count === 1 ? "item" : "items";
    if (exact) return `Must include exactly ${count} ${noun}`;
    return direction === "small"
      ? `Must include at least ${count} ${noun}`
      : `Must include at most ${count} ${noun}`;
  }
  if (origin !== "number" && origin !== "int") return undefined;
  if (exact) return `Must be ${bound}`;
  if (direction === "small") {
    return inclusive === false ? `Must be greater than ${bound}` : `Must be at least ${bound}`;
  }
  return inclusive === false ? `Must be less than ${bound}` : `Must be at most ${bound}`;
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function describeValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return value.toString();
  return describeType(value);
}
