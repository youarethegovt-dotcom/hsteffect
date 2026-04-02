const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- EXECUTING CONSTRUCTOR ENGINE: V3.9 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const palette = { charcoal: "#333333", water: "#AACCFF" };

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || "Charcoal outlines (#333333) and pale blue water (#AACCFF)."}
      TECHNICAL: FLAT COLORS ONLY. Pure white background. No text. No gradients.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // Internal scaling for speed (Your log showed 13s - this keeps it fast)
    const traceSize = 800;
    const traceBuffer = await sharp(aiBuffer).resize(traceSize).toBuffer();

    // NEW ROBUST TRACING LOGIC
    const runTrace = (threshold, colorHex, layerName) => {
        return new Promise((resolve, reject) => {
            // We use the 'Potrace' constructor instead of the '.trace' shorthand
            const trace = new potrace.Potrace();
            
            trace.setParameters({
                threshold: threshold,
                turdSize: 15,
                optTolerance: 1.0
            });

            trace.loadImage(traceBuffer, (err) => {
                if (err) {
                    console.error(`Trace Error [${layerName}]:`, err);
                    return resolve('');
                }
                
                const svg = trace.getSVG();
                const paths = svg.match(/<path.*?\/>/g);
                if (!paths) return resolve('');
                
                const coloredPaths = paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`);
                resolve(`<g id="${layerName}">${coloredPaths}</g>`);
            });
        });
    };

    console.log("Processing Layers...");
    // We run these one after another for maximum stability
    const contextLayer = await runTrace(215, palette.water, "Site_Context");
    const outlineLayer = await runTrace(125, palette.charcoal, "Architectural_Outlines");

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
