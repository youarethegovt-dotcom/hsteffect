const { GoogleGenerativeAI } = require("@google/generative-ai");
const ImageTracer = require("imagetracerjs");
const sharp = require("sharp");

exports.handler = async (event) => {
  console.log("--- EXECUTING SPEED-OPTIMIZED ENGINE: V3.3 ---");
  
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const defaultStyle = ".25mm dark charcoal outline around all buildings, .1mm thin gray lines for all of the building forms, roads to be a lighter gray tone, water represented with pale light blue, white masses for buildings with gray shade for the sides of the buildings in shadow, no text.";

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || defaultStyle}
      TECHNICAL: Use solid flat colors only. No gradients, no textures, no noise.`;

    // 1. Gemini Generation (usually 15-20s)
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;

    // 2. High-speed Resize
    console.log("Resizing...");
    const aiBuffer = await sharp(Buffer.from(pngBase64, 'base64'))
      .resize(parseInt(width), parseInt(height), { fit: 'fill' })
      .toBuffer();

    // 3. OPTIMIZED COLOR VECTORIZATION
    console.log("Tracing colors (Speed Mode)...");
    const svgData = ImageTracer.bufferToSVG(aiBuffer, {
        ltres: 1.5,        // Increased for speed (less "crunchy" paths)
        qtres: 1.5,        // Increased for speed
        numberofcolors: 5, // Reduced from 8 to 5 for faster layering
        mincolorratio: 0.05,
        pathomit: 32,      // Ignores tiny specks/noise to save time
        strokewidth: 0.5
    });

    console.log("Success! Sending to browser.");
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
    return { statusCode: 500, body: JSON.stringify({ error: "The process took too long. Try a smaller screenshot or simpler style." }) };
  }
};
