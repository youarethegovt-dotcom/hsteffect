const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- EXECUTING UNIVERSAL ENGINE: V4.2 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const palette = { charcoal: "#333333", water: "#AACCFF" };

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this aerial photo into a high-quality site diagram.
      - STYLE: Charcoal (#333333) outlines for buildings and roads, pale light blue (#AACCFF) for water.
      - TECHNICAL: Pure white background. FLAT COLORS ONLY. No gradients.`;

    // 1. AI Generation (Proven stable at ~15s)
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 2. Speed Scaling (800px is our safe zone)
    const traceSize = 800;
    const traceBuffer = await sharp(aiBuffer).resize(traceSize).toBuffer();

    // 3. THE "BULLETPROOF" TRACING LOGIC
    // We use the most basic potrace.trace function possible
    const runTrace = (threshold, colorHex, layerName, isOutlines) => {
        return new Promise((resolve) => {
            potrace.trace(traceBuffer, { 
                threshold: threshold, 
                turdSize: isOutlines ? 10 : 40,
                optTolerance: isOutlines ? 0.4 : 1.5
            }, (err, svg) => {
                if (err) {
                    console.error(`Trace failed for ${layerName}:`, err);
                    return resolve('');
                }
                const paths = svg.match(/<path.*?\/>/g);
                if (!paths) return resolve('');
                
                const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
                resolve(`<g id="${layerName}">${coloredPaths}</g>`);
            });
        });
    };

    console.log("Generating Vector Layers...");
    // Sequential tracing to ensure we don't hit memory limits
    const contextLayer = await runTrace(210, palette.water, "Nashville_Site_Context", false);
    const outlineLayer = await runTrace(125, palette.charcoal, "Architectural_Outlines", true);

    // 4. Assemble SVG for Illustrator
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${traceSize} ${traceSize}" preserveAspectRatio="none">
            <rect width="${traceSize}" height="${traceSize}" fill="white"/>
            ${contextLayer}
            ${outlineLayer}
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
    console.error("DIAGNOSTIC ERROR:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Engine Error: " + error.message }) };
  }
};
