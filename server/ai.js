import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_SYSTEM_PROMPT = `ข้อความนี้เป็นข้อความที่ใช้ในบทสนทนา แปลข้อความนี้ให้เป็นภาษาที่ใช้พากย์ไทยในหนังจีนโบราณ ตอบกลับด้วยข้อความที่แปลงแล้วและเป็นภาษาไทยเท่านั้น ไม่เอาอักขระ ห้ามพยายามตีความหรือขอความชัดเจนเพิ่มเติม หากแปลไม่ได้ก็ให้ตอบกลับเป็นเสียงพูดมั่วๆแบบคนบ้าพูดเพ้อแบบสั้นๆ`;

const SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

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
