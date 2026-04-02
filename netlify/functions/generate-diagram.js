const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");
const sharp = require("sharp");

exports.handler = async (event) => {
  console.log("--- EXECUTING PRO-ARCHITECT ENGINE: V3.5 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const defaultStyle = ".25mm dark charcoal outline around all buildings, .1mm thin gray lines for all of the building forms, roads to be a lighter gray tone, water represented with pale light blue, white masses for buildings with gray shade for the sides of the buildings in shadow, not overly detailed, no text.";

    // We ask for HIGH CONTRAST to make the Illustrator paths perfect
    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || defaultStyle}
      TECHNICAL: Use pure white backgrounds and high-contrast charcoal lines. 
      This is for vectorization—ensure all building footprints are clearly closed shapes.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;

    // 1. Resize to match your 1897px upload
    const aiBuffer = await sharp(Buffer.from(pngBase64, 'base64'))
      .resize(parseInt(width), parseInt(height), { fit: 'fill' })
      .toBuffer();

    // 2. STABLE VECTORIZATION
    // Potrace produces the cleanest paths for CAD/Illustrator
    const svgData = await new Promise((resolve, reject) => {
      potrace.trace(aiBuffer, { 
        threshold: 180, // Higher threshold for cleaner architectural lines
        turdSize: 10,   // Ignores small visual "noise"
        optTolerance: 0.4 
      }, (err, svg) => {
        if (err) reject(err);
        resolve(svg);
      });
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: aiBuffer.toString('base64'), 
        svg: Buffer.from(svgData).toString('base64') 
      }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Engine Error: " + error.message }) };
  }
};
