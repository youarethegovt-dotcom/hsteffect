const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- EXECUTING UNIVERSAL ENGINE: V4.0 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);
    const palette = { charcoal: "#333333", water: "#AACCFF" };

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || "Charcoal outlines (#333333) and pale blue water (#AACCFF)."}
      TECHNICAL: Pure white background. FLAT COLORS ONLY. No text. No gradients.`;

    // 1. AI Generation (~15s)
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 2. INTERNAL SPEED SCALING
    // 800px is the "Safe Zone" for 20-second processing on Netlify
    const traceSize = 800;
    const traceBuffer = await sharp(aiBuffer).resize(traceSize).toBuffer();

    // 3. THE UNIVERSAL TRACER
    // This logic handles almost any way the library might be loaded to prevent "Not a function" errors
    const safeTrace = (buffer, options) => {
        return new Promise((resolve, reject) => {
            // Find the function whether it's potrace.trace OR just potrace
            const traceFunc = potrace.trace || (typeof potrace === 'function' ? potrace : null);
            
            if (!traceFunc) return reject(new Error("Vector library failed to initialize properly."));
            
            traceFunc(buffer, options, (err, svg) => {
                if (err) return reject(err);
                resolve(svg);
            });
        });
    };

    const runLayer = async (threshold, colorHex, layerName) => {
        try {
            const svg = await safeTrace(traceBuffer, { threshold, turdSize: 20 });
            const paths = svg.match(/<path.*?\/>/g);
            if (!paths) return "";
            const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
            return `<g id="${layerName}">${coloredPaths}</g>`;
        } catch (e) {
            console.error(`Layer ${layerName} failed:`, e.message);
            return "";
        }
    };

    console.log("Starting Vector Passes...");
    // Sequential processing to keep CPU usage low and avoid 30s timeout
    const contextLayer = await runLayer(210, palette.water, "Site_Context_Blue");
    const outlineLayer = await runLayer(125, palette.charcoal, "Architectural_Outlines_Charcoal");

    // 4. ASSEMBLE SVG FOR ILLUSTRATOR
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${traceSize} ${traceSize}" preserveAspectRatio="none">
            <rect width="${traceSize}" height="${traceSize}" fill="white"/>
            ${contextLayer}
            ${outlineLayer}
        </svg>`;

    // Prepare the high-res PNG for download
    const highResPng = await sharp(aiBuffer).resize(parseInt(width), parseInt(height)).toBuffer();

    console.log("Success! Diagram Ready.");
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
    return { statusCode: 500, body: JSON.stringify({ error: "Engine v4.0 Error: " + error.message }) };
  }
};
