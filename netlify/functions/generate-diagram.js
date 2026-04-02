const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- EXECUTING SKELETAL LINE ENGINE: V4.8 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);
    const palette = { charcoal: "#000000", water: "#AACCFF" };

    const originalWidth = parseInt(width);
    const originalHeight = parseInt(height);
    const ratio = originalHeight / originalWidth;
    
    // RESOLUTION BUMP: More pixels = More "interpretation" room
    const traceW = 1500;
    const traceH = Math.round(1500 * ratio);

    const prompt = `ACT AS A SENIOR ARCHITECTURAL DRAFTSMAN.
      Convert this site into a SKELETAL wireframe diagram.
      - USE: 1px absolute black (#000000) aliased lines. No anti-aliasing.
      - STYLE: Pure white background. Solid pale blue (#AACCFF) for water.
      - IMPORTANT: Think in 1D lines, not 2D shapes. No shadows, no shading, no thickness.
      - DETAIL: Every building edge must be a single, distinct black pixel path.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // High-resolution sharpen before tracing
    const traceBuffer = await sharp(aiBuffer)
        .resize(traceW, traceH)
        .sharpen() // This makes the 1px lines "pop" for the tracer
        .toBuffer();

    const runTrace = (threshold, colorHex, layerName, isOutlines) => {
        return new Promise((resolve) => {
            const tracer = potrace.trace || (potrace.default && potrace.default.trace) || (typeof potrace === 'function' ? potrace : null);
            
            tracer(traceBuffer, { 
                threshold: threshold, 
                turdSize: isOutlines ? 1 : 20,     // '1' ensures we don't lose any thin lines
                optTolerance: isOutlines ? 0.1 : 1.0, // Aggressive corner sharpening
                alphamax: 0.01                     // Forces straight lines (Architectural standard)
            }, (err, svg) => {
                if (err) return resolve("");
                const paths = svg.match(/<path.*?\/>/g);
                if (!paths) return resolve("");
                const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
                resolve(`<g id="${layerName}">${coloredPaths}</g>`);
            });
        });
    };

    // Strict threshold (100) to ensure only the absolute blackest pixels become lines
    const outlines = await runTrace(100, palette.charcoal, "Architectural_Outlines", true);
    const context = await runTrace(215, palette.water, "Nashville_Site_Context", false);

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
