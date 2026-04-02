const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace"); // Standard import

exports.handler = async (event) => {
  console.log("--- EXECUTING SIMPLIFIED ENGINE: V3.8 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const palette = { charcoal: "#333333", water: "#AACCFF" };

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || "Charcoal outlines (#333333), white building tops, and pale blue water (#AACCFF)."}
      TECHNICAL: FLAT COLORS ONLY. Pure white background. High contrast.`;

    // 1. AI Generation (~15s)
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 2. Internal Resizing for Speed (800px)
    const traceSize = 800;
    const traceBuffer = await sharp(aiBuffer).resize(traceSize).toBuffer();

    // 3. THE FIX: DIRECT TRACE CALLS
    // We remove the complex "getTracer" check and call the library directly.
    const runTrace = (threshold, colorHex, layerName) => {
        return new Promise((resolve, reject) => {
            // Using the most direct call possible: potrace.trace()
            potrace.trace(traceBuffer, { threshold, turdSize: 15 }, (err, svg) => {
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
    const [contextLayer, outlineLayer] = await Promise.all([
        runTrace(210, palette.water, "Site_Context"),
        runTrace(120, palette.charcoal, "Architectural_Outlines")
    ]);

    // 4. Assemble SVG
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${traceSize} ${traceSize}" preserveAspectRatio="none">
            <rect width="${traceSize}" height="${traceSize}" fill="white"/>
            ${contextLayer}
            ${outlineLayer}
        </svg>`;

    const highResPng = await sharp(aiBuffer).resize(parseInt(width), parseInt(height)).toBuffer();

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
