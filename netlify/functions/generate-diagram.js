const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace"); // Standard import

exports.handler = async (event) => {
  console.log("--- EXECUTING NASHVILLE PRO PIPELINE: V4.1 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const palette = { charcoal: "#333333", water: "#AACCFF" };

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this aerial photo into a clean site diagram.
      - STYLE: Charcoal (#333333) outlines for buildings and roads, pale light blue (#AACCFF) for water.
      - TECHNICAL: Pure white background. FLAT COLORS ONLY. No gradients.`;

    // 1. AI Generation (Working perfectly at ~14s)
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 2. High-speed Resizing (800px trace resolution is safe)
    const traceSize = 800;
    const traceBuffer = await sharp(aiBuffer).resize(traceSize).toBuffer();

    // 3. THE "ROCK SOLID" SEQUENTIAL TRACING ENGINE
    const runTraceLayer = async (threshold, colorHex, layerName, isOutlines) => {
        return new Promise((resolve, reject) => {
            // THE FIX: We force-initialize a new instance every time.
            const p = new potrace.Potrace();
            
            p.setParameters({
                threshold: threshold,
                turdSize: isOutlines ? 5 : 40, // Lean trace for color context
                optTolerance: isOutlines ? 0.4 : 1.5 
            });

            p.loadImage(traceBuffer, (err) => {
                if (err) {
                    console.error(`Trace load error for ${layerName}:`, err);
                    return resolve("");
                }
                const svg = p.getSVG();
                const paths = svg.match(/<path.*?\/>/g);
                if (!paths) return resolve("");
                const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
                resolve(`<g id="${layerName}">${coloredPaths}</g>`);
            });
        });
    };

    // Sequential trace to guarantee server stability
    console.log("Vectorizing color layer...");
    const context = await runTraceLayer(215, palette.water, "Nashville_Site_Context", false);
    
    console.log("Vectorizing detailed outlines...");
    const outlines = await runTraceLayer(125, palette.charcoal, "Architectural_Outlines", true);

    // 4. ASSEMBLE SVG FOR ILLUSTRATOR
    // Uses viewBox trick to maintain the correct high-res scale in Illustrator
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${traceSize} ${traceSize}" preserveAspectRatio="none">
            <rect width="${traceSize}" height="${traceSize}" fill="white"/>
            ${context}
            ${outlines}
        </svg>`;

    // Prepare High-Res PNG return
    const highResPng = await sharp(aiBuffer).resize(parseInt(width), parseInt(height)).toBuffer();

    console.log("Pipeline success. Vectors ready.");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: highResPng.toString('base64'), 
        svg: Buffer.from(finalSvg).toString('base64') 
      }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC CRITICAL ERROR:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Pipeline Engine Error: " + error.message }) };
  }
};
