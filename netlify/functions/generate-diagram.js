const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- EXECUTING PAYLOAD-OPTIMIZED ENGINE: V4.9 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);
    const palette = { charcoal: "#000000", water: "#AACCFF" };

    const originalWidth = parseInt(width);
    const originalHeight = parseInt(height);
    const ratio = originalHeight / originalWidth;
    
    const traceW = 1500;
    const traceH = Math.round(1500 * ratio);

    const prompt = `ACT AS A TECHNICAL ARCHITECTURAL ILLUSTRATOR.
      - STYLE: 1px absolute black (#000000) skeletal lines. 
      - BACKGROUND: Pure white. Solid pale blue (#AACCFF) water.
      - TECHNICAL: No anti-aliasing, no shading. High contrast.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 1. Trace Buffer Prep
    const traceBuffer = await sharp(aiBuffer).resize(traceW, traceH).sharpen().toBuffer();

    const runTrace = (threshold, colorHex, layerName, isOutlines) => {
        return new Promise((resolve) => {
            const tracer = potrace.trace || (potrace.default && potrace.default.trace) || (typeof potrace === 'function' ? potrace : null);
            tracer(traceBuffer, { 
                threshold, 
                turdSize: isOutlines ? 2 : 25, 
                optTolerance: isOutlines ? 0.15 : 1.2,
                alphamax: 0.01 
            }, (err, svg) => {
                if (err) return resolve("");
                const paths = svg.match(/<path.*?\/>/g);
                if (!paths) return resolve("");
                const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
                resolve(`<g id="${layerName}">${coloredPaths}</g>`);
            });
        });
    };

    console.log("Generating High-Detail Vectors...");
    const outlines = await runTrace(110, palette.charcoal, "Architectural_Outlines", true);
    const context = await runTrace(220, palette.water, "Nashville_Site_Context", false);

    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${originalWidth}" height="${originalHeight}" viewBox="0 0 ${traceW} ${traceH}">
            <rect width="${traceW}" height="${traceH}" fill="white"/>
            ${context}${outlines}
        </svg>`;

    // --- THE BIG FIX: PAYLOAD COMPRESSION ---
    // We convert the PNG to an 8-bit palette-based image. 
    // For a diagram with only 3 colors, this reduces size from 4MB to ~400KB.
    const optimizedPng = await sharp(aiBuffer)
        .resize(originalWidth, originalHeight)
        .png({ 
            palette: true,      // Uses a color palette (8-bit) instead of TrueColor (24-bit)
            compressionLevel: 9, // Maximum compression
            quality: 60         // Slight loss of anti-aliasing for massive space savings
        })
        .toBuffer();

    console.log(`Payload Optimized. PNG size: ${Math.round(optimizedPng.length / 1024)}KB`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: optimizedPng.toString('base64'), 
        svg: Buffer.from(finalSvg).toString('base64') 
      }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
