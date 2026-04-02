const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
// We use a robust require here to handle Netlify's environment
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- EXECUTING FINAL ARCHITECTURAL PATCH: V3.7 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const palette = { charcoal: "#333333", water: "#AACCFF" };

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this aerial photo into a high-quality site diagram.
      - STYLE: ${customInstructions || "Charcoal outlines (#333333), white building tops, and pale blue water (#AACCFF)."}
      - TECHNICAL: Pure white background, high contrast, FLAT COLORS ONLY. No gradients.`;

    // 1. AI Generation (~15-20s)
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 2. Speed Scaling (800px is the sweet spot for 20s processing)
    const traceSize = 800;
    const traceBuffer = await sharp(aiBuffer).resize(traceSize).toBuffer();

    // 3. FAIL-SAFE TRACING LOGIC
    // This function checks exactly how the library was loaded to prevent the "Not a function" error
    const getTracer = () => {
        if (typeof potrace.trace === 'function') return potrace.trace;
        if (typeof potrace === 'function') return potrace;
        // Fallback for some specific module environments
        return potrace.default ? potrace.default.trace : null;
    };

    const runTrace = (threshold, colorHex, layerName) => {
        const tracer = getTracer();
        if (!tracer) throw new Error("Vector engine failed to load.");

        return new Promise((resolve, reject) => {
            tracer(traceBuffer, { threshold, turdSize: 15, optTolerance: 1.0 }, (err, svg) => {
                if (err) return resolve('');
                // Extract paths and assign the specific firm color
                const paths = svg.match(/<path.*?\/>/g);
                if (!paths) return resolve('');
                
                const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
                resolve(`<g id="${layerName}">${coloredPaths}</g>`);
            });
        });
    };

    // 4. GENERATE EDITABLE LAYERS
    // Layer 1 (Medium Threshold) catches the Water/Shadows
    // Layer 2 (Low Threshold) catches ONLY the dark Charcoal Outlines
    console.log("Generating Vector Layers...");
    const [contextLayer, outlineLayer] = await Promise.all([
        runTrace(210, palette.water, "Site_Context"),
        runTrace(120, palette.charcoal, "Architectural_Outlines")
    ]);

    // 5. ASSEMBLE SVG FOR ILLUSTRATOR
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${traceSize} ${traceSize}" preserveAspectRatio="none">
            <rect width="${traceSize}" height="${traceSize}" fill="white"/>
            ${contextLayer}
            ${outlineLayer}
        </svg>`;

    const highResPng = await sharp(aiBuffer).resize(parseInt(width), parseInt(height)).toBuffer();

    console.log("Success! Duration: under 30s.");
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
    return { statusCode: 500, body: JSON.stringify({ error: "Pipeline Engine: " + error.message }) };
  }
};
