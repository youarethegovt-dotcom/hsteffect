const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- EXECUTING MASTER ENGINE: V4.5 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);
    const palette = { charcoal: "#333333", water: "#AACCFF" };

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || "Charcoal outlines (#333333) and pale blue water (#AACCFF)."}
      TECHNICAL: Pure white background. FLAT COLORS ONLY. No text. No gradients.`;

    // 1. AI Generation (Proven stable)
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 2. High-speed Resizing (800px)
    const traceSize = 800;
    const traceBuffer = await sharp(aiBuffer).resize(traceSize).toBuffer();

    // 3. THE "DEEP DIVE" TRACER
    // This looks for the function in every possible 'Node' location to prevent the crash
    const runTrace = (threshold, colorHex, layerName) => {
        return new Promise((resolve) => {
            // Check for potrace.trace, potrace.default.trace, or the potrace object itself
            const tracer = potrace.trace || (potrace.default && potrace.default.trace) || (typeof potrace === 'function' ? potrace : null);
            
            if (!tracer) {
                console.error("Vector tool not found in registry.");
                return resolve("");
            }

            tracer(traceBuffer, { threshold, turdSize: 20, optTolerance: 1.0 }, (err, svg) => {
                if (err) return resolve("");
                const paths = svg.match(/<path.*?\/>/g);
                if (!paths) return resolve("");
                const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
                resolve(`<g id="${layerName}">${coloredPaths}</g>`);
            });
        });
    };

    console.log("Building Vector Layers...");
    const context = await runTrace(215, palette.water, "Nashville_Site_Context");
    const outlines = await runTrace(120, palette.charcoal, "Architectural_Outlines");

    // 4. ASSEMBLE SVG
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${traceSize} ${traceSize}" preserveAspectRatio="none">
            <rect width="${traceSize}" height="${traceSize}" fill="white"/>
            ${context}
            ${outlines}
        </svg>`;

    const highResPng = await sharp(aiBuffer).resize(parseInt(width), parseInt(height)).toBuffer();

    console.log("Success! Pipeline Complete.");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: highResPng.toString('base64'), 
        svg: Buffer.from(finalSvg).toString('base64') 
      }),
    };

  } catch (error) {
    console.error("CRITICAL ERROR:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
