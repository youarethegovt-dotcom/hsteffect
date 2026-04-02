const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- EXECUTING HIGH-DETAIL TECHNICAL ENGINE: V4.7 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);
    const palette = { charcoal: "#333333", water: "#AACCFF" };

    const originalWidth = parseInt(width);
    const originalHeight = parseInt(height);
    const ratio = originalHeight / originalWidth;
    
    // TRACE RESOLUTION: We're bumping this to 1200px for better detail
    const traceW = 1200;
    const traceH = Math.round(1200 * ratio);

    // UPDATED PROMPT: We are now explicitly asking for "HAIRLINES"
    const prompt = `ACT AS A TECHNICAL ARCHITECTURAL ILLUSTRATOR. 
      Convert this site into a diagram using:
      - EXTREMELY THIN 0.1mm technical hairlines for all building edges.
      - High contrast Black (#000000) on Pure White background.
      - Solid light blue (#AACCFF) fills for water.
      - NO BLOBS, NO SHADING, NO TEXTURES. Just crisp, sharp vector-ready lines.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    const traceBuffer = await sharp(aiBuffer).resize(traceW, traceH).toBuffer();

    const runTrace = (threshold, colorHex, layerName, isOutlines) => {
        return new Promise((resolve) => {
            const tracer = potrace.trace || (potrace.default && potrace.default.trace) || (typeof potrace === 'function' ? potrace : null);
            
            tracer(traceBuffer, { 
                threshold: threshold, 
                // CRITICAL TWEAKS FOR SHARPNESS:
                turdSize: isOutlines ? 2 : 15,    // Much smaller 'turdSize' to keep fine lines
                optTolerance: isOutlines ? 0.2 : 1.0, // Lower tolerance = Sharper corners
                alphamax: 0.1                     // Favors straight lines over curves
            }, (err, svg) => {
                if (err) return resolve("");
                const paths = svg.match(/<path.*?\/>/g);
                if (!paths) return resolve("");
                const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
                resolve(`<g id="${layerName}">${coloredPaths}</g>`);
            });
        });
    };

    // We use a stricter threshold for outlines (140) to keep them thin
    const outlines = await runTrace(140, palette.charcoal, "Architectural_Outlines", true);
    const context = await runTrace(220, palette.water, "Nashville_Site_Context", false);

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
