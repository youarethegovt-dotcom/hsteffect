const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");
const sharp = require("sharp");

exports.handler = async (event) => {
  console.log("--- EXECUTING STEALTH ENGINE: V3.6 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const palette = { charcoal: "#333333", water: "#AACCFF" };

    // We tell the AI to be extremely "flat" and "graphic" for faster processing
    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || "Charcoal outlines (#333333) and pale blue water (#AACCFF)."}
      TECHNICAL: FLAT COLORS ONLY. No anti-aliasing. No textures. Pure white background.`;

    // 1. AI Drawing Phase
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 2. INTERNAL COMPRESSION (The Speed Key)
    // We downscale to 800px internally. This makes the vector math 10x faster.
    const traceSize = 800;
    const traceBuffer = await sharp(aiBuffer).resize(traceSize).toBuffer();

    // 3. SURGICAL COLOR EXTRACTION
    const traceLayer = async (threshold, colorHex) => {
        return new Promise((resolve) => {
            potrace.trace(traceBuffer, { 
                threshold, 
                turdSize: 15, // Ignores minor artifacts
                optTolerance: 1.0 
            }, (err, svg) => {
                if (err) return resolve('');
                const paths = svg.match(/<path.*?\/>/g);
                resolve(paths ? paths.join('').replace(/fill="black"/g, `fill="${colorHex}"`) : '');
            });
        });
    };

    // Sequential tracing is actually more stable on small servers
    console.log("Tracing Layer 1: Context...");
    const context = await traceLayer(220, palette.water);
    
    console.log("Tracing Layer 2: Outlines...");
    const outlines = await traceLayer(130, palette.charcoal);

    // 4. ASSEMBLE ILLUSTRATOR SVG
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${traceSize} ${traceSize}" preserveAspectRatio="none">
            <rect width="${traceSize}" height="${traceSize}" fill="white"/>
            <g id="Context_Water_Layers">${context}</g>
            <g id="Architectural_Outlines">${outlines}</g>
        </svg>`;

    // Output high-res PNG for the team
    const highResPng = await sharp(aiBuffer).resize(parseInt(width), parseInt(height)).toBuffer();

    console.log("Pipeline Complete. Sending results.");
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
    return { statusCode: 500, body: JSON.stringify({ error: "Pipeline Engine Stalled: " + error.message }) };
  }
};
