import { z } from "zod";
import "./zod-error.js";

const optionValue = z.union([z.string(), z.number(), z.boolean()]);

export const packOptionSchema = z
  .strictObject({
    type: z.enum(["string", "number", "boolean"]),
    default: optionValue,
    from: z.string().optional(),
  })
  .superRefine((option, ctx) => {
    const actual = typeof option.default;
    if (actual !== option.type) {
      ctx.addIssue({
        code: "custom",
        path: ["default"],
        message: `Default must be a ${option.type}`,
      });
    }
  });

export const packOutputSchema = z.strictObject({
  template: z.string().min(1),
  to: z.string().min(1),
  when: z.string().min(1).optional(),
});

export const packManifestSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  requires: z.array(z.string()).default(() => []),
  conflicts: z.array(z.string()).default(() => []),
  options: z.record(z.string(), packOptionSchema).default(() => ({})),
  outputs: z.array(packOutputSchema).default(() => []),
  agentRules: z.array(z.string()).default(() => []),
});

export type PackManifest = z.infer<typeof packManifestSchema>;
export type PackOption = z.infer<typeof packOptionSchema>;
export type PackOutput = z.infer<typeof packOutputSchema>;

export function parseManifest(input: unknown): PackManifest {
  return packManifestSchema.parse(input);
}
