const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");
const sharp = require("sharp");

exports.handler = async (event) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const palette = {
      charcoal: "#333333",
      water: "#AACCFF"
    };

    const defaultStyle = ".25mm charcoal (#333333) outlines for buildings, pale light blue (#AACCFF) for all water, white building tops with gray shadows. No text.";

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || defaultStyle}
      TECHNICAL: Use ONLY solid hex colors #333333 and #AACCFF on a white background.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;

    const aiBuffer = await sharp(Buffer.from(pngBase64, 'base64'))
      .resize(parseInt(width), parseInt(height), { fit: 'fill' })
      .toBuffer();

    // SPEED FIX: We only trace the Charcoal (Outlines) at full detail.
    // We trace the "Context" (Water/Shadows) at a much lower detail to save time.
    
    const traceLayer = async (threshold, color, isDetailed) => {
        return new Promise((resolve, reject) => {
            potrace.trace(aiBuffer, { 
                threshold, 
                turdSize: isDetailed ? 5 : 25, // Large turdSize = Much faster trace
                optTolerance: isDetailed ? 0.4 : 1.5 
            }, (err, svg) => {
                if (err) reject(err);
                const paths = svg.match(/<path.*?\/>/g);
                const coloredPaths = paths ? paths.join('').replace(/fill="black"/g, `fill="${color}"`) : '';
                resolve(coloredPaths);
            });
        });
    };

    // Parallel processing to save seconds
    const [outlines, context] = await Promise.all([
        traceLayer(120, palette.charcoal, true),  // High Detail Outlines
        traceLayer(210, palette.water, false)    // Low Detail Speed Trace for Water/Shadows
    ]);

    const finalSvg = `
        <svg version="1.1" xmlns="http://www.w3.org/2000/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="100%" height="100%" fill="white"/>
            <g id="Context_Layers">${context}</g>
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
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
