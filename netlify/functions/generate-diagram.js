const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");

exports.handler = async (event) => {
  console.log("--- EXECUTING SUPER-RES PNG ENGINE: V5.0 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width } = JSON.parse(event.body);

    // AI PROMPT: Focused entirely on technical line clarity
    const prompt = `ACT AS A TECHNICAL ARCHITECTURAL ILLUSTRATOR.
      Convert this aerial into a high-definition site diagram.
      - STYLE: 0.1mm sharp black (#000000) lines on pure white.
      - CONTEXT: Solid pale blue (#AACCFF) for water.
      - QUALITY: No anti-aliasing. No shadows. No blobs. No text.
      - GOAL: Every building edge must be a distinct, clean path.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // --- THE MASTER UPSCALE ---
    // We upscale the 1024px AI image to 3500px (Pro Print Resolution)
    // We apply a 'sharpen' filter to make the lines "pop" for Illustrator's internal tracer.
    const finalWidth = 3500;
    
    const masterPng = await sharp(aiBuffer)
        .resize({ width: finalWidth })
        .sharpen({
            sigma: 1.5,
            m1: 0.5,
            m2: 20
        })
        .png({ palette: true, quality: 100 }) // Keep it 8-bit for clean color separation
        .toBuffer();

    console.log(`Master PNG Created: ${Math.round(masterPng.length / 1024)}KB`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: masterPng.toString('base64'),
        svg: "" // We are disabling the server SVG to save payload space
      }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
