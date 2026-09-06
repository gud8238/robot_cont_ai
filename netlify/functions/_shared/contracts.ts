import { z } from "zod";

export const emotionSchema = z.enum(["행복", "슬픔", "보통", "화남"]);
export const commandSchema = z.enum(["전진", "후진", "좌회전", "우회전"]);

export type Emotion = z.infer<typeof emotionSchema>;
export type Command = z.infer<typeof commandSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(30),
  age: z.number().int().min(4).max(120),
  honorific: z.string().trim().min(1).max(30)
});

export const historyItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(800)
});

export const emotionTurnRequestSchema = z.object({
  profile: profileSchema,
  history: z.array(historyItemSchema).min(1).max(12)
});

export type EmotionTurnRequest = z.infer<typeof emotionTurnRequestSchema>;

export const emotionTurnResultSchema = z.object({
  reply: z.string().trim().min(1).max(500),
  emotion: emotionSchema.nullable(),
  confidence: z.number().min(0).max(1),
  complete: z.boolean()
}).superRefine((value, context) => {
  if (value.complete && value.emotion === null) {
    context.addIssue({ code: "custom", message: "A completed turn requires an emotion" });
  }
});

export type EmotionTurnResult = z.infer<typeof emotionTurnResultSchema>;

export const voiceCommandRequestSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("speech"), transcript: z.string().trim().min(1).max(300) }),
  z.object({ source: z.literal("touch"), command: commandSchema })
]);

export type VoiceCommandRequest = z.infer<typeof voiceCommandRequestSchema>;

export const voiceCommandResultSchema = z.object({ command: commandSchema });

export type VoiceCommandResult = z.infer<typeof voiceCommandResultSchema>;
