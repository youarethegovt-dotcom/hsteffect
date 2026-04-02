const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- EXECUTING GEOMETRY-CORRECT ENGINE: V4.6 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);
    const palette = { charcoal: "#333333", water: "#AACCFF" };

    // ASPECT RATIO MATH: This prevents the "squish"
    const originalWidth = parseInt(width);
    const originalHeight = parseInt(height);
    const ratio = originalHeight / originalWidth;
    
    // We set the trace width to 1000px and calculate the proportional height
    const traceW = 1000;
    const traceH = Math.round(1000 * ratio);

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this site into a diagram with:
      - Deep Black (#000000) outlines for all buildings and roads.
      - Solid Pale Blue (#AACCFF) for water context.
      - Pure white background. FLAT COLORS ONLY. HIGH CONTRAST.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 1. Proportional Resize
    const traceBuffer = await sharp(aiBuffer).resize(traceW, traceH).toBuffer();

    const runTrace = (threshold, colorHex, layerName, isOutlines) => {
        return new Promise((resolve) => {
            const tracer = potrace.trace || (potrace.default && potrace.default.trace) || (typeof potrace === 'function' ? potrace : null);
            
            // We adjusted the thresholds: 180 is broader to catch more lines
            tracer(traceBuffer, { 
                threshold: threshold, 
                turdSize: isOutlines ? 5 : 30,
                optTolerance: isOutlines ? 0.4 : 1.2
            }, (err, svg) => {
                if (err) return resolve("");
                const paths = svg.match(/<path.*?\/>/g);
                if (!paths) return resolve("");
                const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
                resolve(`<g id="${layerName}">${coloredPaths}</g>`);
            });
        });
    };

    console.log(`Tracing Layers at ${traceW}x${traceH}...`);
    // Outlines (captured at 180 threshold to ensure they aren't missed)
    const outlines = await runTrace(180, palette.charcoal, "Architectural_Outlines", true);
    // Water (captured at a higher threshold)
    const context = await runTrace(225, palette.water, "Nashville_Site_Context", false);

    // 2. ASSEMBLE SVG (Correct Viewbox)
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${originalWidth}" height="${originalHeight}" viewBox="0 0 ${traceW} ${traceH}">
            <rect width="${traceW}" height="${traceH}" fill="white"/>
            ${context}
            ${outlines}
        </svg>`;

    const highResPng = await sharp(aiBuffer).resize(originalWidth, originalHeight).toBuffer();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: highResPng.toString('base64'), 
        svg: Buffer.from(finalSvg).toString('base64') 
      }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
