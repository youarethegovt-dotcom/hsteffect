const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");
const sharp = require("sharp");

exports.handler = async (event) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    // We define our 5 "firm standard" colors for the trace
    const palette = {
      charcoal: "#333333",
      grayLines: "#999999",
      roads: "#CCCCCC",
      water: "#AACCFF",
      shadows: "#666666"
    };

    const defaultStyle = `.25mm charcoal (#333333) outlines, .1mm gray (#999999) internal lines, 
      roads are light gray (#CCCCCC), water is pale light blue (#AACCFF), 
      white building masses with gray shadows (#666666). USE ONLY THESE SOLID COLORS.`;

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || defaultStyle}
      TECHNICAL: Pure white background. No gradients. Use ONLY the 5 specific hex colors requested.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;

    // 1. Resize the AI result to match your 1897px upload
    const aiBuffer = await sharp(Buffer.from(pngBase64, 'base64'))
      .resize(parseInt(width), parseInt(height), { fit: 'fill' })
      .toBuffer();

    // 2. LAYERED TRACING ENGINE
    // We trace the image once for the "Black/Charcoal" and once for the "Color" 
    // to keep the file size small but editable.
    
    const traceLayer = async (colorHex, threshold) => {
        return new Promise((resolve, reject) => {
            potrace.trace(aiBuffer, { threshold, turdSize: 5 }, (err, svg) => {
                if (err) reject(err);
                // We "re-color" the black trace to our target color
                const coloredSvg = svg.replace(/fill="black"/g, `fill="${colorHex}"`);
                // Extract just the <path> info
                const pathOnly = coloredSvg.match(/<path.*?\/>/g);
                resolve(pathOnly ? pathOnly.join('') : '');
            });
        });
    };

    // We create three primary vector layers: Outlines, Shadows, and Site Features
    const outlines = await traceLayer(palette.charcoal, 100);
    const waterAndShadows = await traceLayer(palette.water, 200);

    // 3. Construct the Master SVG
    const finalSvg = `
        <svg version="1.1" xmlns="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="100%" height="100%" fill="white"/>
            <g id="Water_and_Context">${waterAndShadows}</g>
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
