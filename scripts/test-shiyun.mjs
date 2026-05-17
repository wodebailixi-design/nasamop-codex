import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(filePath) {
  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^[ '\"]|[ '\"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function redact(value) {
  if (value.length <= 10) return "***";
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

async function requestJson(path, body) {
  const baseUrl = requiredEnv("SHIYUN_BASE_URL").replace(/\/$/, "");
  const apiKey = requiredEnv("SHIYUN_API_KEY");

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const details = JSON.stringify(json, null, 2);
    throw new Error(`${path} failed with HTTP ${response.status}\n${details}`);
  }

  return json;
}

async function testChat() {
  const model = requiredEnv("SHIYUN_CHAT_MODEL");
  const json = await requestJson("/chat/completions", {
    model,
    messages: [
      {
        role: "user",
        content: "你好，请用一句话介绍你自己。"
      }
    ],
    temperature: 0.7
  });

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Chat completion returned no message content.");
  }

  console.log(`Chat OK (${model}): ${content}`);
}

async function testImage() {
  const model = requiredEnv("SHIYUN_IMAGE_MODEL");
  const json = await requestJson("/images/generations", {
    model,
    prompt: "一枚极简风格的蓝色圆形图标，白色光点，纯色背景",
    size: "1024x1024",
    n: 1
  });

  const image = json.data?.[0];
  const hasUrl = Boolean(image?.url);
  const hasBase64 = Boolean(image?.b64_json);

  if (!hasUrl && !hasBase64) {
    throw new Error("Image generation returned no url or b64_json payload.");
  }

  console.log(`Image OK (${model}): ${hasUrl ? "url returned" : "base64 returned"}`);
}

async function main() {
  loadEnv(resolve(".env"));

  console.log(`Using Shiyun API key: ${redact(requiredEnv("SHIYUN_API_KEY"))}`);
  console.log(`Using Shiyun base URL: ${requiredEnv("SHIYUN_BASE_URL")}`);

  await testChat();
  await testImage();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
