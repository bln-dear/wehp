import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const SYSTEM_PROMPT = `แปลข้อความนี้ให้เป็นภาษาที่ใช้พากย์ไทยในหนังจีนโบราณ ตอบกลับด้วยข้อความที่แปลงแล้วเท่านั้น ไม่เอาอักขระ`;

let client = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function translateToGenZ(text) {
  const anthropic = getClient();
  if (!anthropic) return text;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });
    const block = response.content.find((b) => b.type === "text");
    const translated = block?.text?.trim();
    return translated || text;
  } catch (err) {
    console.error("AI translation failed, falling back to original text:", err.message);
    return text;
  }
}
