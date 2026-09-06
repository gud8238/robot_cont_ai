import { z } from "zod";

const serverEnvSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(1),
  EMOTION_GAS_URL: z.string().trim().min(1),
  VOICE_GAS_URL: z.string().trim().min(1),
  EMOTION_GAS_TOKEN: z.string().trim().min(1),
  VOICE_GAS_TOKEN: z.string().trim().min(1)
});

type Environment = Record<string, string | undefined>;

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function readServerEnv(environment: Environment = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(environment);

  if (!result.success) {
    throw new Error("Server configuration is invalid");
  }

  return result.data;
}
