const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");
const sharp = require("sharp");

exports.handler = async (event) => {
  console.log("--- STARTING NASHVILLE PRO PIPELINE ---");
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    // Firm Standard Palette
    const palette = { charcoal: "#333333", water: "#AACCFF" };

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || "Charcoal outlines, white building tops, blue water fills."}
      TECHNICAL: Pure white background. No text. Use only #333333 for lines and #AACCFF for water.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;

    // 1. Scale to Match Upload
    const aiBuffer = await sharp(Buffer.from(pngBase64, 'base64'))
      .resize(parseInt(width), parseInt(height), { fit: 'fill' })
      .toBuffer();

    // 2. Parallel Trace Layers
    const traceLayer = async (threshold, color, isDetailed) => {
        return new Promise((resolve) => {
            potrace.trace(aiBuffer, { 
                threshold, 
                turdSize: isDetailed ? 5 : 40, 
                optTolerance: isDetailed ? 0.4 : 1.5 
            }, (err, svg) => {
                if (err) return resolve('');
                const paths = svg.match(/<path.*?\/>/g);
                resolve(paths ? paths.join('').replace(/fill="black"/g, `fill="${color}"`) : '');
            });
        });
    };

    const [outlines, context] = await Promise.all([
        traceLayer(125, palette.charcoal, true), 
        traceLayer(215, palette.water, false)
    ]);

    // 3. Assemble the Illustrator-Ready SVG
    const finalSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="100%" height="100%" fill="white"/>
            <g id="Context_Layers" opacity="0.8">${context}</g>
            <g id="Architectural_Outlines">${outlines}</g>
        </svg>`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: aiBuffer.toString('base64'), 
        svg: Buffer.from(finalSvg).toString('base64') 
      }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
