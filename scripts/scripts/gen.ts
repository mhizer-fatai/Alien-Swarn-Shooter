import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function genImage(prompt: string, filename: string) {
  console.log(`Generating ${filename}...`);
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
    });
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        fs.writeFileSync(path.join(process.cwd(), 'public', filename), buffer);
        console.log(`Saved ${filename}`);
        return;
      }
    }
    console.log(`No image data found for ${filename}`);
  } catch (e) {
    console.error(`Failed to generate ${filename}:`, e);
  }
}

async function main() {
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  await Promise.all([
    genImage('Top-down 2D game sprite of a military soldier holding a heavy gun, isolated on a pure bright magenta (#FF00FF) background, clean vector art style.', 'player.png'),
    genImage('Top-down 2D game sprite of a vicious alien animal monster with sharp teeth, isolated on a pure bright magenta (#FF00FF) background, clean vector art style.', 'enemy.png'),
    genImage('Top-down 2D game sprite of a large leafy forest tree, isolated on a pure bright magenta (#FF00FF) background, clean vector art style.', 'tree.png'),
    genImage('Seamless top-down 2D texture of a forest ground with grass, dirt, and small pebbles, video game texture.', 'ground.png')
  ]);
}
main();
