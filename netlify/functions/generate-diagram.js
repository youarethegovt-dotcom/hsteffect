const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");
const sharp = require("sharp");

exports.handler = async (event) => {
  console.log("--- EXECUTING RELIABILITY PATCH: V3.5 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const palette = { charcoal: "#333333", water: "#AACCFF" };
    const defaultStyle = ".25mm charcoal (#333333) outlines for buildings, pale light blue (#AACCFF) for water.";

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || defaultStyle}
      TECHNICAL: Pure white background. High contrast. Use ONLY #333333 and #AACCFF.`;

    // 1. AI Generation
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 2. INTERNAL SCALING (The Secret to Speed)
    // We scale the "Tracing Buffer" to 1000px. This makes the vector math instant.
    const processingBuffer = await sharp(aiBuffer).resize(1000).toBuffer();

    // 3. Robust Trace Logic
    const traceLayer = async (threshold, color) => {
        return new Promise((resolve) => {
            // Check if potrace is loaded correctly
            const engine = potrace.trace ? potrace : require("potrace");
            
            engine.trace(processingBuffer, { threshold, turdSize: 10 }, (err, svg) => {
                if (err) return resolve('');
                const paths = svg.match(/<path.*?\/>/g);
                resolve(paths ? paths.join('').replace(/fill="black"/g, `fill="${color}"`) : '');
            });
        });
    };

    const [outlines, context] = await Promise.all([
        traceLayer(130, palette.charcoal), 
        traceLayer(210, palette.water)
    ]);

    // 4. Scale the SVG back up to your original dimensions via viewBox
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            <rect width="1000" height="1000" fill="white"/>
            <g id="Context_Layers">${context}</g>
            <g id="Architectural_Outlines">${outlines}</g>
        </svg>`;

    // Create the High-Res PNG return
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
    return { statusCode: 500, body: JSON.stringify({ error: "Pipeline Error: " + error.message }) };
  }
};
